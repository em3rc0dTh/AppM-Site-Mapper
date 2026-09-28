import { describe, expect, it } from 'vitest';

import { buildBfdbBreakerReadings, resolveBfdbBreaker } from '@/modules/telemetry/domain/bfdb';
import type { DeviceNode } from '@/modules/topology/domain/entities';

const timestamp = '2026-09-28T12:00:00.000Z';

function bdfbDevice(): DeviceNode {
  return {
    id: 'device-bfdb',
    parentId: 'rack',
    name: 'BDFB',
    kind: 'DEVICE',
    serialNumber: 'LOCAL-BFDB',
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    bdfb: {
      shelves: [
        {
          id: 'shelf',
          label: 'Shelf',
          frames: [
            {
              id: 'frame',
              label: 'Frame',
              panels: [
                {
                  id: 'panel-a',
                  label: 'A1',
                  endpoints: [
                    {
                      id: 'breaker-a1',
                      variant: 'BREAKER',
                      label: 'CB-A1-01',
                      telemetry: { rawPointId: '0_9_9' },
                    },
                    { id: 'holder-a2', variant: 'HOLDER', label: 'H-A1-02' },
                  ],
                },
                {
                  id: 'panel-b',
                  label: 'A2',
                  endpoints: [
                    { id: 'breaker-b1', variant: 'BREAKER', label: 'CB-A2-01' },
                    { id: 'breaker-b2', variant: 'BREAKER', label: 'CB-A2-02' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('BFDB telemetry binding', () => {
  it('prefers an explicit raw point binding', () => {
    const resolved = resolveBfdbBreaker(bdfbDevice(), '0_9_9', {
      mode: 'explicit',
      positionsPerPanel: 2,
    });

    expect(resolved?.breaker.id).toBe('breaker-a1');
  });

  it('maps emulator panel order and 1-based position without changing breaker identity', () => {
    const resolved = resolveBfdbBreaker(bdfbDevice(), '0_2_1', {
      mode: 'panel-order-24',
      positionsPerPanel: 2,
    });

    expect(resolved?.panel.id).toBe('panel-b');
    expect(resolved?.breaker.id).toBe('breaker-b1');
    expect(resolved?.position).toBe(1);
  });

  it('normalizes V/I/P/E, preserves explicit zero and does not attach telemetry to holders', () => {
    const result = buildBfdbBreakerReadings(
      bdfbDevice(),
      {
        topic: 'data/dev/EMU-BFDB-01',
        sourceIdentity: 'EMU-BFDB-01',
        protocol: 'BFDB',
        sourceObservedAt: timestamp,
        sourceSentAt: timestamp,
        receivedAt: timestamp,
        reported: {
          '0_2_1': {
            state: 'ONLINE',
            U1: '13.82',
            I1: '0.00',
            P1: '0.00',
            EP1: '0.5074',
          },
          '0_1_2': { state: 'ONLINE', U1: '13.80' },
        },
      },
      { mode: 'panel-order-24', positionsPerPanel: 2 },
    );

    expect(result.readings).toHaveLength(1);
    expect(result.readings[0]?.breakerId).toBe('breaker-b1');
    expect(result.readings[0]?.metrics.currentA?.value).toBe(0);
    expect(result.readings[0]?.metrics.powerW?.value).toBe(0);
    expect(result.unmappedPointIds).toEqual(['0_1_2']);
  });
});
