import { describe, expect, it } from 'vitest';

import { validateMqttBrokerUrl } from '@/modules/telemetry/infrastructure/telemetry-runtime';

describe('production MQTT transport policy', () => {
  it('rejects plaintext mqtt:// in production', () => {
    expect(() => validateMqttBrokerUrl('mqtt://broker.example:1883', 'production')).toThrow(
      'Production telemetry requires MQTT_BROKER_URL to use mqtts://.',
    );
  });

  it('accepts mqtts:// in production', () => {
    expect(validateMqttBrokerUrl('mqtts://broker.example:8883', 'production')).toBe(
      'mqtts://broker.example:8883',
    );
  });

  it('keeps plaintext mqtt:// available for local development', () => {
    expect(validateMqttBrokerUrl('mqtt://127.0.0.1:1883', 'development')).toBe(
      'mqtt://127.0.0.1:1883',
    );
  });

  it('rejects non-MQTT URL schemes', () => {
    expect(() => validateMqttBrokerUrl('https://broker.example', 'production')).toThrow(
      'MQTT_BROKER_URL must use mqtt:// or mqtts://.',
    );
  });
});
