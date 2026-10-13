import { describe, expect, it } from 'vitest';
import { bdfbSourceView } from '@/modules/telemetry/domain/bdfb-source-view';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const time = '2026-10-12T22:00:00.000Z';
const source: TelemetrySample = {
  bindingId: 'binding',
  targetId: 'chassis',
  targetType: 'EQUIPMENT',
  entityId: 'chassis',
  entityKind: 'EQUIPMENT',
  sourceIdentity: 'SN',
  receivedAt: time,
  reported: { unrelated: 99 },
  breakerReadings: [
    {
      deviceId: 'bdfb',
      breakerId: 'breaker',
      sourceIdentity: 'SN',
      receivedAt: time,
      shelfId: 'shelf',
      frameId: 'frame',
      panelId: 'panel',
      panelLabel: 'A1',
      breakerLabel: 'CB',
      rawPointId: '0_1_1',
      position: 1,
      metrics: { currentA: { value: 2, observedAt: time } },
    },
  ],
};

describe('explicit BDFB aggregation across Equipment sources', () => {
  it('keeps canonical breaker provenance without copying source metrics to the parent', () => {
    const result = bdfbSourceView([source], 'bdfb', Date.parse(time));
    expect(result?.breakerReadings).toEqual(source.breakerReadings);
    expect(result?.reported).toEqual({});
    expect(bdfbSourceView([source], 'other-device')).toBeNull();
  });
  it('excludes conflicting publishers and expired metric values', () => {
    const conflict = {
      ...source,
      targetId: 'other-chassis',
      sourceIdentity: 'SN-2',
      breakerReadings: source.breakerReadings!.map((reading) => ({
        ...reading,
        sourceIdentity: 'SN-2',
      })),
    };
    expect(bdfbSourceView([source, conflict], 'bdfb')?.breakerReadings).toEqual([]);
    expect(bdfbSourceView([source], 'bdfb', Date.parse(time) + 31_000)?.breakerReadings).toEqual(
      [],
    );
  });
});
