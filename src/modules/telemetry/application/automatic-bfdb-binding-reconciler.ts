import { createHash } from 'node:crypto';

import { TelemetryIdentityResolver } from '@/modules/telemetry/application/telemetry-identity-resolver';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type {
  NormalizedTelemetryMessage,
  TelemetryBinding,
} from '@/modules/telemetry/domain/entities';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';

const PANEL_BY_GROUP = {
  '1': 'A3',
  '2': 'A2',
  '3': 'B3',
  '4': 'B2',
} as const;

const METRICS = {
  U1: { metric: 'VOLTAGE', unit: 'V' },
  I1: { metric: 'CURRENT', unit: 'A' },
  P1: { metric: 'POWER', unit: 'W' },
  EP1: { metric: 'ENERGY', unit: 'kWh' },
} as const;

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePoint(rawPointId: string): { panelLabel: string; position: number } | null {
  const match = /^0_([1-4])_([1-9]\d{0,2})$/.exec(rawPointId);
  if (!match) return null;
  const position = Number(match[2]);
  if (!Number.isInteger(position) || position < 1 || position > 256) return null;
  return { panelLabel: PANEL_BY_GROUP[match[1] as keyof typeof PANEL_BY_GROUP], position };
}

function deterministicId(sourceIdentity: string, sourcePointId: string, metric: string): string {
  return (
    'auto:mqtt-point:' +
    createHash('sha256').update([sourceIdentity, sourcePointId, metric].join('|')).digest('hex')
  );
}

function uniqueNodes(nodes: readonly TopologyNode[]): readonly TopologyNode[] {
  const unique = new Map<string, TopologyNode>();
  for (const node of nodes) unique.set(node.id, node);
  return [...unique.values()];
}

/**
 * Persist point bindings only when telemetry and existing Site Mapper topology
 * describe the same circuit unambiguously.
 *
 * This reconciler NEVER creates Device/Equipment topology. MQTT is observation
 * input, not physical-inventory authority.
 */
export class AutomaticBfdbBindingReconciler {
  constructor(
    private readonly topology: TopologyRepository,
    private readonly bindings: TelemetryBindingRepository,
  ) {}

  async reconcile(
    message: NormalizedTelemetryMessage,
    ownerDeviceId: string,
    currentSourceBindings: readonly TelemetryBinding[],
  ): Promise<readonly string[]> {
    if (message.protocol !== 'BFDB') return [];

    const owner = await this.topology.getById(ownerDeviceId);
    if (
      !owner ||
      owner.kind !== 'DEVICE' ||
      owner.lifecycle !== 'ACTIVE' ||
      owner.deviceType !== 'BDFB'
    )
      return [];

    const equipment = (await this.topology.listEquipmentForDevice(ownerDeviceId)).filter(
      (node) => node.lifecycle === 'ACTIVE',
    );
    const byId = new Map(equipment.map((node) => [node.id, node]));
    const panelsByLabel = new Map<string, EquipmentNode[]>();
    for (const node of equipment) {
      if (node.equipmentType !== 'PANEL') continue;
      const list = panelsByLabel.get(node.name) ?? [];
      list.push(node);
      panelsByLabel.set(node.name, list);
    }

    const identity = new TelemetryIdentityResolver(this.topology);
    const candidates: Array<{
      binding: TelemetryBinding;
      panel: EquipmentNode;
      breaker: EquipmentNode;
    }> = [];
    const candidateBreakerIds = new Set<string>();
    const now = new Date().toISOString();

    for (const [rawPointId, rawValue] of Object.entries(message.reported)) {
      const point = parsePoint(rawPointId);
      if (!point || !rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue;

      const panels = panelsByLabel.get(point.panelLabel) ?? [];
      if (panels.length !== 1) continue;
      const panel = panels[0]!;
      if (panel.childMode !== 'POSITIONAL') continue;

      const breakerId = panel.children[point.position - 1];
      if (!breakerId) continue;
      const breaker = byId.get(breakerId);
      if (
        !breaker ||
        breaker.equipmentType !== 'CIRCUIT_BREAKER' ||
        breaker.parentEquipmentId !== panel.id ||
        breaker.parentId !== panel.id ||
        breaker.deviceId !== ownerDeviceId ||
        !(await identity.valid(breaker))
      )
        continue;

      const raw = rawValue as Readonly<Record<string, unknown>>;
      for (const [rawField, definition] of Object.entries(METRICS)) {
        if (numeric(raw[rawField]) === null) continue;

        const existingForSourcePoint = currentSourceBindings.filter(
          (binding) =>
            binding.lifecycle === 'ACTIVE' &&
            binding.protocol === 'MQTT' &&
            binding.sourceIdentity === message.sourceIdentity &&
            binding.sourcePointId === rawPointId &&
            binding.metric.toUpperCase() === definition.metric,
        );
        if (existingForSourcePoint.length > 0) continue;

        candidateBreakerIds.add(breaker.id);
        candidates.push({
          panel,
          breaker,
          binding: {
            id: deterministicId(message.sourceIdentity, rawPointId, definition.metric),
            protocol: 'MQTT',
            sourceIdentity: message.sourceIdentity,
            sourcePointId: rawPointId,
            metric: definition.metric,
            unit: definition.unit,
            targetType: 'EQUIPMENT',
            targetId: breaker.id,
            lifecycle: 'ACTIVE',
            createdAt: now,
            updatedAt: now,
            attributes: {
              commissioning: 'AUTO_RECONCILED',
              discovery: 'TOPOLOGY_POINT_MATCH',
              bdfbDeviceId: ownerDeviceId,
              matchedPanelId: panel.id,
              panelLabel: panel.name,
              position: point.position,
            },
          },
        });
      }
    }

    if (!candidates.length) return [];

    // A pre-existing target binding from another publisher/point remains authoritative.
    // Do not auto-retarget or overwrite operator/field commissioning.
    const targetBindings = await this.bindings.listForTargets('EQUIPMENT', [
      ...candidateBreakerIds,
    ]);
    const safe = candidates.filter(({ binding }) => {
      return !targetBindings.some(
        (existing) =>
          existing.lifecycle === 'ACTIVE' &&
          existing.targetType === 'EQUIPMENT' &&
          existing.targetId === binding.targetId &&
          existing.metric.toUpperCase() === binding.metric.toUpperCase() &&
          (existing.protocol !== binding.protocol ||
            existing.sourceIdentity !== binding.sourceIdentity ||
            existing.sourcePointId !== binding.sourcePointId),
      );
    });
    if (!safe.length) return [];

    if (this.bindings.commitBindings) {
      try {
        return await this.bindings.commitBindings(
          safe.map((item) => item.binding),
          uniqueNodes(safe.flatMap((item) => [item.panel, item.breaker])),
        );
      } catch {
        // A concurrent commissioning action may have won the race. Fail closed:
        // keep RAW ingestion alive and let the next packet observe authoritative state.
        return [];
      }
    }

    if (!this.bindings.insertBatch) return [];
    try {
      await this.bindings.insertBatch(safe.map((item) => item.binding));
      return safe.map((item) => item.binding.id);
    } catch {
      return [];
    }
  }
}
