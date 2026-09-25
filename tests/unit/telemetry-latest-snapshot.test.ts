import { describe, expect, it } from 'vitest';

import { mergeTelemetrySnapshot } from '@/modules/telemetry/application/telemetry-latest-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    entityId: 'equipment-1',
    entityKind: 'EQUIPMENT',
    sourceId: 'source-1',
    sourceIdentity: 'SN-1',
    serialNumber: 'SN-1',
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'legacy-appm-v1',
    reported: { '0_1_1': { state: 'ONLINE', U1: '12.20' } },
    observedAt: '2026-03-18T14:51:50.000Z',
    receivedAt: '2026-09-24T00:00:01.000Z',
    timestampProvenance: 'DEVICE',
    sourceMessageId: '598',
    simulated: true,
    ...overrides,
  };
}

describe('telemetry latest snapshot merge', () => {
  it('merges top-level reported entries only within the same hardware stream', () => {
    const first = mergeTelemetrySnapshot(null, sample());
    const merged = mergeTelemetrySnapshot(
      first,
      sample({
        reported: { '0_1_11': { state: 'ONLINE', U1: '0.00' } },
        receivedAt: '2026-09-24T00:00:02.000Z',
        sourceMessageId: '599',
      }),
    );

    expect(merged.reported).toEqual({
      '0_1_1': { state: 'ONLINE', U1: '12.20' },
      '0_1_11': { state: 'ONLINE', U1: '0.00' },
    });
    expect(merged.reportedEntryRecency?.['0_1_1']?.sourceMessageId).toBe('598');
    expect(merged.reportedEntryRecency?.['0_1_11']?.sourceMessageId).toBe('599');
  });

  it('resets instead of mixing state when the physical source changes', () => {
    const first = mergeTelemetrySnapshot(null, sample());
    const replaced = mergeTelemetrySnapshot(
      first,
      sample({
        sourceId: 'source-2',
        sourceIdentity: 'SN-2',
        serialNumber: 'SN-2',
        reported: { '0_1_2': { state: 'ONLINE', U1: '13.00' } },
      }),
    );

    expect(replaced.reported).toEqual({
      '0_1_2': { state: 'ONLINE', U1: '13.00' },
    });
    expect(replaced.reportedEntryRecency?.['0_1_1']).toBeUndefined();
  });
});
