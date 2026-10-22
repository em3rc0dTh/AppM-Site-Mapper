import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { compositionBreakerTelemetry, type CompositionBreakerBinding, type CompositionBreakerTelemetry } from '@/modules/telemetry/domain/composition-breaker-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import { projectCompositionTelemetry, type CompositionTelemetrySummary } from './composition-telemetry-summary';

export interface CompositionHistoryPoint {
  readonly at: string;
  readonly metrics: CompositionTelemetrySummary['metrics'];
  readonly reporting: number;
  readonly reportingChildren: number;
  readonly installed: number;
  readonly installedChildren: number;
  readonly positions: number;
}

/**
 * Bucket canonical, individually commissioned breaker samples, then run the
 * exact same physical hierarchy projection as LIVE. No zero-fill, interpolated
 * readings, duplicate breaker attribution or SNMP shunts enter these points.
 */
export function projectCompositionHistory(
  root: EquipmentNode,
  byId: ReadonlyMap<string, EquipmentNode>,
  sampleGroups: ReadonlyMap<string, readonly TelemetrySample[]>,
  bindings: readonly CompositionBreakerBinding[],
  bucketMs: number,
): readonly CompositionHistoryPoint[] {
  const buckets = new Map<number, Map<string, { timestamp: number; reading: CompositionBreakerTelemetry }>>();
  for (const [breakerId, samples] of sampleGroups) {
    const breaker = byId.get(breakerId);
    if (!breaker || breaker.equipmentType !== 'CIRCUIT_BREAKER' || breaker.lifecycle !== 'ACTIVE') continue;
    for (const sample of samples) {
      if (sample.targetId !== breakerId || sample.targetType !== 'EQUIPMENT' || sample.protocol === 'SNMP') continue;
      const received = Date.parse(sample.receivedAt);
      if (!Number.isFinite(received)) continue;
      const at = Math.floor(received / bucketMs) * bucketMs;
      const reading = compositionBreakerTelemetry(
        breakerId,
        breaker.deviceId,
        [sample],
        bindings,
        Date.parse(sample.sourceObservedAt ?? sample.receivedAt),
      );
      if (reading.status !== 'LIVE' || !['voltageV','currentA','powerW','energyKwh'].some(
        (metric) => typeof reading[metric as 'voltageV' | 'currentA' | 'powerW' | 'energyKwh'] === 'number',
      )) continue;
      const bucket = buckets.get(at) ?? new Map();
      const previous = bucket.get(breakerId);
      if (!previous || received > previous.timestamp) bucket.set(breakerId, { timestamp: received, reading });
      buckets.set(at, bucket);
    }
  }
  return [...buckets.entries()].sort(([a],[b]) => a-b).map(([at, values]) => {
    const readings = Object.fromEntries([...values].map(([id, result]) => [id, result.reading]));
    const result = projectCompositionTelemetry(root, byId, readings);
    return {
      at: new Date(at).toISOString(),
      metrics: result.metrics,
      reporting: result.reporting,
      reportingChildren: result.reportingChildren,
      installed: result.installed,
      installedChildren: result.installedChildren,
      positions: result.positions,
    };
  });
}
