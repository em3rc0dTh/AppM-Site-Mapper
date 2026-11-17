import { describe, expect, it } from 'vitest';

import {
  detectBfdbWireProfile,
  resolveBfdbWireProfile,
} from '@/modules/telemetry/domain/bfdb-wire-layout';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

const now = '2026-11-16T21:30:00.000Z';

function binding(profile?: 'FIELD_DUAL_12' | 'LEGACY_SINGLE_24'): TelemetryBinding {
  return {
    id: 'binding-' + (profile ?? 'unset'),
    protocol: 'MQTT',
    sourceIdentity: 'TEST-SOURCE',
    sourcePointId: '0_1_1',
    metric: 'VOLTAGE',
    targetType: 'EQUIPMENT',
    targetId: 'breaker-1',
    lifecycle: 'ACTIVE',
    ...(profile ? { attributes: { wireProfile: profile } } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

const ambiguousDualPayload = {
  '0_1_1': {
    state: 'ONLINE',
    U1: 13.79,
    U2: 0,
    I1: 9.91,
    I2: 0,
    P1: 136.72,
    P2: 0,
    EP1: 0.4155,
    EP2: 0,
  },
};

describe('BFDB wire profile resolution', () => {
  it('preserves payload detection for existing bindings without declarations', () => {
    expect(detectBfdbWireProfile(ambiguousDualPayload)).toBe('FIELD_DUAL_12');

    expect(resolveBfdbWireProfile(ambiguousDualPayload, [binding()])).toEqual({
      effective: 'FIELD_DUAL_12',
      detected: 'FIELD_DUAL_12',
      declared: null,
      source: 'DETECTED',
      mismatch: false,
      declarationConflict: false,
    });
  });

  it('uses an explicit legacy declaration without weakening field detection globally', () => {
    expect(resolveBfdbWireProfile(ambiguousDualPayload, [binding('LEGACY_SINGLE_24')])).toEqual({
      effective: 'LEGACY_SINGLE_24',
      detected: 'FIELD_DUAL_12',
      declared: 'LEGACY_SINGLE_24',
      source: 'DECLARED',
      mismatch: true,
      declarationConflict: false,
    });
  });

  it('uses an explicit field declaration as the physical contract', () => {
    const field = {
      '0_5_1': { U1: 14.29, U2: 0, I1: 0, I2: 0, state: 'ONLINE' },
    };
    expect(resolveBfdbWireProfile(field, [binding('FIELD_DUAL_12')])).toMatchObject({
      effective: 'FIELD_DUAL_12',
      declared: 'FIELD_DUAL_12',
      source: 'DECLARED',
      declarationConflict: false,
    });
  });

  it('falls back to detection when declarations conflict instead of silently choosing one', () => {
    const resolved = resolveBfdbWireProfile(ambiguousDualPayload, [
      binding('FIELD_DUAL_12'),
      { ...binding('LEGACY_SINGLE_24'), id: 'binding-legacy-2', metric: 'CURRENT' },
    ]);

    expect(resolved.effective).toBe('FIELD_DUAL_12');
    expect(resolved.source).toBe('DETECTED');
    expect(resolved.declarationConflict).toBe(true);
  });
});
