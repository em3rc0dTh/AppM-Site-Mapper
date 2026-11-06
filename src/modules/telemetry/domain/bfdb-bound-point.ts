import { normalizePowerToWatts } from './power-unit-contract';
import { detectBfdbWireProfile, expandBfdbWirePoint } from './bfdb-wire-layout';
import type { TelemetryBinding, TelemetrySample, NormalizedTelemetryMessage } from './entities';

const METRICS = {
  VOLTAGE: { key: 'voltageV', unit: 'V' },
  CURRENT: { key: 'currentA', unit: 'A' },
  POWER: { key: 'powerW', unit: 'W' },
  ENERGY: { key: 'energyKwh', unit: 'kWh' },
} as const;
type MetricName = keyof typeof METRICS;

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Project an accepted BFDB message to each exact breaker Equipment Latest State.
 *
 * The field Acrel payload may carry two breakers inside one raw MQTT object
 * (U1/I1/P1/EP1 and U2/I2/P2/EP2). Channel-qualified sourcePointIds keep
 * those two physical circuits independent without inventing measurements.
 */
export function buildBoundBfdbEquipmentPatches(
  message: NormalizedTelemetryMessage,
  bindings: readonly TelemetryBinding[],
  eligibleBreakerIds: ReadonlySet<string>,
): readonly TelemetrySample[] {
  if (message.protocol !== 'BFDB') return [];

  const patches: TelemetrySample[] = [];
  const observedAt = message.sourceObservedAt ?? message.receivedAt;
  const profile = detectBfdbWireProfile(message.reported);

  for (const [rawPointId, raw] of Object.entries(message.reported)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rawFields = raw as Readonly<Record<string, unknown>>;

    for (const point of expandBfdbWirePoint(rawPointId, rawFields, profile)) {
      const links = bindings.filter(
        (binding) =>
          binding.lifecycle === 'ACTIVE' &&
          binding.protocol === 'MQTT' &&
          binding.sourceIdentity === message.sourceIdentity &&
          binding.targetType === 'EQUIPMENT' &&
          binding.sourcePointId === point.bindingPointId &&
          eligibleBreakerIds.has(binding.targetId) &&
          Object.hasOwn(METRICS, binding.metric.toUpperCase()),
      );
      if (!links.length) continue;

      // A channel-qualified point may not be attributed to two breakers or
      // duplicate semantic metrics.
      const sourcePointBindings = bindings.filter(
        (binding) =>
          binding.lifecycle === 'ACTIVE' &&
          binding.protocol === 'MQTT' &&
          binding.sourceIdentity === message.sourceIdentity &&
          binding.sourcePointId === point.bindingPointId &&
          binding.targetType === 'EQUIPMENT' &&
          Object.hasOwn(METRICS, binding.metric.toUpperCase()),
      );
      if (new Set(sourcePointBindings.map((binding) => binding.targetId)).size !== 1) continue;
      if (new Set(links.map((binding) => binding.metric.toUpperCase())).size !== links.length)
        continue;

      const wireByMetric = {
        VOLTAGE: point.fields.voltage,
        CURRENT: point.fields.current,
        POWER: point.fields.power,
        ENERGY: point.fields.energy,
      } as const;

      const reported: Record<string, unknown> = {};
      for (const link of links) {
        const metricName = link.metric.toUpperCase() as MetricName;
        const field = METRICS[metricName];
        const wireField = wireByMetric[metricName];
        const value =
          metricName === 'POWER'
            ? normalizePowerToWatts(rawFields[wireField], link.unit)
            : numeric(rawFields[wireField]);
        if (value !== undefined) {
          reported[field.key] = { value, unit: field.unit, observedAt };
        }
      }
      if (
        rawFields.state !== undefined &&
        (typeof rawFields.state === 'string' || typeof rawFields.state === 'number')
      ) {
        reported.state = String(rawFields.state);
      }
      if (!Object.keys(reported).length) continue;

      const breakerId = links[0]!.targetId;
      patches.push({
        bindingId: links[0]!.id,
        metricBindingIds: links.map((binding) => binding.id),
        sourcePointId: point.bindingPointId,
        targetId: breakerId,
        targetType: 'EQUIPMENT',
        entityId: breakerId,
        entityKind: 'EQUIPMENT',
        sourceIdentity: message.sourceIdentity,
        receivedAt: message.receivedAt,
        reported,
        ...(message.sourceObservedAt ? { sourceObservedAt: message.sourceObservedAt } : {}),
        ...(message.sourceSentAt ? { sourceSentAt: message.sourceSentAt } : {}),
      });
    }
  }
  return patches;
}
