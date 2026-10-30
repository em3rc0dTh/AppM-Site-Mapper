import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import type { AlarmOccurrence } from '@/modules/alarm/domain/entities';
import type { Signal } from '@/modules/telemetry/domain/industrial/observations';
import type { TopologyRepository } from '@/modules/topology/application/topology-repository';

export type AlarmPublicationField = 'STATE' | 'ACK' | 'SEVERITY' | 'CONFIDENCE' | 'QUALITY';

export interface AlarmPublicationRequest {
  readonly signalId: string;
  readonly logicalPointId: string;
}

const SEVERITY_CODE = { INFO: 1, WARNING: 2, CRITICAL: 3 } as const;
const CONFIDENCE_CODE = { SUSPECTED: 1, CONFIRMED: 2 } as const;

export function parseAlarmPublicationLogicalPoint(logicalPointId: string): {
  targetId: string;
  alarmCode: string;
  field: AlarmPublicationField;
} | null {
  const match =
    /^ALARM\/([^/]{1,160})\/([A-Z][A-Z0-9_]{1,63})\/(STATE|ACK|SEVERITY|CONFIDENCE|QUALITY)$/.exec(
      logicalPointId,
    );
  return match
    ? {
        targetId: match[1]!,
        alarmCode: match[2]!,
        field: match[3]! as AlarmPublicationField,
      }
    : null;
}

function projectionValue(field: AlarmPublicationField, active: readonly AlarmOccurrence[]): number {
  if (field === 'STATE') return active.length ? 1 : 0;
  if (field === 'ACK') {
    return active.length > 0 && active.every((item) => item.acknowledgement === 'ACKNOWLEDGED')
      ? 1
      : 0;
  }
  if (field === 'SEVERITY') {
    return active.reduce((highest, item) => Math.max(highest, SEVERITY_CODE[item.severity]), 0);
  }
  if (field === 'CONFIDENCE') {
    return active.reduce(
      (highest, item) => Math.max(highest, item.confidence ? CONFIDENCE_CODE[item.confidence] : 0),
      0,
    );
  }
  return 1;
}

export async function projectAlarmPublicationSignals(
  requests: readonly AlarmPublicationRequest[],
  alarms: AlarmRepository,
  topology: TopologyRepository,
  now = new Date().toISOString(),
): Promise<Signal[]> {
  if (!requests.length) return [];
  const active = await alarms.listActive();
  const output: Signal[] = [];

  for (const request of requests) {
    const parsed = parseAlarmPublicationLogicalPoint(request.logicalPointId);
    if (!parsed) continue;

    const target = await topology.getById(parsed.targetId);
    const validTarget =
      target &&
      target.lifecycle === 'ACTIVE' &&
      (target.kind === 'DEVICE' || target.kind === 'EQUIPMENT');

    const matching = validTarget
      ? active.filter(
          (item) =>
            item.targetId === parsed.targetId &&
            item.targetType === target.kind &&
            item.alarmCode === parsed.alarmCode,
        )
      : [];

    const value = validTarget ? projectionValue(parsed.field, matching) : null;
    const alarmState =
      parsed.field === 'STATE'
        ? validTarget
          ? matching.length
            ? 'ACTIVE'
            : 'RESOLVED'
          : 'UNKNOWN'
        : null;

    output.push({
      id: request.signalId,
      logicalPointId: request.logicalPointId,
      publicationSignalId: request.signalId,
      authoritative: true,
      key: request.logicalPointId,
      sourceIdentity: 'ALARM_ENGINE',
      protocol: 'ALARM',
      targetId: parsed.targetId,
      kind: parsed.field === 'STATE' ? 'alarm' : 'state',
      mibName: null,
      interpretation: 'PROFILE',
      rawType: 'number',
      rawValue: value,
      value,
      unit: '',
      scale: null,
      quality: validTarget ? 'VALID' : 'INVALID',
      alarmState,
      severity: null,
      profileVersion: 'alarm-publication-v1',
      receivedAt: now,
      observedAt: now,
      staleMs: 10_000,
      eventId: `alarm-publication:${parsed.targetId}:${parsed.alarmCode}:${parsed.field}`,
    });
  }

  return output;
}
