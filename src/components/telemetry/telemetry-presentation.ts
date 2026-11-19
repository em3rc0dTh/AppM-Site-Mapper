import type { BreakerTelemetryReading, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { normalizedTelemetryPointPrefix } from '@/modules/topology/domain/telemetry-point-prefix';

export interface TelemetryMetric {
  label: string;
  value: string;
  unit?: string;
}

/** Preserve source labels and explicit units; never infer measurements or health. */
export function telemetryMetrics(reported: Readonly<Record<string, unknown>>): TelemetryMetric[] {
  const result: TelemetryMetric[] = [];

  function visit(value: unknown, path: string, depth: number) {
    if (depth > 5) return;

    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      result.push({ label: path, value: String(value) });
      return;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;

      if (
        (typeof record.value === 'number' || typeof record.value === 'string') &&
        typeof record.unit === 'string'
      ) {
        result.push({ label: path, value: String(record.value), unit: record.unit });
        return;
      }

      for (const [key, item] of Object.entries(record)) {
        visit(item, path ? `${path} / ${key}` : key, depth + 1);
      }
    }
  }

  for (const [key, value] of Object.entries(reported)) {
    visit(value, key, 0);
  }

  return result;
}

export interface BreakerLiveMetricValues {
  readonly receivedAt?: string;
  readonly voltageV?: number;
  readonly currentA?: number;
  readonly powerW?: number;
  readonly energyKwh?: number;
}

function canonicalReportedMetric(
  reported: Readonly<Record<string, unknown>>,
  key: 'voltageV' | 'currentA' | 'powerW' | 'energyKwh',
): number | undefined {
  const raw = reported[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = (raw as Record<string, unknown>).value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Resolve one breaker's canonical LIVE electrical metrics.
 *
 * Exact Equipment telemetry is authoritative and stores V/I/P/E in sample.reported.
 * breakerReadings is retained as the compatible aggregate fallback for parent/BDFB samples.
 */
export function resolveBreakerLiveMetrics(
  sample: TelemetrySample | null | undefined,
  breakerId: string,
): BreakerLiveMetricValues {
  const reading = sample?.breakerReadings?.find((item) => item.breakerId === breakerId);
  const direct =
    sample?.targetType === 'EQUIPMENT' && sample.targetId === breakerId ? sample : undefined;

  const voltageV =
    (direct ? canonicalReportedMetric(direct.reported, 'voltageV') : undefined) ??
    reading?.metrics.voltageV?.value;
  const currentA =
    (direct ? canonicalReportedMetric(direct.reported, 'currentA') : undefined) ??
    reading?.metrics.currentA?.value;
  const powerW =
    (direct ? canonicalReportedMetric(direct.reported, 'powerW') : undefined) ??
    reading?.metrics.powerW?.value;
  const energyKwh =
    (direct ? canonicalReportedMetric(direct.reported, 'energyKwh') : undefined) ??
    reading?.metrics.energyKwh?.value;

  return {
    ...(direct?.receivedAt
      ? { receivedAt: direct.receivedAt }
      : reading?.receivedAt
        ? { receivedAt: reading.receivedAt }
        : {}),
    ...(voltageV !== undefined ? { voltageV } : {}),
    ...(currentA !== undefined ? { currentA } : {}),
    ...(powerW !== undefined ? { powerW } : {}),
    ...(energyKwh !== undefined ? { energyKwh } : {}),
  };
}

export function breakerTelemetryMetrics(reading: BreakerTelemetryReading): TelemetryMetric[] {
  return [
    ...(reading.metrics.voltageV
      ? [{ label: 'Voltage', value: reading.metrics.voltageV.value.toFixed(2), unit: 'V' }]
      : []),
    ...(reading.metrics.currentA
      ? [{ label: 'Current', value: reading.metrics.currentA.value.toFixed(2), unit: 'A' }]
      : []),
    ...(reading.metrics.powerW
      ? [{ label: 'Power', value: (reading.metrics.powerW.value / 1000).toFixed(3), unit: 'kW' }]
      : []),
    ...(reading.metrics.energyKwh
      ? [{ label: 'Energy', value: reading.metrics.energyKwh.value.toFixed(4), unit: 'kWh' }]
      : []),
  ];
}

/**
 * Filter a panel's own RAW point group for contextual display only.
 * No mutation of the incoming MQTT sample or durable Timescale record.
 */
export function panelReportedPoints(
  reported: Readonly<Record<string, unknown>>,
  pointPrefix: string | undefined,
  capacity: number | undefined,
): Readonly<Record<string, unknown>> {
  const prefix = normalizedTelemetryPointPrefix(pointPrefix);
  if (!prefix) return reported;
  const entries = Object.entries(reported).filter(([key]) => {
    if (!key.startsWith(prefix + '_')) return false;
    const position = key.slice(prefix.length + 1);
    if (!/^[1-9][0-9]*$/.test(position)) return false;
    const index = Number(position);
    return (
      Number.isSafeInteger(index) && (capacity === undefined || (index <= capacity && index >= 1))
    );
  });
  return Object.fromEntries(
    entries.sort(
      ([a], [b]) => Number(a.slice(prefix.length + 1)) - Number(b.slice(prefix.length + 1)),
    ),
  );
}
