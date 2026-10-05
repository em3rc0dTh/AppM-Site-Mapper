import { requireRuntimeSecret } from '@/config/env';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { createTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/telemetry-binding-repository-factory';
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

function configuredBindings(value: string | undefined): readonly TelemetryBinding[] {
  if (!value?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('MQTT_SOURCE_DEVICE_MAP must be valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MQTT_SOURCE_DEVICE_MAP must be a JSON object.');
  }

  const timestamp = new Date().toISOString();
  return Object.entries(parsed).map(([source, target]) => {
    if (!source.trim() || typeof target !== 'string' || !target.trim()) {
      throw new Error('MQTT_SOURCE_DEVICE_MAP values must map source identities to device IDs.');
    }

    return {
      id: `env:mqtt:${source.trim()}`,
      protocol: 'MQTT' as const,
      sourceIdentity: source.trim(),
      targetType: 'DEVICE' as const,
      targetId: target.trim(),
      lifecycle: 'ACTIVE' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

export async function getTelemetryRuntime(): Promise<TelemetryRuntime> {
  return getProcessSingleton<Promise<TelemetryRuntime>>('telemetry-runtime', async () => {
    const maxStreams = positiveInt(process.env.TELEMETRY_MAX_STREAMS, 100);
    const maxPayloadBytes = positiveInt(process.env.TELEMETRY_MAX_PAYLOAD_BYTES, 262_144);
    const topicPrefix = process.env.MQTT_TOPIC_PREFIX?.trim() || 'data/dev/';
    const hub = new TelemetryHub(maxStreams);
    const topologyRepository = await createTopologyRepository();
    const bindingRepository = await createTelemetryBindingRepository();
    const service = new TelemetryService(
      topologyRepository,
      hub,
      { topicPrefix, maxPayloadBytes },
      { configuredBindings: configuredBindings(process.env.MQTT_SOURCE_DEVICE_MAP) },
      bindingRepository,
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
            logger.warn('telemetry.message.rejected', { topic, reason: result.error });
          }
        },
      );

      source.start();
    }

    return { hub, service };
  });
}
