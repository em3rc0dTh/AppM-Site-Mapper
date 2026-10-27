import { createHash, randomUUID } from 'node:crypto';
import type { Document } from 'mongodb';
import type { TopologyNode, EquipmentNode } from '@/modules/topology/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { PowerRepository } from '@/modules/power/application/power-repository';
import type { PowerPath } from '@/modules/power/domain/entities';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { freeCas, initializeCas } from '@/modules/rack/domain/cas';
import { recordAdminAudit } from '@/modules/settings/infrastructure/admin-audit';
import { getMongoDatabase } from '@/shared/infrastructure/mongodb/client';
import { integrityOptions, IntegrityConflict, withIntegrityTransaction } from '@/shared/infrastructure/mongodb/integrity-transaction';

export type DeletionMode = 'SINGLE' | 'TREE';

export interface DeletionPreview {
  readonly id: string;
  readonly name: string;
  readonly kind: TopologyNode['kind'];
  readonly mode: DeletionMode;
  readonly totalNodes: number;
  readonly equipmentCount: number;
  readonly deviceCount: number;
  readonly powerPathCount: number;
  readonly bindingCount: number;
  readonly occupiedCasCount: number;
  readonly hasChildren: boolean;
  readonly token: string;
}

interface DeletionPlan {
  readonly root: TopologyNode;
  readonly nodes: readonly TopologyNode[];
  readonly neighbors: readonly TopologyNode[];
  readonly powerPaths: readonly PowerPath[];
  readonly bindings: readonly TelemetryBinding[];
  readonly preview: DeletionPreview;
}

const MAX_NODES = 2000;

function conflict(code: string): never {
  throw new IntegrityConflict(code);
}

/**
 * Deletion is a historical retirement, NOT a physical delete.
 * Telemetry samples, identity, original composition and archived links remain queryable for audit.
 * The production mutation requires MongoDB so topology, power, bindings and audit share one transaction.
 */
