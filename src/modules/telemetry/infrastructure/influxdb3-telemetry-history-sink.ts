import type { TelemetryHistorySink } from '@/modules/telemetry/application/telemetry-history-sink';
import type {
  CanonicalTelemetryEvent,
  CanonicalTelemetryMetric,
} from '@/modules/telemetry/domain/canonical';

type HistoryFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface InfluxDb3TelemetryHistorySinkOptions {
  readonly endpoint: string;
  readonly database: string;
  readonly token: string;
  readonly measurement?: string;
  readonly requireTls?: boolean;
}

function requireNonEmpty(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function escapeMeasurement(value: string): string {
  return value.replaceAll(',', '\\,').replaceAll(' ', '\\ ');
}

function escapeTag(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll('=', '\\=')
    .replaceAll(' ', '\\ ');
}

function escapeStringField(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function observedAtNanoseconds(observedAt: string): string {
  const milliseconds = Date.parse(observedAt);
  if (!Number.isFinite(milliseconds)) {
    throw new Error('Telemetry observedAt must be a valid timestamp.');
  }

  return (BigInt(milliseconds) * 1_000_000n).toString();
}

function metricLine(
  measurement: string,
  event: CanonicalTelemetryEvent,
  metric: CanonicalTelemetryMetric,
): string {
  if (!Number.isFinite(metric.value)) {
    throw new Error('Telemetry metric value must be finite.');
  }

  const tags = [
    `event_id=${escapeTag(event.eventId)}`,
    `source_id=${escapeTag(event.sourceId)}`,
    `entity_id=${escapeTag(event.entityId)}`,
    `entity_kind=${escapeTag(event.entityKind)}`,
    `component_address=${escapeTag(metric.componentAddress)}`,
    `metric_key=${escapeTag(metric.key)}`,
    `channel=${metric.channel}`,
    `quality=${escapeTag(metric.quality)}`,
    `derivation=${escapeTag(metric.derivation)}`,
    `protocol_profile=${escapeTag(event.protocolProfile)}`,
    `metric_catalog=${escapeTag(event.metricCatalogVersion)}`,
  ].join(',');

  const fields = [
    `value=${metric.value}`,
    `unit="${escapeStringField(metric.unit)}"`,
    `serial_number="${escapeStringField(event.serialNumber)}"`,
    `received_at="${escapeStringField(event.receivedAt)}"`,
    `raw_key="${escapeStringField(metric.rawKey)}"`,
    `raw_schema_version="${escapeStringField(event.rawSchemaVersion)}"`,
    `timestamp_provenance="${escapeStringField(event.timestampProvenance)}"`,
    ...(event.sequence === undefined ? [] : [`sequence=${event.sequence}i`]),
    ...(event.producerEpoch === undefined
      ? []
      : [`producer_epoch="${escapeStringField(event.producerEpoch)}"`]),
    ...(event.messageId === undefined
      ? []
      : [`message_id="${escapeStringField(event.messageId)}"`]),
  ].join(',');

  return `${escapeMeasurement(measurement)},${tags} ${fields} ${observedAtNanoseconds(event.observedAt)}`;
}

export class InfluxDb3TelemetryHistorySink implements TelemetryHistorySink {
  private readonly endpoint: URL;
  private readonly database: string;
  private readonly token: string;
  private readonly measurement: string;

  constructor(
    options: InfluxDb3TelemetryHistorySinkOptions,
    private readonly fetchImpl: HistoryFetch = fetch,
  ) {
    this.endpoint = new URL(requireNonEmpty('InfluxDB endpoint', options.endpoint));
    this.database = requireNonEmpty('InfluxDB database', options.database);
    this.token = requireNonEmpty('InfluxDB token', options.token);
    this.measurement = requireNonEmpty(
      'InfluxDB measurement',
      options.measurement ?? 'appm_telemetry_metric',
    );

    if (options.requireTls && this.endpoint.protocol !== 'https:') {
      throw new Error('InfluxDB endpoint must use HTTPS when TLS is required.');
    }

    if (!['http:', 'https:'].includes(this.endpoint.protocol)) {
      throw new Error('InfluxDB endpoint must use HTTP or HTTPS.');
    }
  }

  async write(event: CanonicalTelemetryEvent): Promise<void> {
    if (event.metrics.length === 0) {
      return;
    }

    const url = new URL('/api/v3/write_lp', this.endpoint);
    url.searchParams.set('db', this.database);
    url.searchParams.set('precision', 'nanosecond');
    url.searchParams.set('accept_partial', 'false');
    url.searchParams.set('no_sync', 'false');

    const body = event.metrics
      .map((metric) => metricLine(this.measurement, event, metric))
      .join('\n');
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body,
    });

    if (response.status !== 204) {
      const error = new Error(`InfluxDB history write failed with HTTP ${response.status}.`);
      error.name = 'INFLUXDB_HISTORY_WRITE_FAILED';
      throw error;
    }
  }
}
