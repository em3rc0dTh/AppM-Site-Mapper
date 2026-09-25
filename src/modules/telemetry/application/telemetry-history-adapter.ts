import type { TelemetryAcceptanceRecord } from '@/modules/telemetry/domain/acceptance';
import type { CanonicalTelemetryEvent } from '@/modules/telemetry/domain/canonical';
import {
  adaptMyemsAppmBreakerEvent,
  type MyemsAppmBreakerAdapterError,
} from '@/modules/telemetry/domain/myems-appm-breaker-adapter';
import type { Result } from '@/shared/domain/result';

export type TelemetryHistoryAdapterError = MyemsAppmBreakerAdapterError;

export type TelemetryHistoryAdapter = (
  record: TelemetryAcceptanceRecord,
) => Result<CanonicalTelemetryEvent, TelemetryHistoryAdapterError>;

export const adaptTelemetryHistoryRecord: TelemetryHistoryAdapter = (record) =>
  adaptMyemsAppmBreakerEvent(record);
