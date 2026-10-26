import type { ClientSession } from 'mongodb';
import type { TopologyNode } from '@/modules/topology/domain/entities';
import { rawPointForPosition } from '@/modules/topology/domain/telemetry-point-prefix';
import { versionFilter } from '@/modules/topology/infrastructure/topology-version';
import { requireActiveAncestry } from '@/shared/infrastructure/mongodb/reference-guards';
import {
  withIntegrityTransaction,
  IntegrityConflict,
} from '@/shared/infrastructure/mongodb/integrity-transaction';
import type { Collection, Db, Document, OptionalUnlessRequiredId } from 'mongodb';

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

  constructor(private readonly database: Db) {
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

  private async guard(binding: TelemetryBinding, session: ClientSession): Promise<void> {
    const topology = this.database.collection('topology_nodes');
    const target =
      binding.targetType === 'ACCESS_PORT'
        ? await topology.findOne(
            {
              kind: 'EQUIPMENT',
              lifecycle: 'ACTIVE',
              accessPorts: { $elemMatch: { id: binding.targetId, lifecycle: 'ACTIVE' } },
            },
            { session },
          )
        : await topology.findOne(
            { id: binding.targetId, kind: binding.targetType, lifecycle: 'ACTIVE' },
            { session },
          );
    if (!target) throw new IntegrityConflict('REFERENCE_NOT_ACTIVE');
    await requireActiveAncestry(this.database, target.id, session);
    const others = await this.collection
      .find(
        {
          lifecycle: 'ACTIVE',
          targetType: binding.targetType,
          targetId: binding.targetId,
          id: { $ne: binding.id },
        },
        { session },
      )
      .toArray();
    if (
      others.some(
        (other) =>
          (other.protocol === binding.protocol &&
            other.sourceIdentity !== binding.sourceIdentity) ||
          (other.metric === binding.metric &&
            (other.protocol !== binding.protocol ||
              other.sourceIdentity !== binding.sourceIdentity ||
              other.sourcePointId !== binding.sourcePointId)),
      )
    ) {
      throw new IntegrityConflict('BINDING_OWNER_CONFLICT');
    }
    if (binding.attributes?.panelId) {
      const panel = await topology.findOne(
        { id: binding.attributes.panelId, kind: 'EQUIPMENT', lifecycle: 'ACTIVE' },
        { session },
      );
      const position = binding.attributes.position;
      if (
        !panel ||
        typeof position !== 'number' ||
        panel.children?.[position - 1] !== target.id ||
        target.parentEquipmentId !== panel.id ||
        target.deviceId !== panel.deviceId ||
        panel.serialNumber !== binding.sourceIdentity ||
        rawPointForPosition(panel.telemetryPointPrefix, position) !== binding.sourcePointId
      ) {
        throw new IntegrityConflict('COMMISSIONING_TOPOLOGY_CONFLICT');
      }
    }
    const provenanceIds = [
      binding.attributes?.sourceEquipmentId,
      binding.attributes?.transportEquipmentId,
      binding.attributes?.observedEquipmentId,
      binding.attributes?.meterEquipmentId,
      binding.attributes?.gatewayEquipmentId,
    ].filter((id): id is string => typeof id === 'string' && Boolean(id));
    for (const id of provenanceIds) {
      const equipment = await topology.findOne(
        { id, kind: 'EQUIPMENT', lifecycle: 'ACTIVE' },
        { session },
      );
      if (!equipment || equipment.deviceId !== target.deviceId) {
        throw new IntegrityConflict('COMMISSIONING_TOPOLOGY_CONFLICT');
      }
    }
    if (
      typeof binding.attributes?.observedEquipmentId === 'string' &&
      binding.attributes.observedEquipmentId !== target.id
    ) {
      throw new IntegrityConflict('COMMISSIONING_TOPOLOGY_CONFLICT');
    }
  }

  async commitBindings(
    bindings: readonly TelemetryBinding[],
    expectedTopology: readonly TopologyNode[],
  ): Promise<readonly string[]> {
    return withIntegrityTransaction(this.database, async (session) => {
      for (const node of expectedTopology) {
        if (
          !(await this.database
            .collection('topology_nodes')
            .findOne({ ...versionFilter(node), lifecycle: 'ACTIVE' }, { session }))
        )
          throw new IntegrityConflict('COMMISSIONING_TOPOLOGY_CONFLICT');
      }
      const created: string[] = [];
      for (const binding of bindings) {
        await this.guard(binding, session);
        const existing = await this.collection.findOne(
          {
            lifecycle: 'ACTIVE',
            protocol: binding.protocol,
            sourceIdentity: binding.sourceIdentity,
            sourcePointId: binding.sourcePointId ?? { $exists: false },
            metric: binding.metric,
          },
          { session },
        );
        if (existing) {
          if (
            existing.targetId !== binding.targetId ||
            existing.targetType !== binding.targetType ||
            existing.unit !== binding.unit ||
            [
              'commissioning',
              'panelId',
              'position',
              'bdfbDeviceId',
              'equipmentId',
              'feedName',
              'measurementSource',
              'sourceEquipmentId',
              'transportEquipmentId',
              'observedEquipmentId',
              'meterEquipmentId',
              'gatewayEquipmentId',
              'channel',
            ].some((key) => existing.attributes?.[key] !== binding.attributes?.[key])
          )
            throw new IntegrityConflict('BINDING_CONFLICT');
          continue;
        }
        await this.collection.insertOne(
          { ...binding, revision: 1 } as OptionalUnlessRequiredId<BindingDocument>,
          { session },
        );
        created.push(binding.id);
      }
      return created;
    });
  }

  async insert(binding: TelemetryBinding): Promise<void> {
    const created = await this.commitBindings([binding], []);
    if (!created.length)
      throw Object.assign(new Error('Telemetry binding already exists'), { code: 11000 });
  }

  async insertBatch(bindings: readonly TelemetryBinding[]): Promise<void> {
    if (!bindings.length) return;
    await withIntegrityTransaction(this.database, async (session) => {
      for (const binding of bindings) {
        await this.guard(binding, session);
        const existing = await this.collection.findOne(
          {
            lifecycle: 'ACTIVE',
            protocol: binding.protocol,
            sourceIdentity: binding.sourceIdentity,
            sourcePointId: binding.sourcePointId ?? { $exists: false },
            metric: binding.metric,
          },
          { session },
        );
        if (existing) throw Object.assign(new Error('SOURCE_POINT_ALREADY_BOUND'), { code: 11000 });
        await this.collection.insertOne(
          { ...binding, revision: 1 } as OptionalUnlessRequiredId<BindingDocument>,
          { session },
        );
      }
    });
  }

  async archiveBatch(bindings: readonly TelemetryBinding[]): Promise<void> {
    if (!bindings.length) return;
    await withIntegrityTransaction(this.database, async (session) => {
      for (const binding of bindings) {
        const previous = await this.collection.findOne(
          { id: binding.id, lifecycle: 'ACTIVE' },
          { session },
        );
        if (!previous) throw new Error('STALE_BINDING');
        if (
          previous.protocol !== binding.protocol ||
          previous.sourceIdentity !== binding.sourceIdentity ||
          previous.sourcePointId !== binding.sourcePointId ||
          previous.metric !== binding.metric ||
          previous.targetId !== binding.targetId ||
          previous.targetType !== binding.targetType
        ) {
          throw new IntegrityConflict('BINDING_CONFLICT');
        }
        const revisionFilter =
          previous.revision === undefined
            ? { revision: { $exists: false } }
            : { revision: previous.revision };
        const result = await this.collection.updateOne(
          { id: binding.id, lifecycle: 'ACTIVE', ...revisionFilter },
          {
            $set: {
              lifecycle: 'ARCHIVED',
              updatedAt: binding.updatedAt,
              ...(binding.attributes ? { attributes: binding.attributes } : {}),
              revision: (previous.revision ?? 0) + 1,
            },
          },
          { session },
        );
        if (result.matchedCount !== 1) throw new Error('STALE_BINDING');
      }
    });
  }

  async replace(binding: TelemetryBinding): Promise<void> {
    await withIntegrityTransaction(this.database, async (session) => {
      const previous = await this.collection.findOne({ id: binding.id }, { session });
      if (
        !previous ||
        previous.revision !== binding.revision ||
        previous.protocol !== binding.protocol ||
        previous.sourceIdentity !== binding.sourceIdentity ||
        previous.sourcePointId !== binding.sourcePointId ||
        previous.metric !== binding.metric
      )
        throw new IntegrityConflict('BINDING_CONFLICT');
      if (previous.targetId !== binding.targetId || previous.targetType !== binding.targetType) {
        // Preserve the existing unique-SN Device -> root Chassis identity upgrade,
        // but prove it again inside the same fenced transaction.
        const chassis = await this.database.collection('topology_nodes').findOne(
          {
            id: binding.targetId,
            kind: 'EQUIPMENT',
            equipmentType: 'CHASSIS',
            lifecycle: 'ACTIVE',
            parentEquipmentId: null,
            deviceId: previous.targetId,
            serialNumber: binding.sourceIdentity,
          },
          { session },
        );
        if (
          previous.targetType !== 'DEVICE' ||
          binding.targetType !== 'EQUIPMENT' ||
          previous.metric !== 'SOURCE' ||
          previous.attributes?.discovery !== 'UNIQUE_INVENTORY_SN' ||
          previous.attributes.matchedNodeId !== binding.targetId ||
          !chassis
        )
          throw new IntegrityConflict('BINDING_CONFLICT');
      }
      if (binding.lifecycle === 'ACTIVE') await this.guard(binding, session);
      if (previous.lifecycle === 'ARCHIVED' && binding.lifecycle === 'ACTIVE')
        throw new IntegrityConflict('EXPLICIT_RECOMMISSIONING_REQUIRED');
      await this.collection.updateOne(
        { id: binding.id },
        {
          $set: {
            revision: (previous.revision ?? 0) + 1,
            targetId: binding.targetId,
            targetType: binding.targetType,
            lifecycle: binding.lifecycle,
            updatedAt: binding.updatedAt,
            ...(binding.attributes ? { attributes: binding.attributes } : {}),
          },
        },
        { session },
      );
    });
  }
}
