import type { EquipmentNode } from '@/modules/topology/domain/entities';
import type { CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';

export type CompositionMetricKey = 'voltageV' | 'currentA' | 'powerW' | 'energyKwh';

export interface CompositionTelemetrySummary {
  /** Unique active physical descendant breakers, including the focused breaker itself. */
  readonly installed: number;
  readonly bound: number;
  readonly reporting: number;
  readonly stale: number;
  /** Immediate installed children contributing LIVE readings, not leaf counts. */
  readonly reportingChildren: number;
  readonly installedChildren: number;
  /** Positional panel capacity or actual child count for other scopes. */
  readonly positions: number;
  /** Mean of each reporting immediate child's own mean, per metric. */
  readonly metrics: Readonly<Partial<Record<CompositionMetricKey, number>>>;
  /** Unique reporting leaf breakers per metric (not a denominator for the hierarchical mean). */
  readonly metricCounts: Readonly<Record<CompositionMetricKey, number>>;
}

export const COMPOSITION_METRICS: readonly CompositionMetricKey[] = [
  'voltageV',
  'currentA',
  'powerW',
  'energyKwh',
];

function zeroCounts(): Record<CompositionMetricKey, number> {
  return { voltageV: 0, currentA: 0, powerW: 0, energyKwh: 0 };
}

/**
 * Physical, level-by-level arithmetic means.
 *
 * A panel averages LIVE breakers; a frame averages reporting panel means;
 * a shelf averages reporting frame means; a chassis averages reporting shelf means.
 * Empty physical positions, stale devices, incomplete metrics and duplicate
 * descendants do not contribute. No child mean is a sum or an input-feed load.
 */
export function projectCompositionTelemetry(
  root: EquipmentNode,
  equipmentById: ReadonlyMap<string, EquipmentNode>,
  readings: Readonly<Record<string, CompositionBreakerTelemetry>>,
): CompositionTelemetrySummary {
  const seen = new Set<string>();

  function visit(node: EquipmentNode): CompositionTelemetrySummary {
    const empty = {
      installed: 0,
      bound: 0,
      reporting: 0,
      stale: 0,
      reportingChildren: 0,
      installedChildren: 0,
      positions: node.childMode === 'POSITIONAL' ? node.children.length : 0,
      metrics: {},
      metricCounts: zeroCounts(),
    } satisfies CompositionTelemetrySummary;
    if (node.lifecycle !== 'ACTIVE' || seen.has(node.id)) return empty;
    seen.add(node.id);

    if (node.equipmentType === 'CIRCUIT_BREAKER') {
      const reading = readings[node.id];
      const live =
        reading?.status === 'LIVE' &&
        COMPOSITION_METRICS.some((key) => typeof reading[key] === 'number' && Number.isFinite(reading[key]));
      const metrics: Partial<Record<CompositionMetricKey, number>> = {};
      const metricCounts = zeroCounts();
      if (live) {
        for (const key of COMPOSITION_METRICS) {
          const value = reading[key];
          if (typeof value === 'number' && Number.isFinite(value)) {
            metrics[key] = value;
            metricCounts[key] = 1;
          }
        }
      }
      return {
        ...empty,
        installed: 1,
        bound: reading && reading.status !== 'UNMAPPED' ? 1 : 0,
        reporting: live ? 1 : 0,
        stale: reading?.status === 'STALE' ? 1 : 0,
        metrics,
        metricCounts,
      };
    }

    const activeChildren = node.children.flatMap((id) => {
      const child = id ? equipmentById.get(id) : undefined;
      return child && child.lifecycle === 'ACTIVE' && child.deviceId === root.deviceId
        ? [child]
        : [];
    });
    const children = activeChildren.map(visit);
    const metrics: Partial<Record<CompositionMetricKey, number>> = {};
    const metricCounts = zeroCounts();
    for (const key of COMPOSITION_METRICS) {
      const directMeans = children
        .map((child) => child.metrics[key])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (directMeans.length) {
        metrics[key] = directMeans.reduce((sum, value) => sum + value, 0) / directMeans.length;
      }
      metricCounts[key] = children.reduce((sum, child) => sum + child.metricCounts[key], 0);
    }
    return {
      installed: children.reduce((sum, child) => sum + child.installed, 0),
      bound: children.reduce((sum, child) => sum + child.bound, 0),
      reporting: children.reduce((sum, child) => sum + child.reporting, 0),
      stale: children.reduce((sum, child) => sum + child.stale, 0),
      reportingChildren: children.filter((child) => child.reporting > 0).length,
      installedChildren: new Set(activeChildren.map((child) => child.id)).size,
      positions: node.childMode === 'POSITIONAL' ? node.children.length : activeChildren.length,
      metrics,
      metricCounts,
    };
  }

  return visit(root);
}
