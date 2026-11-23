import type { SnmpControllerSignal } from '@/modules/telemetry/domain/snmp-controller-profile';

export const SNMP_CONTROLLER_MAX_AGE_MS = 130_000;

export interface SnmpControllerObservation {
  readonly key: string;
  readonly rawValue: unknown;
  readonly value: number | string | boolean | null;
  readonly quality: string;
  readonly receivedAt: string;
  readonly observedAt?: string;
  readonly enumLabel?: string | null;
  readonly lastObservation?: {
    readonly rawValue: unknown;
    readonly observedAt: string;
  };
}

export interface PresentedControllerReading {
  readonly text: string;
  readonly raw: string;
  readonly receivedAt: string | null;
  readonly state: 'RECENT' | 'STALE' | 'UNAVAILABLE' | 'INVALID';
  readonly quality: string;
}

/**
 * Never infer amperes, volts, sign conventions or physical feed identity.
 * The OID belongs to a device-scoped presentation profile, not to this renderer.
 */
export function presentControllerReading(
  signal: SnmpControllerObservation | undefined,
  spec: SnmpControllerSignal,
  nowMs: number,
): PresentedControllerReading {
  const candidate = signal?.lastObservation?.rawValue ?? signal?.rawValue ?? signal?.value;
  const validRaw =
    (typeof candidate === 'string' && candidate.trim().length > 0) ||
    (typeof candidate === 'number' && Number.isFinite(candidate)) ||
    typeof candidate === 'boolean';
  const raw = validRaw ? String(candidate) : '—';
  const observed = signal?.lastObservation?.observedAt ?? signal?.observedAt ?? signal?.receivedAt;
  const parsed = observed ? Date.parse(observed) : NaN;
  const validTimestamp = Number.isFinite(parsed) && parsed <= nowMs + 10_000;
  const age = validTimestamp ? nowMs - parsed : Infinity;
  const state = !signal
    ? 'UNAVAILABLE'
    : !validRaw || !validTimestamp
      ? 'INVALID'
      : age > SNMP_CONTROLLER_MAX_AGE_MS
        ? 'STALE'
        : 'RECENT';
  const enumLabel =
    spec.displayMode === 'ENUM' && signal?.enumLabel?.trim() ? signal.enumLabel.trim() : null;
  return {
    text: enumLabel && validRaw ? enumLabel + ' (' + raw + ')' : raw,
    raw,
    receivedAt: validTimestamp ? observed! : null,
    state,
    quality: signal?.quality ?? 'UNKNOWN',
  };
}
