import { describe, expect, it } from 'vitest';

import { InfluxDb3TelemetryHistorySink } from '@/modules/telemetry/infrastructure/influxdb3-telemetry-history-sink';
import {
  TimescaleTelemetryHistorySink,
  type TimescaleSqlClient,
} from '@/modules/telemetry/infrastructure/timescale-telemetry-history-sink';
import type { CanonicalTelemetryEvent } from '@/modules/telemetry/domain/canonical';

function event(eventId = 'event-1'): CanonicalTelemetryEvent {
  return {
    schemaVersion: 1,
    metricCatalogVersion: 'myems-appm-breaker-v1',
    eventId,
    sourceId: 'source 1',
    entityId: 'equipment-1',
    entityKind: 'EQUIPMENT',
    serialNumber: 'SN-1',
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'telxius-v1',
    observedAt: '2026-09-24T00:00:00.123Z',
    receivedAt: '2026-09-24T00:00:00.456Z',
    timestampProvenance: 'DEVICE',
    sequence: 7,
    metrics: [
      {
        componentAddress: '0_1_1',
        key: 'voltage_v',
        channel: 1,
        value: 48.25,
        unit: 'V',
        quality: 'VALID',
        derivation: 'RAW',
        rawKey: 'U1',
      },
    ],
  };
}

describe('InfluxDb3TelemetryHistorySink', () => {
  it('uses the durable v3 write endpoint with explicit sync and nanosecond precision', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sink = new InfluxDb3TelemetryHistorySink(
      {
        endpoint: 'https://influx.internal:8181',
        database: 'site_mapper',
        token: 'super-secret-token',
        requireTls: true,
      },
      async (input, init) => {
        calls.push({ url: input.toString(), init });
        return new Response(null, { status: 204 });
      },
    );

    await sink.write(event());

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/api/v3/write_lp?');
    expect(calls[0]?.url).toContain('db=site_mapper');
    expect(calls[0]?.url).toContain('precision=nanosecond');
    expect(calls[0]?.url).toContain('accept_partial=false');
    expect(calls[0]?.url).toContain('no_sync=false');
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer super-secret-token',
      'Content-Type': 'text/plain; charset=utf-8',
    });

    const body = String(calls[0]?.init?.body);
    expect(body).toContain('appm_telemetry_metric,event_id=event-1,source_id=source\\ 1');
    expect(body).toContain('component_address=0_1_1,metric_key=voltage_v,channel=1');
    expect(body).toContain('value=48.25');
    expect(body).toContain(' 1758672000123000000');
  });

  it('produces the exact same point on replay and a distinct identity for another event at the same time', async () => {
    const bodies: string[] = [];
    const sink = new InfluxDb3TelemetryHistorySink(
      {
        endpoint: 'http://127.0.0.1:8181',
        database: 'bench',
        token: 'token',
      },
      async (_input, init) => {
        bodies.push(String(init?.body));
        return new Response(null, { status: 204 });
      },
    );

    await sink.write(event('event-1'));
    await sink.write(event('event-1'));
    await sink.write(event('event-2'));

    expect(bodies[0]).toBe(bodies[1]);
    expect(bodies[2]).not.toBe(bodies[0]);
    expect(bodies[2]).toContain('event_id=event-2');
  });

  it('fails without leaking the token when Influx rejects a write', async () => {
    const sink = new InfluxDb3TelemetryHistorySink(
      {
        endpoint: 'https://influx.internal:8181',
        database: 'site_mapper',
        token: 'must-not-leak',
      },
      async () => new Response('backend details', { status: 503 }),
    );

    await expect(sink.write(event())).rejects.toMatchObject({
      name: 'INFLUXDB_HISTORY_WRITE_FAILED',
      message: 'InfluxDB history write failed with HTTP 503.',
    });

    await expect(sink.write(event())).rejects.not.toThrow(/must-not-leak|backend details/);
  });
});

describe('TimescaleTelemetryHistorySink', () => {
  it('treats an exact point replay as idempotent using its canonical fingerprint', async () => {
    const valuesSeen: readonly unknown[][] = [];
    const mutableValues = valuesSeen as unknown[][];
    const client: TimescaleSqlClient = {
      async query(_sql, values) {
        mutableValues.push(values);
        return { rows: [{ point_fingerprint: values[22] }] };
      },
    };

    const sink = new TimescaleTelemetryHistorySink(client);
    await sink.write(event('event-1'));
    await sink.write(event('event-1'));

    expect(valuesSeen).toHaveLength(2);
    expect(valuesSeen[0]).toEqual(valuesSeen[1]);
    expect(valuesSeen[0]?.[1]).toBe('event-1');
    expect(valuesSeen[0]?.[5]).toBe('0_1_1');
    expect(valuesSeen[0]?.[6]).toBe('voltage_v');
  });

  it('fails closed when an existing point has different canonical content', async () => {
    const client: TimescaleSqlClient = {
      async query() {
        return { rows: [{ point_fingerprint: '0'.repeat(64) }] };
      },
    };

    const sink = new TimescaleTelemetryHistorySink(client);

    await expect(sink.write(event())).rejects.toMatchObject({
      name: 'TIMESCALE_HISTORY_CONFLICT',
    });
  });
});
