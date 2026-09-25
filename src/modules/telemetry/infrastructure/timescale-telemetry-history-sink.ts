import { createHash } from 'node:crypto';

import type { TelemetryHistorySink } from '@/modules/telemetry/application/telemetry-history-sink';
import type {
  CanonicalTelemetryEvent,
  CanonicalTelemetryMetric,
} from '@/modules/telemetry/domain/canonical';

export interface TimescaleQueryResult {
  readonly rows: readonly Record<string, unknown>[];
}

export interface TimescaleSqlClient {
  query(text: string, values: readonly unknown[]): Promise<TimescaleQueryResult>;
}

const UPSERT_POINT_SQL = `
WITH inserted AS (
  INSERT INTO appm_telemetry_history (
    observed_at,
    event_id,
    source_id,
    entity_id,
    entity_kind,
    component_address,
    metric_key,
    channel,
    value,
    unit,
    quality,
    derivation,
    raw_key,
    serial_number,
    protocol_profile,
    raw_schema_version,
    received_at,
    timestamp_provenance,
    sequence,
    producer_epoch,
    message_id,
    metric_catalog_version,
    point_fingerprint
  ) VALUES (
    $1::timestamptz, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17::timestamptz, $18, $19, $20, $21, $22, $23
  )
  ON CONFLICT (observed_at, event_id, component_address, metric_key, channel) DO NOTHING
  RETURNING point_fingerprint
),
resolved AS (
  SELECT point_fingerprint FROM inserted
  UNION ALL
  SELECT point_fingerprint
  FROM appm_telemetry_history
  WHERE observed_at = $1::timestamptz
    AND event_id = $2
    AND component_address = $6
    AND metric_key = $7
    AND channel = $8
)
SELECT point_fingerprint FROM resolved LIMIT 1
`;

function fingerprintPoint(
  event: CanonicalTelemetryEvent,
  metric: CanonicalTelemetryMetric,
): string {
  const canonical = JSON.stringify([
    event.schemaVersion,
    event.metricCatalogVersion,
    event.eventId,
    event.sourceId,
    event.entityId,
    event.entityKind,
    event.serialNumber,
    event.protocolProfile,
    event.rawSchemaVersion,
    event.observedAt,
    event.receivedAt,
    event.timestampProvenance,
    event.sequence ?? null,
    event.producerEpoch ?? null,
    event.messageId ?? null,
    metric.componentAddress,
    metric.key,
    metric.channel,
    metric.value,
    metric.unit,
    metric.quality,
    metric.derivation,
    metric.rawKey,
    metric.sourceState ?? null,
  ]);

  return createHash('sha256').update(canonical).digest('hex');
}

function pointValues(
  event: CanonicalTelemetryEvent,
  metric: CanonicalTelemetryMetric,
  fingerprint: string,
): readonly unknown[] {
  return [
    event.observedAt,
    event.eventId,
    event.sourceId,
    event.entityId,
    event.entityKind,
    metric.componentAddress,
    metric.key,
    metric.channel,
    metric.value,
    metric.unit,
    metric.quality,
    metric.derivation,
    metric.rawKey,
    event.serialNumber,
    event.protocolProfile,
    event.rawSchemaVersion,
    event.receivedAt,
    event.timestampProvenance,
    event.sequence ?? null,
    event.producerEpoch ?? null,
    event.messageId ?? null,
    event.metricCatalogVersion,
    fingerprint,
  ];
}

export class TimescaleTelemetryHistorySink implements TelemetryHistorySink {
  constructor(private readonly client: TimescaleSqlClient) {}

  async write(event: CanonicalTelemetryEvent): Promise<void> {
    for (const metric of event.metrics) {
      if (!Number.isFinite(metric.value)) {
        throw new Error('Telemetry metric value must be finite.');
      }

      const fingerprint = fingerprintPoint(event, metric);
      const result = await this.client.query(UPSERT_POINT_SQL, pointValues(event, metric, fingerprint));
      const persisted = result.rows[0]?.point_fingerprint;

      if (persisted !== fingerprint) {
        const error = new Error(
          'Timescale history point identity already exists with different canonical content.',
        );
        error.name = 'TIMESCALE_HISTORY_CONFLICT';
        throw error;
      }
    }
  }
}
