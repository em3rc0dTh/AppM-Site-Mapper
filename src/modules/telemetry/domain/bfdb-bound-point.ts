import type { TelemetryBinding, TelemetrySample, NormalizedTelemetryMessage } from './entities';

const METRICS = {
  VOLTAGE: { raw: 'U1', key: 'voltageV', unit: 'V' },
  CURRENT: { raw: 'I1', key: 'currentA', unit: 'A' },
  POWER: { raw: 'P1', key: 'powerW', unit: 'W' },
  ENERGY: { raw: 'EP1', key: 'energyKwh', unit: 'kWh' },
} as const;
type MetricName = keyof typeof METRICS;

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Project an accepted BFDB message to an Equipment's own Latest State.
 *
 * Unlike BDFB electrical-path visualizations, a verified MQTT measurement
 * doesn't require a POWER OUTPUT AccessPort. The physical target is resolved
 * by the service before calling this function, never by panel slot index.
 */
export function buildBoundBfdbEquipmentPatches(
  message: NormalizedTelemetryMessage,
  bindings: readonly TelemetryBinding[],
  eligibleBreakerIds: ReadonlySet<string>,
): readonly TelemetrySample[] {
  if (message.protocol !== 'BFDB') return [];

  const patches: TelemetrySample[] = [];
  const observedAt = message.sourceObservedAt ?? message.receivedAt;
  for (const [rawPointId, raw] of Object.entries(message.reported)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rawFields = raw as Readonly<Record<string, unknown>>;
    const links = bindings.filter(
      (binding) =>
        binding.lifecycle === 'ACTIVE' &&
        binding.protocol === 'MQTT' &&
        binding.sourceIdentity === message.sourceIdentity &&
        binding.targetType === 'EQUIPMENT' &&
        binding.sourcePointId === rawPointId &&
        eligibleBreakerIds.has(binding.targetId) &&
        Object.hasOwn(METRICS, binding.metric.toUpperCase()),
    );
    if (!links.length) continue;

    // A point may not be attributed to two breakers or to duplicate metrics.
    const sourcePointBindings = bindings.filter(
      (binding) =>
        binding.lifecycle === 'ACTIVE' &&
        binding.protocol === 'MQTT' &&
        binding.sourceIdentity === message.sourceIdentity &&
        binding.sourcePointId === rawPointId &&
        binding.targetType === 'EQUIPMENT' &&
        Object.hasOwn(METRICS, binding.metric.toUpperCase()),
    );
    if (new Set(sourcePointBindings.map((b) => b.targetId)).size !== 1) continue;
    if (new Set(links.map((b) => b.metric.toUpperCase())).size !== links.length) continue;

    const reported: Record<string, unknown> = {};
    for (const link of links) {
      const field = METRICS[link.metric.toUpperCase() as MetricName];
      const value = numeric(rawFields[field.raw]);
      if (value !== undefined) {
        reported[field.key] = { value, unit: field.unit, observedAt };
      }
    }
    if (rawFields.state !== undefined && (typeof rawFields.state === 'string' || typeof rawFields.state === 'number')) {
      reported.state = String(rawFields.state);
    }
    if (!Object.keys(reported).length) continue;

    const breakerId = links[0]!.targetId;
    patches.push({
      bindingId: links[0]!.id,
      metricBindingIds: links.map((b) => b.id),
      sourcePointId: rawPointId,
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
  return patches;
}
