import type {
  TelemetryReportedEntryRecency,
  TelemetrySample,
} from '@/modules/telemetry/domain/entities';

export interface TelemetryLatestRepository {
  getByEntityId(entityId: string): Promise<TelemetrySample | null>;
  list(): Promise<readonly TelemetrySample[]>;
  upsertIfNewer(sample: TelemetrySample): Promise<boolean>;
}

export function compareTelemetryRecency(left: TelemetrySample, right: TelemetrySample): number {
  const observed = left.observedAt.localeCompare(right.observedAt);
  if (observed !== 0) return observed;
  return left.receivedAt.localeCompare(right.receivedAt);
}

export function buildTelemetryReportedEntryRecency(
  sample: TelemetrySample,
): Readonly<Record<string, TelemetryReportedEntryRecency>> {
  return Object.fromEntries(
    Object.keys(sample.reported).map((key) => [
      key,
      {
        observedAt: sample.observedAt,
        receivedAt: sample.receivedAt,
        timestampProvenance: sample.timestampProvenance,
        ...(sample.messageId === undefined ? {} : { messageId: sample.messageId }),
        ...(sample.sourceMessageId === undefined
          ? {}
          : { sourceMessageId: sample.sourceMessageId }),
      },
    ]),
  );
}

function isSameTelemetryStream(left: TelemetrySample, right: TelemetrySample): boolean {
  return (
    left.entityId === right.entityId &&
    left.sourceId === right.sourceId &&
    left.serialNumber === right.serialNumber &&
    left.protocolProfile === right.protocolProfile &&
    left.rawSchemaVersion === right.rawSchemaVersion
  );
}

export function mergeTelemetrySnapshot(
  current: TelemetrySample | null,
  incoming: TelemetrySample,
): TelemetrySample {
  const incomingRecency = buildTelemetryReportedEntryRecency(incoming);
  const canMerge = current !== null && isSameTelemetryStream(current, incoming);

  return {
    ...incoming,
    reported: canMerge ? { ...current.reported, ...incoming.reported } : { ...incoming.reported },
    reportedEntryRecency: canMerge
      ? { ...current.reportedEntryRecency, ...incomingRecency }
      : incomingRecency,
  };
}
