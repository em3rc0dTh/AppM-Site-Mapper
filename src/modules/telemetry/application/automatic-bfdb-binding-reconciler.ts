import { createHash } from 'node:crypto';

import { TelemetryIdentityResolver } from '@/modules/telemetry/application/telemetry-identity-resolver';
import type { TelemetryBindingRepository } from '@/modules/telemetry/application/telemetry-binding-repository';
import type {
  NormalizedTelemetryMessage,
  TelemetryBinding,
} from '@/modules/telemetry/domain/entities';
import {
  bindingPointIdsForWirePoint,
  detectBfdbWireProfile,
  expandBfdbWirePoint,
} from '@/modules/telemetry/domain/bfdb-wire-layout';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';
import type { EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';

const METRICS = {
  VOLTAGE: { unit: 'V' },
  CURRENT: { unit: 'A' },
  POWER: { unit: 'W' },
  ENERGY: { unit: 'kWh' },
} as const;

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
 * Field Acrel frames publish four Modbus slave groups (1/3/5/7). Each measured
 * raw position 1..12 carries two physical channels, so channel 1 resolves to
 * panel positions 1..12 and channel 2 resolves to positions 13..24.
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
    const profile = detectBfdbWireProfile(message.reported);

    for (const [rawPointId, rawValue] of Object.entries(message.reported)) {
      if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue;
      const raw = rawValue as Readonly<Record<string, unknown>>;

      for (const point of expandBfdbWirePoint(rawPointId, raw, profile)) {
        const panels = panelsByLabel.get(point.panelLabel) ?? [];
        if (panels.length !== 1) continue;
        const panel = panels[0]!;
        if (panel.childMode !== 'POSITIONAL') continue;

        const breakerId = panel.children[point.panelPosition - 1];
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

        const wireByMetric = {
          VOLTAGE: point.fields.voltage,
          CURRENT: point.fields.current,
          POWER: point.fields.power,
          ENERGY: point.fields.energy,
        } as const;

        for (const [metric, definition] of Object.entries(METRICS)) {
          const wireField = wireByMetric[metric as keyof typeof wireByMetric];
          if (numeric(raw[wireField]) === null) continue;

          const acceptedPointIds = bindingPointIdsForWirePoint(point, profile);
          const existingForSourcePoint = currentSourceBindings.filter(
            (binding) =>
              binding.lifecycle === 'ACTIVE' &&
              binding.protocol === 'MQTT' &&
              binding.sourceIdentity === message.sourceIdentity &&
              Boolean(binding.sourcePointId && acceptedPointIds.includes(binding.sourcePointId)) &&
              binding.metric.toUpperCase() === metric,
          );
          if (existingForSourcePoint.length > 0) continue;

          candidateBreakerIds.add(breaker.id);
          candidates.push({
            panel,
            breaker,
            binding: {
              id: deterministicId(message.sourceIdentity, point.bindingPointId, metric),
              protocol: 'MQTT',
              sourceIdentity: message.sourceIdentity,
              sourcePointId: point.bindingPointId,
              metric,
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
                position: point.panelPosition,
                side: point.side,
                sidePosition: point.sidePosition,
                wireRawPointId: point.rawPointId,
                wireChannel: point.channel,
                modbusPointId: point.modbusPointId,
                wireProfile: profile,
              },
            },
          });
        }
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
