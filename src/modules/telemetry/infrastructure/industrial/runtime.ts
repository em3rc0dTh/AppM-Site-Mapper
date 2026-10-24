import { associateLogicalSignals, logicalRegistry } from './logical-points';
import { startIndustrialHistoryDelivery } from './timescale-outbox';
import { isProductionDeployment } from '@/config/env';
import {
  IndustrialInputError,
  normalizeObservations,
  type Envelope,
} from '@/modules/telemetry/domain/industrial/observations';
import { configuredIndustrialProfiles } from './profile-config';
import { MemoryObservationStore, MongoObservationStore, type ObservationStore } from './store';
import { getPersistenceMode } from '@/modules/topology/infrastructure/topology-repository-factory';
import { getClient, getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export function industrialProfiles() {
  return configuredIndustrialProfiles();
}
export async function getObservationStore(): Promise<ObservationStore> {
  const holder = getProcessSingleton<{ promise?: Promise<ObservationStore> }>(
    'industrial-observation-store',
    () => ({}),
  );
  if (!holder.promise) {
    holder.promise = (async () => {
      if (getPersistenceMode() === 'memory') {
        if (isProductionDeployment())
          throw new Error('Industrial capture requires durable persistence');
        return new MemoryObservationStore();
      }
      const store = new MongoObservationStore(
        await getMongoDatabase(),
        await getClient(),
        Number(process.env.INDUSTRIAL_RETENTION_DAYS ?? 90),
      );
      await store.initialize();
      startIndustrialHistoryDelivery();
      return store;
    })();
    holder.promise.catch(() => {
      delete holder.promise;
    });
  }
  return holder.promise;
}

export async function captureIndustrial(envelope: Envelope) {
  const profile = industrialProfiles().find(
    (p) => p.protocol === envelope.protocol && p.sourceIdentity === envelope.sourceIdentity,
  );
  if (!profile) throw new IndustrialInputError('Industrial source is not commissioned');
  const batch = normalizeObservations(envelope, profile);
  batch.signals = associateLogicalSignals(batch.signals, await logicalRegistry());
  const disposition = await (await getObservationStore()).commit(batch);
  return { batch, disposition };
}
