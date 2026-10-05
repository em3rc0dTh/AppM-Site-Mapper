import { describe, expect, it } from 'vitest';

import { serializeTelemetryStoreSample } from '@/modules/telemetry/infrastructure/http-telemetry-store';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

describe('Site Mapper telemetry history serialization', () => {
  it('persists only metrics present in the accepted MQTT patch', () => {
    const sample: TelemetrySample = {
      bindingId: 'binding-device-1',
      targetId: 'device-1',
      targetType: 'DEVICE',
      entityId: 'device-1',
      entityKind: 'DEVICE',
      sourceIdentity: 'EMU-BFDB-03',
      reported: {},
      receivedAt: '2026-10-01T12:00:01.000Z',
      protocol: 'BFDB',
      messageId: '1001',
      sourceObservedAt: '2026-10-01T12:00:00.000Z',
      breakerReadings: [
        {
          deviceId: 'device-1',
          sourceIdentity: 'EMU-BFDB-03',
          shelfId: 'shelf-1',
          frameId: 'frame-a',
          panelId: 'panel-a1',
          panelLabel: 'A1',
          breakerId: 'breaker-1',
          breakerLabel: 'CB-01',
          rawPointId: '0_1_1',
          position: 1,
          metrics: {
            currentA: {
              value: 3.5,
              observedAt: '2026-10-01T12:00:00.000Z',
            },
          },
          state: {
            value: 'ONLINE',
            observedAt: '2026-10-01T12:00:00.000Z',
          },
          receivedAt: '2026-10-01T12:00:01.000Z',
        },
        {
          deviceId: 'device-1',
          sourceIdentity: 'EMU-BFDB-03',
          shelfId: 'shelf-1',
          frameId: 'frame-a',
          panelId: 'panel-a1',
          panelLabel: 'A1',
          breakerId: 'breaker-2',
          breakerLabel: 'CB-02',
          rawPointId: '0_1_2',
          position: 2,
          metrics: {},
          state: {
            value: 'ONLINE',
            observedAt: '2026-10-01T12:00:00.000Z',
          },
          receivedAt: '2026-10-01T12:00:01.000Z',
        },
      ],
    };

    const serialized = serializeTelemetryStoreSample(sample);

    expect(serialized?.readings).toEqual([
      {
        shelfId: 'shelf-1',
        frameId: 'frame-a',
        panelId: 'panel-a1',
        breakerId: 'breaker-1',
        rawPointId: '0_1_1',
        observedAt: '2026-10-01T12:00:00.000Z',
        state: 'ONLINE',
        currentA: 3.5,
      },
    ]);
    expect(serialized?.readings[0]).not.toHaveProperty('voltageV');
    expect(serialized?.readings[0]).not.toHaveProperty('powerW');
    expect(serialized?.readings[0]).not.toHaveProperty('energyKwh');
  });

  it('does not create a historical row for a state-only patch', () => {
    const sample: TelemetrySample = {
      bindingId: 'binding-device-1',
      targetId: 'device-1',
      targetType: 'DEVICE',
      entityId: 'device-1',
      entityKind: 'DEVICE',
      sourceIdentity: 'EMU-BFDB-03',
      reported: {},
      receivedAt: '2026-10-01T12:00:01.000Z',
      protocol: 'BFDB',
      breakerReadings: [
        {
          deviceId: 'device-1',
          sourceIdentity: 'EMU-BFDB-03',
          shelfId: 'shelf-1',
          frameId: 'frame-a',
          panelId: 'panel-a1',
          panelLabel: 'A1',
          breakerId: 'breaker-1',
          breakerLabel: 'CB-01',
          rawPointId: '0_1_1',
          position: 1,
          metrics: {},
          state: {
            value: 'ONLINE',
            observedAt: '2026-10-01T12:00:00.000Z',
          },
          receivedAt: '2026-10-01T12:00:01.000Z',
        },
      ],
    };

    expect(serializeTelemetryStoreSample(sample)).toBeNull();
  });
});
