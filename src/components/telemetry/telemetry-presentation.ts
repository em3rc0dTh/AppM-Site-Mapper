import type { BreakerTelemetryReading } from '@/modules/telemetry/domain/entities';

export interface TelemetryMetric {
  label: string;
  value: string;
  unit?: string;
}

/** Preserve source labels and explicit units; never infer measurements or health. */
export function telemetryMetrics(reported: Readonly<Record<string, unknown>>): TelemetryMetric[] {
  const result: TelemetryMetric[] = [];

  function visit(value: unknown, path: string, depth: number) {
    if (depth > 5 || result.length >= 24) return;

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

export function breakerTelemetryMetrics(reading: BreakerTelemetryReading): TelemetryMetric[] {
  return [
    ...(reading.metrics.voltageV
      ? [{ label: 'Voltage', value: reading.metrics.voltageV.value.toFixed(2), unit: 'V' }]
      : []),
    ...(reading.metrics.currentA
      ? [{ label: 'Current', value: reading.metrics.currentA.value.toFixed(2), unit: 'A' }]
      : []),
    ...(reading.metrics.powerW
      ? [{ label: 'Power', value: reading.metrics.powerW.value.toFixed(2), unit: 'W' }]
      : []),
    ...(reading.metrics.energyKwh
      ? [{ label: 'Energy', value: reading.metrics.energyKwh.value.toFixed(4), unit: 'kWh' }]
      : []),
  ];
}
