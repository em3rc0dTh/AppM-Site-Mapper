import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const DISPLAY_KEYS = ['U1', 'I1', 'P1'] as const;

export interface EndpointTelemetryView {
  readonly address: string;
  readonly state?: string;
  readonly displayMetrics: readonly Readonly<{ key: string; value: string }>[];
  readonly rawFields: Readonly<Record<string, string>>;
  readonly receivedAt?: string;
  readonly simulated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return undefined;
}

export function endpointTelemetry(
  sample: TelemetrySample | null,
  address: string | undefined,
): EndpointTelemetryView | null {
  if (!sample || !address) return null;

  const reading = sample.reported[address];
  if (!isRecord(reading)) return null;

  const rawFields = Object.fromEntries(
    Object.entries(reading).flatMap(([key, value]) => {
      const scalar = scalarString(value);
      return scalar === undefined ? [] : [[key, scalar]];
    }),
  );

  const displayMetrics = DISPLAY_KEYS.flatMap((key) => {
    const value = rawFields[key];
    return value === undefined ? [] : [{ key, value }];
  });

  return {
    address,
    ...(rawFields.state === undefined ? {} : { state: rawFields.state }),
    displayMetrics,
    rawFields,
    ...(sample.reportedEntryRecency?.[address]?.receivedAt === undefined
      ? {}
      : { receivedAt: sample.reportedEntryRecency[address]?.receivedAt }),
    simulated: sample.simulated === true,
  };
}
