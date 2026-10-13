import { describe, expect, it } from 'vitest';

import { buildBoundBfdbEquipmentPatches } from '@/modules/telemetry/domain/bfdb-bound-point';
import type {
  NormalizedTelemetryMessage,
  TelemetryBinding,
} from '@/modules/telemetry/domain/entities';

const receivedAt = '2026-10-13T13:55:00.000Z';
const message: NormalizedTelemetryMessage = {
  protocol: 'BFDB',
  topic: 'data/dev/EMU-BFDB-03',
  sourceIdentity: 'EMU-BFDB-03',
  receivedAt,
  sourceObservedAt: receivedAt,
  reported: {
    '0_1_1': {
      state: 'ONLINE',
      U1: '13.78',
      I1: '1.93',
      P1: '26.64',
      EP1: '0.2795',
    },
    '0_1_2': { state: 'ONLINE', U1: '14' },
  },
};
const binding = (metric: string, targetId = 'breaker-01', point = '0_1_1'): TelemetryBinding => ({
  id: `binding:${targetId}:${point}:${metric}`,
  sourceIdentity: 'EMU-BFDB-03',
  protocol: 'MQTT',
  sourcePointId: point,
  metric,
  targetType: 'EQUIPMENT',
  targetId,
  lifecycle: 'ACTIVE',
  createdAt: receivedAt,
  updatedAt: receivedAt,
});

describe('explicit BFDB breaker Equipment projection', () => {
  it('uses verified binding identities, not BDFB power port or panel position', () => {
    const bindings = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'].map((m) => binding(m));
    const result = buildBoundBfdbEquipmentPatches(message, bindings, new Set(['breaker-01']));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      targetId: 'breaker-01',
      sourceIdentity: 'EMU-BFDB-03',
      sourcePointId: '0_1_1',
      reported: {
        voltageV: { value: 13.78, unit: 'V' },
        currentA: { value: 1.93, unit: 'A' },
        powerW: { value: 26.64, unit: 'W' },
        energyKwh: { value: 0.2795, unit: 'kWh' },
        state: 'ONLINE',
      },
    });
    expect(result[0]?.metricBindingIds).toHaveLength(4);
  });

  it('never assigns a panel raw point to an unbound or unverified breaker', () => {
    expect(buildBoundBfdbEquipmentPatches(message, [], new Set(['breaker-01']))).toEqual([]);
    expect(buildBoundBfdbEquipmentPatches(message, [binding('VOLTAGE')], new Set())).toEqual([]);
    expect(
      buildBoundBfdbEquipmentPatches(
        message,
        [binding('VOLTAGE', 'breaker-01', '0_1_3')],
        new Set(['breaker-01']),
      ),
    ).toEqual([]);
  });

  it('rejects conflicting target mappings and duplicate metric bindings', () => {
    expect(
      buildBoundBfdbEquipmentPatches(
        message,
        [binding('VOLTAGE'), binding('CURRENT', 'breaker-02')],
        new Set(['breaker-01', 'breaker-02']),
      ),
    ).toEqual([]);
    expect(
      buildBoundBfdbEquipmentPatches(
        message,
        [binding('VOLTAGE'), { ...binding('VOLTAGE'), id: 'duplicate' }],
        new Set(['breaker-01']),
      ),
    ).toEqual([]);
  });

  it('preserves an explicit electrical zero and drops only missing values', () => {
    const changed: NormalizedTelemetryMessage = {
      ...message,
      reported: { '0_1_1': { U1: '0.00' } },
    };
    const result = buildBoundBfdbEquipmentPatches(
      changed,
      ['VOLTAGE', 'CURRENT'].map((m) => binding(m)),
      new Set(['breaker-01']),
    );
    expect(result[0]?.reported).toEqual({
      voltageV: { value: 0, unit: 'V', observedAt: receivedAt },
    });
  });

  it('rejects generic envelopes and unrelated source identities', () => {
    expect(
      buildBoundBfdbEquipmentPatches(
        { ...message, protocol: 'GENERIC' },
        [binding('VOLTAGE')],
        new Set(['breaker-01']),
      ),
    ).toEqual([]);
    expect(
      buildBoundBfdbEquipmentPatches(
        { ...message, sourceIdentity: 'OTHER-SN' },
        [binding('VOLTAGE')],
        new Set(['breaker-01']),
      ),
    ).toEqual([]);
  });
});
