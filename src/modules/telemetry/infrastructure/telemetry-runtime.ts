import { parseAppEnvironment, requireRuntimeSecret } from '@/config/env';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { NativeMqttSource } from '@/modules/telemetry/infrastructure/native-mqtt-source';
import { createTelemetryRepositories } from '@/modules/telemetry/infrastructure/telemetry-repositories';
import { logger } from '@/shared/infrastructure/logger';
import { getProcessSingleton } from '@/shared/infrastructure/process-singleton';

export interface TelemetryRuntime {
  readonly hub: TelemetryHub;
  readonly service: TelemetryService;
}

function configuredPositiveInt(
  name: string,
  value: string | undefined,
  fallback: number,
  production: boolean,
): number {
  if (!value?.trim()) {
    if (production) {
      throw new Error(`Missing required production telemetry configuration: ${name}`);
    }
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function configuredOrDefault(
  name: string,
  value: string | undefined,
  fallback: string,
  production: boolean,
): string {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  if (production) {
    throw new Error(`Missing required production telemetry configuration: ${name}`);
  }
  return fallback;
}

export async function getTelemetryRuntime(): Promise<TelemetryRuntime> {
  return getProcessSingleton<Promise<TelemetryRuntime>>('telemetry-runtime', async () => {
    const appEnvironment = parseAppEnvironment(process.env.APP_ENV);
    const production = appEnvironment === 'production';
    const maxStreams = configuredPositiveInt(
      'TELEMETRY_MAX_STREAMS',
      process.env.TELEMETRY_MAX_STREAMS,
      100,
      production,
    );
    const maxPayloadBytes = configuredPositiveInt(
      'TELEMETRY_MAX_PAYLOAD_BYTES',
      process.env.TELEMETRY_MAX_PAYLOAD_BYTES,
      262_144,
      production,
    );
    const maxReportedEntries = configuredPositiveInt(
      'TELEMETRY_MAX_REPORTED_ENTRIES',
      process.env.TELEMETRY_MAX_REPORTED_ENTRIES,
      512,
      production,
    );
    const quarantineRetentionDays = configuredPositiveInt(
      'TELEMETRY_QUARANTINE_RETENTION_DAYS',
      process.env.TELEMETRY_QUARANTINE_RETENTION_DAYS,
      14,
      production,
    );
    const topicPrefix = configuredOrDefault(
      'MQTT_TOPIC_PREFIX',
      process.env.MQTT_TOPIC_PREFIX,
      'appmanager/v1/raw/',
      production,
    );
    const topicSuffix = configuredOrDefault(
      'MQTT_TOPIC_SUFFIX',
      process.env.MQTT_TOPIC_SUFFIX,
      '/telemetry',
      production,
    );

    const hub = new TelemetryHub(maxStreams);
    const repositories = await createTelemetryRepositories();
    const service = new TelemetryService(
      repositories.sources,
      repositories.latest,
      repositories.acceptance,
      repositories.quarantine,
      hub,
      {
        topicPrefix,
        topicSuffix,
        maxPayloadBytes,
        maxReportedEntries,
        quarantineRetentionDays,
      },
    );

    if (process.env.TELEMETRY_ENABLED === 'true') {
      const brokerUrl = requireRuntimeSecret('MQTT_BROKER_URL', process.env.MQTT_BROKER_URL);
      const topicFilter = configuredOrDefault(
        'MQTT_TOPIC_FILTER',
        process.env.MQTT_TOPIC_FILTER,
        `${topicPrefix}+${topicSuffix}`,
        production,
      );
      const clientId = configuredOrDefault(
        'MQTT_CLIENT_ID',
        process.env.MQTT_CLIENT_ID,
        'appmanager-site-mapper-ingestor-dev',
        production,
      );

      const source = new NativeMqttSource(
        {
          brokerUrl,
          topicFilter,
          clientId,
          maxReceiveBufferBytes: maxPayloadBytes + 16_384,
          requireTls: production,
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
