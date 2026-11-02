export type PowerSourceUnit = 'W' | 'kW';

export const BFDB_V1_DEFAULT_POWER_SOURCE_UNIT: PowerSourceUnit = 'W';
export const CANONICAL_INTERNAL_POWER_UNIT = 'W' as const;
export const CONTRACT_POWER_UNIT = 'kW' as const;

function numeric(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function resolvePowerSourceUnit(unit: string | undefined): PowerSourceUnit | null {
  const declared = unit?.trim();
  if (!declared) return BFDB_V1_DEFAULT_POWER_SOURCE_UNIT;
  if (declared === 'W' || declared === 'kW') return declared;
  return null;
}

/**
 * Normalize source power into the canonical internal unit (W).
 *
 * BFDB v1 currently defaults to W based on observed field-shaped payloads where
 * P1 is dimensionally consistent with U1 × I1. An explicit TelemetryBinding.unit
 * overrides that default. Unsupported/ambiguous units fail closed.
 */
export function normalizePowerToWatts(
  value: unknown,
  sourceUnit?: string,
): number | undefined {
  const parsed = numeric(value);
  if (parsed === undefined) return undefined;
  const unit = resolvePowerSourceUnit(sourceUnit);
  if (!unit) return undefined;
  return unit === 'kW' ? parsed * 1000 : parsed;
}

export function wattsToKilowatts(value: number): number {
  return value / 1000;
}
