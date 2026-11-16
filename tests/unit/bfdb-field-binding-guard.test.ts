import { describe, expect, it } from 'vitest';
import { buildBoundBfdbEquipmentPatches } from '@/modules/telemetry/domain/bfdb-bound-point';
import type { NormalizedTelemetryMessage, TelemetryBinding } from '@/modules/telemetry/domain/entities';

const time = '2026-11-16T20:50:00.000Z';
const metrics = (point: string): TelemetryBinding[] =>
  (['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const).map((metric) => ({
    id: point + ':' + metric,
    protocol: 'MQTT',
    sourceIdentity: 'TEST-QDF',
    sourcePointId: point,
    metric,
    targetType: 'EQUIPMENT',
    targetId: 'breaker-b3-01',
    lifecycle: 'ACTIVE',
    createdAt: time,
    updatedAt: time,
  }));

const message = (reported: Record<string, unknown>): NormalizedTelemetryMessage => ({
  topic: 'data/dev/TEST-QDF',
  sourceIdentity: 'TEST-QDF',
  protocol: 'BFDB',
  reported,
  receivedAt: time,
});

describe('field breaker latest-state binding guard', () => {
  const eligible = new Set(['breaker-b3-01']);
  const physical = new Map([['breaker-b3-01', { panelLabel: 'B3', position: 1 }]]);

  it('drops a stale slave-3 B3 binding instead of presenting false LIVE data', () => {
    const patches = buildBoundBfdbEquipmentPatches(
      message({ '0_3_1': { U1: '0.00', U2: '0.00', I1: '7.64', state: 'ONLINE' } }),
      metrics('0_3_1'),
      eligible,
      physical,
    );
    expect(patches).toHaveLength(0);
  });

  it('accepts the physically correct slave-5 channel-1 point', () => {
    const patches = buildBoundBfdbEquipmentPatches(
      message({ '0_5_1': { U1: '14.29', U2: '0.00', I1: '0.00', state: 'ONLINE' } }),
      metrics('0_5_1#1'),
      eligible,
      physical,
    );
    expect(patches).toHaveLength(1);
    expect(patches[0]?.reported).toMatchObject({
      voltageV: { value: 14.29 },
      currentA: { value: 0 },
    });
  });

  it('rejects channel 2 when the breaker occupies panel position 1', () => {
    const patches = buildBoundBfdbEquipmentPatches(
      message({ '0_5_1': { U1: '14.29', U2: '14.30', I1: '0.00', I2: '2.00' } }),
      metrics('0_5_1#2'),
      eligible,
      physical,
    );
    expect(patches).toHaveLength(0);
  });
});
