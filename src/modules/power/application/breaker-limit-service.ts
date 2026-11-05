import { randomUUID } from 'node:crypto';
import type { Db, Document, OptionalUnlessRequiredId } from 'mongodb';

import type { EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import type { AlarmPolicy } from '@/modules/alarm/domain/policy';
import { readBreakerProtection, type BreakerProtectionInput, type BreakerProtection } from '@/modules/power/domain/breaker-protection';
import { withIntegrityTransaction } from '@/shared/infrastructure/mongodb/integrity-transaction';

const CONTEXT_PREFIX = 'breaker-limits:';

export interface BreakerLimitView {
  readonly breakerId: string;
  readonly breakerName: string;
  readonly panelId: string;
  readonly panelName: string;
  readonly deviceId: string;
  readonly revision: number;
  readonly protection: BreakerProtection | null;
  readonly policy: AlarmPolicy['overcurrent'] | null;
}

type BreakerLimitEvent = {
  readonly id: string;
  readonly breakerId: string;
  readonly deviceId: string;
  readonly panelId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly before: BreakerProtection | null;
  readonly after: BreakerProtection;
  readonly policyId: string;
};

function safeBreaker(node: TopologyNode | null): EquipmentNode {
  if (!node || node.kind !== 'EQUIPMENT' || node.equipmentType !== 'CIRCUIT_BREAKER' ||
      node.lifecycle !== 'ACTIVE' || node.retirement) throw new Error('BREAKER_NOT_FOUND');
  return node;
}

export class BreakerLimitService {
  constructor(private readonly db: Db) {}

  private async context(id: string, session?: import('mongodb').ClientSession) {
    const nodes = this.db.collection<TopologyNode & Document>('topology_nodes');
    const breaker = safeBreaker(await nodes.findOne({ id }, { session }));
    const panel = breaker.parentEquipmentId
      ? await nodes.findOne({ id: breaker.parentEquipmentId }, { session })
      : null;
    const device = await nodes.findOne({ id: breaker.deviceId }, { session });
    if (!panel || panel.kind !== 'EQUIPMENT' || panel.equipmentType !== 'PANEL' ||
        panel.lifecycle !== 'ACTIVE' || panel.retirement || panel.deviceId !== breaker.deviceId ||
        !device || device.kind !== 'DEVICE' || device.deviceType !== 'BDFB' ||
        device.lifecycle !== 'ACTIVE' || device.retirement) throw new Error('BREAKER_TOPOLOGY_CONFLICT');
    if (!panel.children.includes(breaker.id)) throw new Error('BREAKER_TOPOLOGY_CONFLICT');
    return { breaker, panel, device };
  }

  async get(id: string): Promise<BreakerLimitView> {
    const {breaker, panel, device} = await this.context(id);
    const policies = await this.db.collection<AlarmPolicy & Document>('alarm_policies')
      .find({ targetType: 'EQUIPMENT', targetId: id, overcurrent: { $exists: true } }).toArray();
    if (policies.length > 1) throw new Error('BREAKER_POLICY_AMBIGUOUS');
    return {
      breakerId: breaker.id,
      breakerName: breaker.name,
      panelId: panel.id,
      panelName: panel.name,
      deviceId: device.id,
      revision: breaker.revision ?? 0,
      protection: readBreakerProtection(breaker.attributes),
      policy: policies[0]?.overcurrent ?? null,
    };
  }

  async update(id: string, input: BreakerProtectionInput, actorId: string): Promise<BreakerLimitView> {
    await withIntegrityTransaction(this.db, async session => {
      const { breaker, panel, device } = await this.context(id, session);
      if ((breaker.revision ?? 0) !== input.expectedRevision) throw new Error('BREAKER_STALE_WRITE');

      const before = readBreakerProtection(breaker.attributes);
      if (breaker.attributes?.breakerProtection !== undefined && !before) {
        throw new Error('BREAKER_EXISTING_RATING_INVALID');
      }
      // Older field-survey workflows may persist the nominal rating directly on
      // attributes. Never silently replace that fact with a provisional standard.
      const legacyRating = breaker.attributes?.ratedCurrentA;
      const legacySource = breaker.attributes?.ratedCurrentProvenance;
      if (legacyRating !== undefined && (
        typeof legacyRating !== 'number' || !Number.isFinite(legacyRating) || legacyRating <= 0
      )) throw new Error('BREAKER_EXISTING_RATING_INVALID');
      if (typeof legacyRating === 'number' &&
          (input.provenance.source === 'PROVISIONAL_STANDARD' || input.ratedCurrentA !== legacyRating)) {
        throw new Error('EXISTING_RATING_REQUIRES_RECONCILIATION');
      }
      if (legacySource && typeof legacySource === 'object' && !Array.isArray(legacySource) &&
          (legacySource as {verified?:unknown}).verified === true && !input.provenance.verified) {
        throw new Error('VERIFIED_RATING_DOWNGRADE_FORBIDDEN');
      }
      if (before?.provenance.verified && !input.provenance.verified) {
        throw new Error('VERIFIED_RATING_DOWNGRADE_FORBIDDEN');
      }
      const bindings = await this.db.collection('telemetry_bindings').find({
        targetType: 'EQUIPMENT', targetId: id, protocol: 'MQTT',
        metric: 'CURRENT', lifecycle: 'ACTIVE',
      }, { session }).toArray();
      if (bindings.length !== 1 || typeof bindings[0]?.sourceIdentity !== 'string') {
        throw new Error('BREAKER_CURRENT_BINDING_REQUIRED');
      }

      const policies = this.db.collection<AlarmPolicy & Document>('alarm_policies');
      const existing = await policies.find({
        targetType: 'EQUIPMENT', targetId: id, overcurrent: { $exists: true },
      }, { session }).toArray();
      if (existing.length > 1) throw new Error('BREAKER_POLICY_AMBIGUOUS');
      const now = new Date().toISOString();
      const after: BreakerProtection = {
        ratedCurrentA: input.ratedCurrentA,
        assertAboveA: input.assertAboveA,
        clearBelowA: input.clearBelowA,
        provenance: input.provenance,
        updatedAt: now,
        updatedBy: actorId,
      };
      const policy = existing[0];
      if (policy?.sourceIdentity && policy.sourceIdentity !== bindings[0]!.sourceIdentity) {
        throw new Error('BREAKER_POLICY_SOURCE_MISMATCH');
      }
      const overcurrent = {
        ...(policy?.overcurrent ?? {}),
        assertAboveA: input.assertAboveA,
        clearBelowA: input.clearBelowA,
        debounceSamples: policy?.overcurrent?.debounceSamples ?? 2,
        recoverySamples: policy?.overcurrent?.recoverySamples ?? 2,
        severity: policy?.overcurrent?.severity ?? 'CRITICAL' as const,
      };
      const policyId = policy?.id ?? `${CONTEXT_PREFIX}${id}`;
      const nodes = this.db.collection('topology_nodes');
      const revisionFilter = breaker.revision === undefined
        ? { revision: { $exists: false }, updatedAt: breaker.updatedAt }
        : { revision: breaker.revision };
      const result = await nodes.updateOne(
        { id, kind: 'EQUIPMENT', equipmentType: 'CIRCUIT_BREAKER', lifecycle: 'ACTIVE', ...revisionFilter },
        { $set: { 'attributes.breakerProtection': after, revision: (breaker.revision ?? 0) + 1, updatedAt: now } },
        { session },
      );
      if (result.matchedCount !== 1) throw new Error('BREAKER_STALE_WRITE');

      if (policy) {
        const updated = await policies.updateOne(
          { id: policy.id, updatedAt: policy.updatedAt },
          { $set: { overcurrent, updatedAt: now } },
          { session },
        );
        if (updated.matchedCount !== 1) throw new Error('BREAKER_POLICY_STALE_WRITE');
      } else {
        const created: AlarmPolicy = {
          id: policyId, targetType: 'EQUIPMENT', targetId: id,
          sourceContext: `${CONTEXT_PREFIX}${id}`,
          sourceIdentity: bindings[0]!.sourceIdentity as string,
          enabled: true, overcurrent, createdAt: now, updatedAt: now,
        };
        await policies.insertOne(created as OptionalUnlessRequiredId<AlarmPolicy & Document>, { session });
      }
      const event: BreakerLimitEvent = {
        id: randomUUID(), breakerId: id, deviceId: device.id, panelId: panel.id,
        actorId, occurredAt: now, before, after, policyId,
      };
      await this.db.collection<BreakerLimitEvent & Document>('breaker_limit_events').insertOne(event as OptionalUnlessRequiredId<BreakerLimitEvent & Document>, { session });
    });
    return this.get(id);
  }

  async history(id: string): Promise<readonly BreakerLimitEvent[]> {
    await this.context(id);
    return this.db.collection<BreakerLimitEvent & Document>('breaker_limit_events')
      .find({ breakerId: id }, { projection: { _id: 0 } })
      .sort({ occurredAt: -1 }).limit(100).toArray();
  }
}