export class TopologyDeletionService {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly power: PowerRepository,
    private readonly bindings: TelemetryBindingRepository,
  ) {}

  private async prepare(id: string, mode: DeletionMode): Promise<DeletionPlan> {
    const root = await this.topology.getById(id);
    if (!root || root.lifecycle !== 'ACTIVE') conflict('ENTITY_NOT_ACTIVE');

    const nodes: TopologyNode[] = [];
    const seen = new Set<string>();
    const pending = [root];
    while (pending.length) {
      const current = pending.shift()!;
      if (seen.has(current.id)) conflict('INVALID_TOPOLOGY_CYCLE');
      seen.add(current.id);
      nodes.push(current);
      if (nodes.length > MAX_NODES) conflict('DELETION_TOO_LARGE');
      const children = (await this.topology.listChildren(current.id)).filter(
        (child) => child.lifecycle === 'ACTIVE',
      );
      pending.push(...children);
    }
    const hasChildren = nodes.length > 1;
    const targetNodes = mode === 'TREE' ? nodes : [root];
    const targetIds = new Set(targetNodes.map((node) => node.id));
    const equipment = targetNodes.filter((node): node is EquipmentNode => node.kind === 'EQUIPMENT');
    const portIds = new Set(equipment.flatMap((node) => node.accessPorts.map((port) => port.id)));

    const neighborIds = new Set<string>();
    if (root.kind === 'EQUIPMENT' && root.parentId && !targetIds.has(root.parentId))
      neighborIds.add(root.parentId);
    for (const item of targetNodes) {
      if (item.kind === 'EQUIPMENT' && item.rackPlacement &&
          !targetIds.has(item.rackPlacement.rackId))
        neighborIds.add(item.rackPlacement.rackId);
    }
    const neighbors: TopologyNode[] = [];
    for (const neighborId of neighborIds) {
      const neighbor = await this.topology.getById(neighborId);
      if (!neighbor || neighbor.lifecycle !== 'ACTIVE') conflict('INVALID_PHYSICAL_REFERENCE');
      neighbors.push(neighbor);
    }

    const db = await getMongoDatabase();
    const portList = [...portIds];
    const ids = [...targetIds];
    const [powerPaths, bindings] = await Promise.all([
      portList.length
        ? db.collection<PowerPath & Document>('power_paths').find({
            lifecycle: 'ACTIVE',
            $or: [
              { sourceAccessPortId: { $in: portList } },
              { targetAccessPortId: { $in: portList } },
            ],
          }, integrityOptions()).toArray()
        : Promise.resolve([] as PowerPath[]),
      db.collection<TelemetryBinding & Document>('telemetry_bindings').find({
        lifecycle: 'ACTIVE',
        $or: [
          { targetId: { $in: ids } },
          { targetType: 'ACCESS_PORT', targetId: { $in: portList } },
          { 'attributes.panelId': { $in: ids } },
          { 'attributes.matchedNodeId': { $in: ids } },
        ],
      }, integrityOptions()).toArray(),
    ]);

    if (powerPaths.length + bindings.length > 5000) conflict('DELETE_TOO_MANY_REFERENCES');

    for (const item of targetNodes) {
      if (item.kind !== 'CONTAINER_RACK') continue;
      for (const allocation of item.cas) {
        if (allocation.state === 'EQUIPPED' &&
            (!allocation.occupantId || !targetIds.has(allocation.occupantId)))
          conflict('RACK_CONTAINS_EXTERNAL_OCCUPANT');
      }
    }

    let occupiedCasCount = 0;
    for (const item of equipment) {
      if (!item.rackPlacement) continue;
      const rack = [...targetNodes, ...neighbors].find(
        (candidate) => candidate.id === item.rackPlacement!.rackId,
      );
      if (!rack || rack.kind !== 'CONTAINER_RACK') conflict('CAS_REFERENCE_CONFLICT');
      if (!rack.cas.some((range) => range.state === 'EQUIPPED' && range.occupantId === item.id))
        conflict('CAS_REFERENCE_CONFLICT');
      occupiedCasCount += 1;
    }

    // Canonicalize the full mutable snapshot: a confirmation expires on any relevant change.
    const snapshot = [...targetNodes, ...neighbors, ...powerPaths, ...bindings]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((value) => JSON.stringify(value));
    const token = createHash('sha256').update(JSON.stringify({ mode, snapshot })).digest('hex');
    return {
      root,
      nodes: targetNodes,
      neighbors,
      powerPaths,
      bindings,
      preview: {
        id: root.id,
        name: root.name,
        kind: root.kind,
        mode,
        totalNodes: targetNodes.length,
        equipmentCount: equipment.length,
        deviceCount: targetNodes.filter((node) => node.kind === 'DEVICE').length,
        powerPathCount: powerPaths.length,
        bindingCount: bindings.length,
        occupiedCasCount,
        hasChildren,
        token,
      },
    };
  }

  async preview(id: string, mode: DeletionMode): Promise<DeletionPreview> {
    return (await this.prepare(id, mode)).preview;
  }

  async delete(
    id: string,
    input: { mode: DeletionMode; name: string; token: string },
    actorId: string,
  ): Promise<{ operationId: string; preview: DeletionPreview }> {
    const db = await getMongoDatabase();
    return withIntegrityTransaction(db, async () => {
      // Recalculate while holding the canonical write fence. Browser previews are never trusted.
      const plan = await this.prepare(id, input.mode);
      if (plan.root.name !== input.name || !input.name)
        conflict('DELETE_NAME_MISMATCH');
      if (plan.preview.token !== input.token) conflict('DELETE_PREVIEW_STALE');
      if (input.mode === 'SINGLE' && plan.preview.hasChildren)
        conflict('HAS_ACTIVE_CHILDREN');
      // A Device must not be left without its sole physical root Equipment.
      if (plan.root.kind === 'EQUIPMENT' && plan.root.parentEquipmentId === null) {
        const parent = plan.neighbors.find((node) => node.id === plan.root.parentId);
        if (parent?.kind === 'DEVICE' &&
            parent.rootEquipmentIds.filter((rootId) => rootId !== plan.root.id).length === 0)
          conflict('DELETE_OWNING_DEVICE_INSTEAD');
      }
      if (!this.topology.commitLayout || !this.bindings.archiveBatch)
        conflict('ATOMIC_DELETION_REQUIRED');

      const timestamp = new Date().toISOString();
      const operationId = randomUUID();
      const affected = new Set(plan.nodes.map((node) => node.id));
      const updates = new Map<string, TopologyNode>();
      for (const node of plan.nodes) {
        const retired = {
          ...node,
          lifecycle: 'ARCHIVED' as const,
          updatedAt: timestamp,
          retirement: { operationId, actorId, at: timestamp, mode: input.mode },
          ...(node.kind === 'EQUIPMENT'
            ? { accessPorts: node.accessPorts.map((port) => ({
                ...port,
                lifecycle: 'ARCHIVED' as const,
              })) }
            : {}),
          ...(node.kind === 'CONTAINER_RACK' && node.totalU
            ? { cas: initializeCas(node.totalU) }
            : {}),
        } as TopologyNode;
        updates.set(node.id, retired);
      }

      // Only the edge to the surviving parent is disconnected.
      const outerParent = plan.neighbors.find((node) => node.id === plan.root.parentId);
      if (plan.root.kind === 'EQUIPMENT' && outerParent) {
        if (outerParent.kind === 'DEVICE') {
          updates.set(outerParent.id, {
            ...outerParent,
            rootEquipmentIds: outerParent.rootEquipmentIds.filter((child) => child !== id),
            updatedAt: timestamp,
          });
        } else if (outerParent.kind === 'EQUIPMENT') {
          const children = outerParent.children.map((child) => child === id ? null : child);
          updates.set(outerParent.id, {
            ...outerParent,
            children: outerParent.childMode === 'POSITIONAL'
              ? children : children.filter((child) => child !== null),
            updatedAt: timestamp,
          });
        } else conflict('INVALID_PHYSICAL_REFERENCE');
      }

      // Clear only retired occupants. Other allocations and Rack capacity stay untouched.
      for (const node of plan.nodes) {
        if (node.kind !== 'EQUIPMENT' || !node.rackPlacement) continue;
        const rackId = node.rackPlacement.rackId;
        if (affected.has(rackId)) continue; // The archived Rack is already reset.
        const original = plan.neighbors.find((neighbor) => neighbor.id === rackId);
        if (!original || original.kind !== 'CONTAINER_RACK' || !original.totalU)
          conflict('CAS_REFERENCE_CONFLICT');
        const rack = updates.get(rackId) ?? original;
        if (rack.kind !== 'CONTAINER_RACK') conflict('CAS_REFERENCE_CONFLICT');
        const allocation = rack.cas.find((range) =>
          range.state === 'EQUIPPED' && range.occupantId === node.id);
        if (!allocation) conflict('CAS_REFERENCE_CONFLICT');
        const freed = freeCas(rack.cas, rack.totalU!, allocation.id);
        if (!freed.ok) conflict('CAS_REFERENCE_CONFLICT');
        updates.set(rackId, { ...rack, cas: freed.ranges, updatedAt: timestamp });
      }

      // Retire live links first, so topology reference guards see a consistent final graph.
      for (const path of plan.powerPaths)
        await this.power.replace({ ...path, lifecycle: 'ARCHIVED', updatedAt: timestamp });
      await this.bindings.archiveBatch(plan.bindings.map((binding) =>
        ({ ...binding, lifecycle: 'ARCHIVED' as const, updatedAt: timestamp })));

      const original = [...plan.nodes, ...plan.neighbors].filter((node) => updates.has(node.id));
      if (!(await this.topology.commitLayout(original, [...updates.values()])))
        conflict('DELETE_LAYOUT_CONFLICT');

      await recordAdminAudit(actorId, 'TOPOLOGY_DELETE', id, {
        operationId,
        mode: input.mode,
        entityName: plan.root.name,
        entityKind: plan.root.kind,
        affected: plan.nodes.map((node) => ({
          id: node.id, name: node.name, kind: node.kind,
          ...(node.kind === 'CONTAINER_RACK' ? { originalCas: node.cas } : {}),
          ...(node.kind === 'EQUIPMENT' && node.rackPlacement
            ? { rackPlacement: node.rackPlacement } : {}),
        })),
        powerPathIds: plan.powerPaths.map((path) => path.id),
        telemetryBindingIds: plan.bindings.map((binding) => binding.id),
        historicalTelemetryPreserved: true,
      });
      return { operationId, preview: plan.preview };
    });
  }
}
