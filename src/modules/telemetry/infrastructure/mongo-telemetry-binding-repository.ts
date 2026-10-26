import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';
import { getClient } from '@/shared/infrastructure/mongodb/client';

import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

type BindingDocument = TelemetryBinding & Document;

function toDomain(document: BindingDocument): TelemetryBinding {
  const copy = { ...document } as Record<string, unknown>;
  delete copy._id;
  return copy as unknown as TelemetryBinding;
}

export class MongoTelemetryBindingRepository implements TelemetryBindingRepository {
  private readonly collection: Collection<BindingDocument>;

  constructor(database: Db) {
    this.collection = database.collection<BindingDocument>('telemetry_bindings');
  }

  async listForSource(
    protocol: TelemetryBinding['protocol'],
    sourceIdentity: string,
  ): Promise<readonly TelemetryBinding[]> {
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE', protocol, sourceIdentity })
      .sort({ sourcePointId: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async listForTarget(
    targetType: TelemetryBinding['targetType'],
    targetId: string,
  ): Promise<readonly TelemetryBinding[]> {
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE', targetType, targetId })
      .sort({ sourceIdentity: 1, sourcePointId: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async listForTargets(
    targetType: TelemetryBinding['targetType'],
    targetIds: readonly string[],
  ): Promise<readonly TelemetryBinding[]> {
    const ids = [...new Set(targetIds)];
    if (ids.length === 0) return [];
    const documents = await this.collection
      .find({ lifecycle: 'ACTIVE', targetType, targetId: { $in: ids } })
      .sort({ targetId: 1, sourceIdentity: 1, sourcePointId: 1 })
      .toArray();
    return documents.map(toDomain);
  }

  async insert(binding: TelemetryBinding): Promise<void> {
    await this.collection.insertOne(binding as OptionalUnlessRequiredId<BindingDocument>);
  }

  async insertBatch(bindings: readonly TelemetryBinding[]): Promise<void> {
    if (!bindings.length) return;
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        await this.collection.insertMany(
          bindings as OptionalUnlessRequiredId<BindingDocument>[],
          { session, ordered: true },
        );
      });
    } finally {
      await session.endSession();
    }
  }

  async archiveBatch(bindings: readonly TelemetryBinding[]): Promise<void> {
    if (!bindings.length) return;
    const session = (await getClient()).startSession();
    try {
      await session.withTransaction(async () => {
        for (const binding of bindings) {
          const result = await this.collection.replaceOne(
            { id: binding.id, lifecycle: 'ACTIVE' },
            binding as OptionalUnlessRequiredId<BindingDocument>,
            { session },
          );
          if (result.matchedCount !== 1) throw new Error('STALE_BINDING');
        }
      });
    } finally {
      await session.endSession();
    }
  }

  async replace(binding: TelemetryBinding): Promise<void> {
    const result = await this.collection.replaceOne(
      { id: binding.id },
      binding as OptionalUnlessRequiredId<BindingDocument>,
    );
    if (result.matchedCount !== 1)
      throw new Error('TelemetryBinding does not exist: ' + binding.id);
  }
}
