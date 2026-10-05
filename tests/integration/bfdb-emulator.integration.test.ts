import { describe, expect, it } from 'vitest';

import { EMULATOR_SERIALS, seedBfdbEmulatorLab } from '@/dev/bfdb-emulator-seed';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

function batch(serial: string, panel: number, partial = false): Uint8Array {
  const reported = Object.fromEntries(
    Array.from({ length: partial ? 1 : 24 }, (_, index) => [
      `0_${panel}_${index + 1}`,
      partial
        ? { state: 'ONLINE' }
        : { state: 'ONLINE', U1: '12.23', I1: '0.00', P1: '0.00', EP1: '1.2345' },
    ]),
  );
  const epoch = Math.floor(Date.now() / 1000);
  return new TextEncoder().encode(
    JSON.stringify({
      msgid: `${serial}-${panel}`,
      method: 'update',
      sn: serial,
      timestamp: epoch,
      sendtime: epoch,
      version: 1,
      reported,
    }),
  );
}

describe('BFDB emulator three-source contract', () => {
  it('binds four 24-point panels on each source and merges partial updates through explicit v1.2 bindings', async () => {
    const repository = new MemoryTopologyRepository();
    const bindings = new MemoryTelemetryBindingRepository();
    const devices = await seedBfdbEmulatorLab(repository, undefined, bindings);

    expect(devices.map((device) => device.serial)).toEqual(EMULATOR_SERIALS);
    expect(devices.every((device) => device.breakerCount === 96)).toBe(true);

    const service = new TelemetryService(
      repository,
      new TelemetryHub(10),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 262144 },
      {},
      bindings,
    );

    for (const device of devices) {
      for (let panel = 1; panel <= 4; panel += 1) {
        const result = await service.ingest(
          `data/dev/${device.serial}`,
          batch(device.serial, panel),
        );
        expect(result.ok).toBe(true);
      }

      const sample = service.latest(device.deviceId);
      expect(Object.keys(sample?.reported ?? {})).toHaveLength(96);
      expect(sample?.breakerReadings).toHaveLength(96);
      expect(sample?.unmappedPointIds ?? []).toEqual([]);
      expect(sample?.breakerReadings?.find((item) => item.rawPointId === '0_3_24')?.panelLabel).toBe(
        'B1',
      );
      expect(sample?.breakerReadings?.find((item) => item.rawPointId === '0_4_1')?.panelLabel).toBe(
        'B2',
      );

      const partial = await service.ingest(
        `data/dev/${device.serial}`,
        batch(device.serial, 1, true),
      );
      expect(partial.ok).toBe(true);
      expect(service.latest(device.deviceId)?.breakerReadings).toHaveLength(96);
      expect(
        service.latest(device.deviceId)?.breakerReadings?.find((item) => item.rawPointId === '0_1_1')
          ?.metrics.currentA?.value,
      ).toBe(0);
      expect(
        service.latest(device.deviceId)?.breakerReadings?.find((item) => item.rawPointId === '0_1_1')
          ?.metrics.energyKwh?.value,
      ).toBe(1.2345);
    }

    expect(
      (await seedBfdbEmulatorLab(repository, undefined, bindings)).map((device) => device.deviceId),
    ).toEqual(devices.map((device) => device.deviceId));
  });

  it('rejects a topic/payload identity mismatch before binding resolution', async () => {
    const repository = new MemoryTopologyRepository();
    const bindings = new MemoryTelemetryBindingRepository();
    await seedBfdbEmulatorLab(repository, undefined, bindings);

    const service = new TelemetryService(
      repository,
      new TelemetryHub(5),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 262144 },
      {},
      bindings,
    );

    expect(await service.ingest('data/dev/EMU-BFDB-01', batch('EMU-BFDB-02', 1))).toEqual({
      ok: false,
      error: 'SOURCE_IDENTITY_MISMATCH',
    });
  });
});
