import { describe, expect, it } from 'vitest';

import { assertMqttProductionSecurity } from '@/modules/telemetry/infrastructure/telemetry-runtime';
import { isProductionDeployment } from '@/config/env';

describe('Production telemetry transport gate', () => {
  it('requires TLS and broker credentials in production', () => {
    expect(() => assertMqttProductionSecurity('mqtt://127.0.0.1:1883', 'u', 'p', true)).toThrow(
      'Production MQTT requires mqtts://',
    );
    expect(() =>
      assertMqttProductionSecurity('mqtts://broker.example:8883', '', 'p', true),
    ).toThrow('Production MQTT requires an authenticated broker');
    expect(() =>
      assertMqttProductionSecurity('mqtts://broker.example:8883', 'u', '', true),
    ).toThrow('Production MQTT requires an authenticated broker');
    expect(() =>
      assertMqttProductionSecurity('mqtts://broker.example:8883', 'u', 'p', true),
    ).not.toThrow();
  });

  it('allows local MQTT lab without weakening production policy', () => {
    expect(() =>
      assertMqttProductionSecurity('mqtt://127.0.0.1:1883', undefined, undefined, false),
    ).not.toThrow();
  });
});

describe('Deployment environment precedence', () => {
  it('permits explicit local APP_ENV even with production Next.js runtime', () => {
    expect(isProductionDeployment('development', 'production')).toBe(false);
    expect(isProductionDeployment('test', 'production')).toBe(false);
  });

  it('enforces production security when APP_ENV declares production', () => {
    expect(isProductionDeployment('production', 'development')).toBe(true);
    expect(isProductionDeployment('production', 'production')).toBe(true);
  });
});
