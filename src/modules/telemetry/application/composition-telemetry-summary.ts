import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';

export type CompositionMetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

export interface CompositionTelemetrySummary {
  readonly installed: number;
  readonly bound: number;
  readonly reporting: number;
  readonly stale: number;
  readonly metrics: Readonly<Partial<Record<CompositionMetricKey, number>>>;
  readonly metricCounts: Readonly<Record<CompositionMetricKey, number>>;
}

const METRICS: readonly CompositionMetricKey[] = [
  'voltageV',
  'currentA',
  'powerW',
  'energyKwh',
];

/**
 * Read-only projection of installed physical descendants.
 * Each unique ACTIVE breaker contributes at most once, regardless of nesting.
 * No vacant position, disconnected source or synthetic shunt enters the means.
 */
export function projectCompositionTelemetry(
  root: EquipmentNode,
  equipmentById: ReadonlyMap<string, EquipmentNode>,
  readings: Readonly<Record<string, CompositionBreakerTelemetry>>,
): CompositionTelemetrySummary {
  const visited = new Set<string>();
  const breakers: EquipmentNode[] = [];

  function visit(node: EquipmentNode): void {
    if (visited.has(node.id) || node.lifecycle !== 'ACTIVE') return;
    visited.add(node.id);
    if (node.equipmentType === 'CIRCUIT_BREAKER') {
      breakers.push(node);
      return;
    }
    for (const childId of node.children) {
      const child = childId ? equipmentById.get(childId) : undefined;
      if (child && child.deviceId === root.deviceId) visit(child);
    }
  }

  visit(root);
  const live = breakers
    .map((breaker) => readings[breaker.id])
    .filter((reading): reading is CompositionBreakerTelemetry => reading?.status === 'LIVE');
  const values: Partial<Record<CompositionMetricKey, number>> = {};
  const metricCounts = {
    voltageV: 0,
    currentA: 0,
    powerW: 0,
    energyKwh: 0,
  };
  for (const metric of METRICS) {
    const samples = live
      .map((reading) => reading[metric])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    metricCounts[metric] = samples.length;
    if (samples.length) {
      values[metric] = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    }
  }

  return {
    installed: breakers.length,
    bound: breakers.filter((breaker) => {
      const status = readings[breaker.id]?.status;
      return status !== undefined && status !== 'UNMAPPED';
    }).length,
    reporting: live.length,
    stale: breakers.filter((breaker) => readings[breaker.id]?.status === 'STALE').length,
    metrics: values,
    metricCounts,
  };
}
