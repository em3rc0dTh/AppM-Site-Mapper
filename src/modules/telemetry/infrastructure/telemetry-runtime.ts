import { requireRuntimeSecret } from '@/config/env';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { TelemetryHistoryWriterDiagnostics } from '@/modules/telemetry/application/telemetry-history-writer';
import type { BfdbBindingMode } from '@/modules/telemetry/domain/bfdb';
import { createTelemetryStoreClient } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import { NativeMqttSource } from '@/modules/telemetry/infrastructure/native-mqtt-source';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { logger } from '@/shared/infrastructure/logger';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

// Live MQTT diagnostics count actual accepted source messages; never simulate broker health.
export interface TelemetrySourceDiagnostic {
  readonly serial: string;
  readonly rawMessages: number;
  readonly lastRawAt: string | null;
  readonly mappedDeviceId: string | null;
  readonly pointCount: number;
  readonly mappedBreakerCount: number;
  readonly unmappedPointCount: number;
  readonly freshness: 'LIVE' | 'STALE' | 'OFFLINE';
}

export interface TelemetryDiagnostics {
  readonly enabled: boolean;
  readonly connection:
    'disabled' | 'idle' | 'connecting' | 'subscribing' | 'subscribed' | 'reconnecting' | 'stopped';
  readonly topicFilter: string;
  readonly lastSubscribedAt: string | null;
  readonly lastConnectionError: string | null;
  readonly rawMessages: number;
  readonly acceptedMessages: number;
  readonly rejectedMessages: number;
  readonly lastRawAt: string | null;
  readonly lastAcceptedAt: string | null;
  readonly rejectionReasons: Readonly<Record<string, number>>;
  readonly sources: readonly TelemetrySourceDiagnostic[];
  readonly history: TelemetryHistoryWriterDiagnostics;
}

export interface TelemetryRuntime {
  readonly hub: TelemetryHub;
  readonly service: TelemetryService;
  readonly diagnostics: () => TelemetryDiagnostics;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sourceDeviceMap(value: string | undefined): Readonly<Record<string, string>> {
  if (!value?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('MQTT_SOURCE_DEVICE_MAP must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MQTT_SOURCE_DEVICE_MAP must be a JSON object.');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([source, target]) => {
      if (!source.trim() || typeof target !== 'string' || !target.trim()) {
        throw new Error('MQTT_SOURCE_DEVICE_MAP must map source identities to device IDs.');
      }
      return [source.trim(), target.trim()] as const;
    }),
  );
}

function bindingMode(value: string | undefined): BfdbBindingMode {
  const candidate = value?.trim() || 'panel-order-24';
  if (candidate !== 'panel-order-24' && candidate !== 'explicit') {
    throw new Error('BFDB_TELEMETRY_BINDING_MODE must be panel-order-24 or explicit.');
  }
  return candidate;
}

