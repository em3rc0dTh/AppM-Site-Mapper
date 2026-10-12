import { describe, expect, it } from 'vitest';

import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { resolveBdfbBreakerReadings } from '@/modules/telemetry/domain/breaker-telemetry-view';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const at = '2026-10-12T22:42:39.000Z';
const now = Date.parse(at);
const presentation: BdfbPresentation = {
  deviceId: 'bdfb',
  chassisId: 'chassis',
  shelves: [{
    id: 'shelf', label: 'A', frames: [{
      id: 'frame', label: 'Frame', physical: true, panels: [{
        id: 'panel', label: 'A1', positions: [
          { id: 'cb-1', label: 'CB 1', accessPortId: 'port-1' },
          { id: 'cb-2', label: 'CB 2', accessPortId: 'port-2' },
        ],
      }],
    }],
  }],
};

function sample(targetId: string, reported: Record<string, unknown>): TelemetrySample {
  return {
    bindingId: 'source-binding',
    targetId,
    targetType: 'EQUIPMENT',
    entityId: targetId,
    entityKind: 'EQUIPMENT',
    sourceIdentity: 'SN-1',
    receivedAt: at,
    reported,
  };
}

describe('per-breaker telemetry visualization', () => {
  it('shows independently identified Equipment scalar measurements on its OWN breaker', () => {
    const result = resolveBdfbBreakerReadings(presentation, null, [
      sample('cb-1', {
        voltageV: { value: 13.79, unit: 'V' },
        currentA: { value: 8.55, unit: 'A' },
        powerW: { value: 117.9, unit: 'W' },
        energyKwh: { value: 0.4224, unit: 'kWh' },
        state: 'ONLINE',
      }),
    ], now);

    expect(result['cb-1']?.rawPointId).toBe('OWN SOURCE');
    expect(result['cb-1']?.metrics).toEqual({
      voltageV: { value: 13.79, observedAt: at },
      currentA: { value: 8.55, observedAt: at },
      powerW: { value: 117.9, observedAt: at },
      energyKwh: { value: 0.4224, observedAt: at },
    });
    expect(result['cb-1']?.state?.value).toBe('ONLINE');
    expect(result['cb-2']).toBeUndefined();
  });

  it('does not infer a raw gateway 0_1_1 point from its position', () => {
    const gateway = sample('chassis', { '0_1_1': { U1: 13.79, I1: 8.55 } });
    expect(resolveBdfbBreakerReadings(presentation, null, [gateway], now)).toEqual({});
  });

  it('retains a verified canonical breaker point projection with source evidence', () => {
    const projection: TelemetrySample = {
      ...sample('chassis', {}),
      breakerReadings: [{
        deviceId: 'bdfb', sourceIdentity: 'EMU-BFDB-03',
        shelfId: 'shelf', frameId: 'frame', panelId: 'panel',
        panelLabel: 'A1', breakerId: 'cb-2', breakerLabel: 'CB 2',
        rawPointId: '0_1_2', position: 2, receivedAt: at,
        metrics: { voltageV: { value: 13.81, observedAt: at } },
      }],
    };
    const result = resolveBdfbBreakerReadings(presentation, projection, [], now);
    expect(result['cb-2']?.sourceIdentity).toBe('EMU-BFDB-03');
    expect(result['cb-2']?.rawPointId).toBe('0_1_2');
    expect(result['cb-1']).toBeUndefined();
  });

  it('does not display stale, unbound or differently-unitized own readings as live', () => {
    const stale = { ...sample('cb-1', { voltageV: 13 }), receivedAt: '2026-10-12T22:40:00.000Z' };
    const unboundPoint = { ...sample('cb-1', { voltageV: 13 }), sourcePointId: '0_1_1' };
    const wrongUnit = sample('cb-1', { voltageV: { value: 13, unit: 'C' } });
    expect(resolveBdfbBreakerReadings(presentation, null, [stale, unboundPoint, wrongUnit], now)).toEqual({});
  });

  it('prefers a breaker direct SOURCE over a parent gateway projection', () => {
    const mapped: TelemetrySample = {
      ...sample('chassis', {}),
      breakerReadings: [{
        deviceId: 'bdfb', sourceIdentity: 'EMU-BFDB-03',
        shelfId: 'shelf', frameId: 'frame', panelId: 'panel',
        panelLabel: 'A1', breakerId: 'cb-1', breakerLabel: 'CB 1',
        rawPointId: '0_1_1', position: 1, receivedAt: at,
        metrics: { voltageV: { value: 10, observedAt: at } },
      }],
    };
    const result = resolveBdfbBreakerReadings(
      presentation, mapped, [sample('cb-1', { voltageV: 13.79 })], now,
    );
    expect(result['cb-1']?.metrics.voltageV?.value).toBe(13.79);
    expect(result['cb-1']?.sourceIdentity).toBe('SN-1');
  });
});
