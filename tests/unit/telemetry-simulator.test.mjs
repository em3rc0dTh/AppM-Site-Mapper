import { describe, expect, it } from 'vitest';

import {
  buildSyntheticCycle,
  nextMessageId,
} from '../../scripts/telemetry-simulator/generator.mjs';

describe('synthetic telemetry generator', () => {
  it('mirrors the observed three-fragment legacy payload shape deterministically', () => {
    const input = {
      serialNumber: 'DEMO25110703400009',
      cycle: 0,
      firstMessageId: 597,
      epochSeconds: 1_773_845_510,
      seed: 251107,
    };

    const first = buildSyntheticCycle(input);
    const replay = buildSyntheticCycle(input);

    expect(first).toEqual(replay);
    expect(first.map((frame) => frame.msgid)).toEqual(['597', '598', '599']);
    expect(Object.keys(first[0].reported)).toEqual(['0_1_21', '0_1_22', '0_1_23', '0_1_24']);
    expect(Object.keys(first[1].reported)).toEqual([
      '0_1_1',
      '0_1_2',
      '0_1_3',
      '0_1_4',
      '0_1_5',
      '0_1_6',
      '0_1_7',
      '0_1_8',
      '0_1_9',
      '0_1_10',
    ]);
    expect(Object.keys(first[2].reported)).toEqual([
      '0_1_11',
      '0_1_12',
      '0_1_13',
      '0_1_14',
      '0_1_15',
      '0_1_16',
      '0_1_17',
      '0_1_18',
      '0_1_19',
      '0_1_20',
    ]);

    expect(first[1].sn).toBe(input.serialNumber);
    expect(first[1].timestamp).toBe(input.epochSeconds);
    expect(first[1].sendtime).toBe(input.epochSeconds);
    expect(first[1].method).toBe('update');
    expect(first[1].version).toBe(1);
    expect(first[1].reported['0_1_1']).toMatchObject({
      state: 'ONLINE',
      U2: '0.00',
      I2: '0.00',
      P2: '0.00',
      EP2: '0.00',
    });
    expect(first[2].reported['0_1_13']).toEqual({ state: 'ONLINE' });
    expect(nextMessageId(first, 1)).toBe(600);
  });
});
