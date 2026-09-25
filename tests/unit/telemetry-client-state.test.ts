import { describe, expect, it } from 'vitest';

import {
  dedupeTelemetrySamples,
  upsertTelemetrySample,
} from '@/components/telemetry/telemetry-client-state';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function sample(entityId: string, receivedAt: string): TelemetrySample {
  return {
    entityId,
    entityKind: 'DEVICE',
    sourceId: `source-${entityId}`,
    sourceIdentity: `SN-${entityId}`,
    serialNumber: `SN-${entityId}`,
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'legacy-appm-v1',
    reported: {},
    observedAt: receivedAt,
    receivedAt,
    timestampProvenance: 'DEVICE',
  };
}

describe('telemetry client state', () => {
  it('deduplicates an initial snapshot by entity identity', () => {
    const older = sample('device-1', '2026-09-25T03:00:00.000Z');
    const newer = sample('device-1', '2026-09-25T03:00:01.000Z');

    expect(dedupeTelemetrySamples([older, newer])).toEqual([newer]);
  });

  it('replaces an entity sample instead of appending a duplicate card', () => {
    const first = sample('device-1', '2026-09-25T03:00:00.000Z');
    const second = sample('device-2', '2026-09-25T03:00:00.000Z');
    const update = sample('device-1', '2026-09-25T03:00:01.000Z');

    expect(upsertTelemetrySample([first, second], update)).toEqual([update, second]);
  });
});
