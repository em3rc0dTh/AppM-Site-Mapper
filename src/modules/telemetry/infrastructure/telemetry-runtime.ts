import { requireRuntimeSecret } from '@/config/env';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { NativeMqttSource } from '@/modules/telemetry/infrastructure/native-mqtt-source';
import { createTopologyRepository } from '@/modules/topology/infrastructure/topology-repository-factory';
import { logger } from '@/shared/infrastructure/logger';

export interface TelemetryRuntime {
  readonly hub: TelemetryHub;
  readonly service: TelemetryService;
}

let runtimePromise: Promise<TelemetryRuntime> | undefined;
let source: NativeMqttSource | undefined;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getTelemetryRuntime(): Promise<TelemetryRuntime> {
  runtimePromise ??= (async () => {
    const maxStreams = positiveInt(
      process.env.TELEMETRY_MAX_STREAMS,
      100,
    );
    const maxPayloadBytes = positiveInt(
      process.env.TELEMETRY_MAX_PAYLOAD_BYTES,
      262_144,
    );
    const topicPrefix =
      process.env.MQTT_TOPIC_PREFIX?.trim() || 'data/dev/';
    const hub = new TelemetryHub(maxStreams);
    const topologyRepository = await createTopologyRepository();
    const service = new TelemetryService(topologyRepository, hub, {
      topicPrefix,
      maxPayloadBytes,
    });

    if (process.env.TELEMETRY_ENABLED === 'true' && !source) {
      const brokerUrl = requireRuntimeSecret(
        'MQTT_BROKER_URL',
        process.env.MQTT_BROKER_URL,
      );
      const topicFilter =
        process.env.MQTT_TOPIC_FILTER?.trim() || `${topicPrefix}#`;

      source = new NativeMqttSource(
        {
          brokerUrl,
          topicFilter,
          ...(process.env.MQTT_USERNAME?.trim()
            ? { username: process.env.MQTT_USERNAME.trim() }
            : {}),
          ...(process.env.MQTT_PASSWORD?.trim()
            ? { password: process.env.MQTT_PASSWORD }
            : {}),
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
  })();

  return runtimePromise;
}