function expectedSources(value: string | undefined): readonly string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export async function getTelemetryRuntime(): Promise<TelemetryRuntime> {
  return getProcessSingleton<Promise<TelemetryRuntime>>('telemetry-runtime', async () => {
    const maxStreams = positiveInt(process.env.TELEMETRY_MAX_STREAMS, 100);
    const maxPayloadBytes = positiveInt(process.env.TELEMETRY_MAX_PAYLOAD_BYTES, 262_144);
    const topicPrefix = process.env.MQTT_TOPIC_PREFIX?.trim() || 'data/dev/';
    const topicFilter = process.env.MQTT_TOPIC_FILTER?.trim() || `${topicPrefix}#`;
    const expected = expectedSources(process.env.MQTT_EXPECTED_SOURCES);
    const enabled = process.env.TELEMETRY_ENABLED === 'true';
    const historyEnabled = enabled && process.env.TELEMETRY_HISTORY_ENABLED === 'true';
    const historyStore = historyEnabled ? createTelemetryStoreClient() : null;
    const hub = new TelemetryHub(maxStreams);
    const topologyRepository = await createTopologyRepository();
    const service = new TelemetryService(
      topologyRepository,
      hub,
      { topicPrefix, maxPayloadBytes },
      {
        sourceDeviceMap: sourceDeviceMap(process.env.MQTT_SOURCE_DEVICE_MAP),
        bfdbBindingMode: bindingMode(process.env.BFDB_TELEMETRY_BINDING_MODE),
        bfdbPositionsPerPanel: positiveInt(process.env.BFDB_POSITIONS_PER_PANEL, 24),
      },
      historyStore ?? undefined,
    );

    const counts = new Map<string, { messages: number; lastRawAt: string }>();
    const rejectionReasons: Record<string, number> = {};
    let rawMessages = 0;
    let acceptedMessages = 0;
    let rejectedMessages = 0;
    let lastRawAt: string | null = null;
    let lastAcceptedAt: string | null = null;
    let source: NativeMqttSource | null = null;

    if (enabled) {
      const brokerUrl = requireRuntimeSecret('MQTT_BROKER_URL', process.env.MQTT_BROKER_URL);
      source = new NativeMqttSource(
        {
          brokerUrl,
          topicFilter,
          ...(process.env.MQTT_USERNAME?.trim()
            ? { username: process.env.MQTT_USERNAME.trim() }
            : {}),
          ...(process.env.MQTT_PASSWORD?.trim() ? { password: process.env.MQTT_PASSWORD } : {}),
        },
        async (topic, payload) => {
          const now = new Date().toISOString();
          const serial = topic.startsWith(topicPrefix)
            ? (topic.slice(topicPrefix.length).split('/')[0] ?? '')
            : '';
          rawMessages += 1;
          lastRawAt = now;
          if (serial) {
            const old = counts.get(serial);
            if (old || counts.size < 100) {
              counts.set(serial, { messages: (old?.messages ?? 0) + 1, lastRawAt: now });
            }
          }

          const result = await service.ingest(topic, payload);
          if (!result.ok) {
            rejectedMessages += 1;
            rejectionReasons[result.error] = (rejectionReasons[result.error] ?? 0) + 1;
            logger.warn('telemetry.message.rejected', { topic, reason: result.error });
          } else {
            acceptedMessages += 1;
            lastAcceptedAt = now;
          }
        },
      );
      source.start();
    }

    return {
      hub,
      service,
      diagnostics: () => {
        const allSamples = service.snapshot();
        const identities = [...new Set([...expected, ...counts.keys()])];
        const now = Date.now();
        const state = source?.diagnostics();
        return {
          enabled,
          connection: state?.state ?? 'disabled',
          topicFilter,
          lastSubscribedAt: state?.lastSubscribedAt ?? null,
          lastConnectionError: state?.lastError ?? null,
          rawMessages,
          acceptedMessages,
          rejectedMessages,
          lastRawAt,
          lastAcceptedAt,
          rejectionReasons: { ...rejectionReasons },
          history:
            historyStore?.diagnostics() ?? {
              enabled: false,
              writes: 0,
              rowsAccepted: 0,
              failures: 0,
              lastWriteAt: null,
              lastError: null,
            },
          sources: identities.map((serial) => {
            const incoming = counts.get(serial);
            const sample = allSamples.find((item) => item.sourceIdentity === serial);
            const age = sample ? now - Date.parse(sample.receivedAt) : Number.POSITIVE_INFINITY;
            return {
              serial,
              rawMessages: incoming?.messages ?? 0,
              lastRawAt: incoming?.lastRawAt ?? null,
              mappedDeviceId: sample?.entityId ?? null,
              pointCount: sample ? Object.keys(sample.reported).length : 0,
              mappedBreakerCount: sample?.breakerReadings?.length ?? 0,
              unmappedPointCount: sample?.unmappedPointIds?.length ?? 0,
              freshness:
                !sample || age > 300_000 || state?.state !== 'subscribed'
                  ? 'OFFLINE'
                  : age > 15_000
                    ? 'STALE'
                    : 'LIVE',
            };
          }),
        };
      },
    };
  });
}
