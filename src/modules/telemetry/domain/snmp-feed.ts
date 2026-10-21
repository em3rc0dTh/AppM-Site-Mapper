import { failure, success, type Result } from '@/shared/domain/result';

export type SnmpFeedMetric = 'CURRENT' | 'VOLTAGE';

export interface SnmpFeedMeasurement {
  readonly oid: string;
  readonly metric: SnmpFeedMetric;
  /** Already scaled engineering value, never raw shunt millivolts. */
  readonly value: number;
  readonly unit: 'A' | 'V';
}

export interface SnmpFeedPacket {
  readonly schemaVersion: 1;
  /** Stable inventory identity of the SNMP agent, not its mutable IP. */
  readonly sourceIdentity: string;
  readonly observedAt: string;
  readonly measurements: readonly SnmpFeedMeasurement[];
}

export type SnmpFeedValidationError = 'INVALID_SNMP_FEED_PACKET';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Transport-neutral envelope: an SNMP poller or emulator submits identical data. */
export function parseSnmpFeedPacket(
  candidate: unknown,
  nowMs = Date.now(),
): Result<SnmpFeedPacket, SnmpFeedValidationError> {
  if (!object(candidate) || candidate.schemaVersion !== 1) {
    return failure('INVALID_SNMP_FEED_PACKET');
  }
  const { sourceIdentity, observedAt, measurements } = candidate;
  if (
    typeof sourceIdentity !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(sourceIdentity) ||
    typeof observedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(observedAt) ||
    !Number.isFinite(Date.parse(observedAt)) ||
    Date.parse(observedAt) > nowMs + 60_000 ||
    !Array.isArray(measurements) ||
    measurements.length < 1 ||
    measurements.length > 64
  ) {
    return failure('INVALID_SNMP_FEED_PACKET');
  }
  const seen = new Set<string>();
  const normalized: SnmpFeedMeasurement[] = [];
  for (const entry of measurements as unknown[]) {
    if (!object(entry)) return failure('INVALID_SNMP_FEED_PACKET');
    const { oid, metric, value, unit } = entry;
    if (
      typeof oid !== 'string' ||
      oid.length > 256 ||
      !/^\d+(?:\.\d+){5,}$/.test(oid) ||
      (metric !== 'CURRENT' && metric !== 'VOLTAGE') ||
      unit !== (metric === 'CURRENT' ? 'A' : 'V') ||
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      Math.abs(value) > 100_000_000 ||
      (metric === 'CURRENT' && value < 0)
    ) {
      return failure('INVALID_SNMP_FEED_PACKET');
    }
    const key = `${oid}:${metric}`;
    if (seen.has(key)) return failure('INVALID_SNMP_FEED_PACKET');
    seen.add(key);
    normalized.push({ oid, metric, value, unit });
  }
  return success({ schemaVersion: 1, sourceIdentity, observedAt, measurements: normalized });
}
