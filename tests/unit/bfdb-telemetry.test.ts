import { describe, expect, it } from 'vitest';

import type { BdfbPresentation } from '@/modules/power/domain/bdfb-model';
import { buildBfdbBreakerReadings } from '@/modules/telemetry/domain/bfdb';
import type {
  NormalizedTelemetryMessage,
  TelemetryBinding,
} from '@/modules/telemetry/domain/entities';

const timestamp = '2026-09-28T12:00:00.000Z';

const presentation: BdfbPresentation = {
  deviceId: 'device-bfdb',
  chassisId: 'chassis',
  shelves: [
    {
      id: 'shelf',
      label: 'Shelf',
      frames: [
        {
          id: 'frame',
          label: 'Frame',
          physical: true,
          panels: [
            {
              id: 'panel-a',
              label: 'A1',
              positions: [
                {
                  id: 'breaker-a1',
                  label: 'CB-A1-01',
                  accessPortId: 'breaker-a1:power-out',
                },
                null,
              ],
            },
          ],
        },
      ],
    },
  ],
};

function binding(sourcePointId: string, targetId: string): TelemetryBinding {
  return {
    id: 'binding-' + sourcePointId,
    protocol: 'MQTT',
    sourceIdentity: 'EMU-BFDB-01',
    sourcePointId,
    targetType: 'EQUIPMENT',
    targetId,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function message(reported: Readonly<Record<string, unknown>>): NormalizedTelemetryMessage {
  return {
    topic: 'data/dev/EMU-BFDB-01',
    sourceIdentity: 'EMU-BFDB-01',
    protocol: 'BFDB',
    sourceObservedAt: timestamp,
    sourceSentAt: timestamp,
    receivedAt: timestamp,
    reported,
  };
}

describe('BFDB telemetry binding', () => {
  it('maps a raw point only through an explicit TelemetryBinding', () => {
    const result = buildBfdbBreakerReadings(
      presentation,
      message({ '0_9_9': { U1: '13.82' } }),
      [binding('0_9_9', 'breaker-a1')],
    );

    expect(result.readings[0]?.breakerId).toBe('breaker-a1');
    expect(result.unmappedPointIds).toEqual([]);
  });

  it('preserves explicit zero metrics', () => {
    const result = buildBfdbBreakerReadings(
      presentation,
      message({
        '0_9_9': {
          state: 'ONLINE',
          U1: '13.82',
          I1: '0.00',
          P1: '0.00',
          EP1: '0.5074',
        },
      }),
      [binding('0_9_9', 'breaker-a1')],
    );

    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]?.metrics.currentA?.value).toBe(0);
    expect(result.readings[0]?.metrics.powerW?.value).toBe(0);
    expect(result.readings[0]?.state?.value).toBe('ONLINE');
  });

  it('reports points without an unambiguous binding as unmapped', () => {
    const result = buildBfdbBreakerReadings(
      presentation,
      message({ '0_1_2': { state: 'ONLINE', U1: '13.80' } }),
      [],
    );

    expect(result.readings).toHaveLength(0);
    expect(result.unmappedPointIds).toEqual(['0_1_2']);
  });
});
