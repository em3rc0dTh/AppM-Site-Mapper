import { requireRuntimeSecret } from '@/config/env';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { BfdbBindingMode } from '@/modules/telemetry/domain/bfdb';
import { NativeMqttSource } from '@/modules/telemetry/infrastructure/native-mqtt-source';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { logger } from '@/shared/infrastructure/logger';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface TelemetryRuntime {
  readonly hub: TelemetryHub;
  readonly service: TelemetryService;
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

  const entries = Object.entries(parsed).map(([source, target]) => {
    if (!source.trim() || typeof target !== 'string' || !target.trim()) {
      throw new Error('MQTT_SOURCE_DEVICE_MAP values must map source identities to device IDs.');
    }

    return [source.trim(), target.trim()] as const;
  });

  return Object.fromEntries(entries);
}

function bindingMode(value: string | undefined): BfdbBindingMode {
  const candidate = value?.trim() || 'panel-order-24';

  if (candidate !== 'panel-order-24' && candidate !== 'explicit') {
    throw new Error('BFDB_TELEMETRY_BINDING_MODE must be panel-order-24 or explicit.');
  }

  return candidate;
}

export async function getTelemetryRuntime(): Promise<TelemetryRuntime> {
  return getProcessSingleton<Promise<TelemetryRuntime>>('telemetry-runtime', async () => {
    const maxStreams = positiveInt(process.env.TELEMETRY_MAX_STREAMS, 100);
    const maxPayloadBytes = positiveInt(process.env.TELEMETRY_MAX_PAYLOAD_BYTES, 262_144);
    const topicPrefix = process.env.MQTT_TOPIC_PREFIX?.trim() || 'data/dev/';
    const hub = new TelemetryHub(maxStreams);
    const topologyRepository = await createTopologyRepository();
    const service = new TelemetryService(
      topologyRepository,
      hub,
      {
        topicPrefix,
        maxPayloadBytes,
      },
      {
        sourceDeviceMap: sourceDeviceMap(process.env.MQTT_SOURCE_DEVICE_MAP),
        bfdbBindingMode: bindingMode(process.env.BFDB_TELEMETRY_BINDING_MODE),
        bfdbPositionsPerPanel: positiveInt(process.env.BFDB_POSITIONS_PER_PANEL, 24),
      },
    );

    if (process.env.TELEMETRY_ENABLED === 'true') {
      const brokerUrl = requireRuntimeSecret('MQTT_BROKER_URL', process.env.MQTT_BROKER_URL);
      const topicFilter = process.env.MQTT_TOPIC_FILTER?.trim() || `${topicPrefix}#`;

      const source = new NativeMqttSource(
        {
          brokerUrl,
          topicFilter,
          ...(process.env.MQTT_USERNAME?.trim()
            ? { username: process.env.MQTT_USERNAME.trim() }
            : {}),
          ...(process.env.MQTT_PASSWORD?.trim() ? { password: process.env.MQTT_PASSWORD } : {}),
        },
        async (topic, payload) => {
          const result = await service.ingest(topic, payload);

          if (!result.ok) {
            logger.warn('telemetry.message.rejected', {
              topic,
              reason: result.error,
            });
          }
        },
      );

      source.start();
    }

    return { hub, service };
  });
}
