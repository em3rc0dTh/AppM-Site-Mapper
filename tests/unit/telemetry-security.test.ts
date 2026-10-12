import { describe, expect, it } from 'vitest';

import { assertMqttProductionSecurity } from '@/modules/telemetry/infrastructure/telemetry-runtime';

describe('Production telemetry transport gate', () => {
  it('requires TLS and broker credentials in production', () => {
    expect(() => assertMqttProductionSecurity('mqtt://127.0.0.1:1883', 'u', 'p', true))
      .toThrow('Production MQTT requires mqtts://');
    expect(() => assertMqttProductionSecurity('mqtts://broker.example:8883', '', 'p', true))
      .toThrow('Production MQTT requires an authenticated broker');
    expect(() => assertMqttProductionSecurity('mqtts://broker.example:8883', 'u', '', true))
      .toThrow('Production MQTT requires an authenticated broker');
    expect(() => assertMqttProductionSecurity('mqtts://broker.example:8883', 'u', 'p', true))
      .not.toThrow();
  });

  it('allows local MQTT lab without weakening production policy', () => {
    expect(() => assertMqttProductionSecurity('mqtt://127.0.0.1:1883', undefined, undefined, false))
      .not.toThrow();
  });
});
