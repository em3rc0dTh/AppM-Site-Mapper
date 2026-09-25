import { describe, expect, it } from 'vitest';

import { endpointTelemetry } from '@/components/power/bdfb-telemetry';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

function sample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    entityId: 'demo-device-qdf-01',
    entityKind: 'DEVICE',
    sourceId: 'sim-demo-qdf-01',
    sourceIdentity: 'DEMO25110703400009',
    serialNumber: 'DEMO25110703400009',
    protocolProfile: 'myems-appm-breaker-v1',
    rawSchemaVersion: 'legacy-appm-v1',
    reported: {
      '0_1_1': {
        state: 'ONLINE',
        U1: '12.23',
        U2: '0.00',
        I1: '9.57',
        I2: '0.00',
        P1: '117.18',
        P2: '0.00',
        EP1: '1.50',
        EP2: '0.00',
      },
      '0_1_13': {
        state: 'ONLINE',
      },
    },
    reportedEntryRecency: {
      '0_1_1': {
        observedAt: '2026-03-18T14:51:50.000Z',
        receivedAt: '2026-09-25T03:15:00.000Z',
        timestampProvenance: 'DEVICE',
      },
    },
    observedAt: '2026-03-18T14:51:50.000Z',
    receivedAt: '2026-09-25T03:15:00.000Z',
    timestampProvenance: 'DEVICE',
    simulated: true,
    ...overrides,
  };
}

describe('BDFB endpoint telemetry presentation', () => {
  it('binds by explicit telemetry address and preserves raw source labels', () => {
    expect(endpointTelemetry(sample(), '0_1_1')).toEqual({
      address: '0_1_1',
      state: 'ONLINE',
      displayMetrics: [
        { key: 'U1', value: '12.23' },
        { key: 'I1', value: '9.57' },
        { key: 'P1', value: '117.18' },
      ],
      rawFields: {
        state: 'ONLINE',
        U1: '12.23',
        U2: '0.00',
        I1: '9.57',
        I2: '0.00',
        P1: '117.18',
        P2: '0.00',
        EP1: '1.50',
        EP2: '0.00',
      },
      receivedAt: '2026-09-25T03:15:00.000Z',
      simulated: true,
    });
  });

  it('keeps state-only hardware reports distinct from missing telemetry', () => {
    expect(endpointTelemetry(sample(), '0_1_13')).toMatchObject({
      address: '0_1_13',
      state: 'ONLINE',
      displayMetrics: [],
    });
    expect(endpointTelemetry(sample(), '0_1_24')).toBeNull();
  });
});
