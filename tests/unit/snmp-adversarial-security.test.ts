import { describe, expect, it } from 'vitest';

import {
  SnmpFeedService,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { parseSnmpFeedPacket } from '@/modules/telemetry/domain/snmp-feed';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';

const t = '2026-10-21T12:00:00.000Z';
const oid = '1.3.6.1.4.1.8072.9999.2026.48.1.1.0';

function lab() {
  const device: DeviceNode = {
    id: 'sec-bdfb',
    name: 'Sec BDFB',
    kind: 'DEVICE',
    parentId: 'sec-rack',
    deviceType: 'BDFB',
    rootEquipmentIds: ['sec-chassis'],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: t,
    updatedAt: t,
  };
  const chassis: EquipmentNode = {
    id: 'sec-chassis',
    kind: 'EQUIPMENT',
    name: 'Sec Chassis',
    parentId: 'sec-bdfb',
    parentEquipmentId: null,
    deviceId: 'sec-bdfb',
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: t,
    updatedAt: t,
    accessPorts: [
      {
        id: 'sec-feed-a',
        deviceId: 'sec-bdfb',
        equipmentId: 'sec-chassis',
        name: 'Input A',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
        attributes: {
          snmpFeedInput: true,
          independentInputConfirmed: true,
          ratedCurrentA: 800,
          feed: 'A',
        },
      },
    ],
  };
  const topology = new MemoryTopologyRepository([device, chassis]);
  const bindings = new MemoryTelemetryBindingRepository([
    {
      id: 'sec-binding',
      protocol: 'SNMP',
      sourceIdentity: 'SEC-DELTA-01',
      sourcePointId: oid,
      metric: 'CURRENT',
      unit: 'A',
      targetType: 'ACCESS_PORT',
      targetId: 'sec-feed-a',
      lifecycle: 'ACTIVE',
      createdAt: t,
      updatedAt: t,
    },
  ]);
  const hub = new TelemetryHub(10);
  const packet = (observedAt: string, value: number, sourceIdentity = 'SEC-DELTA-01') => ({
    schemaVersion: 1 as const,
    sourceIdentity,
    observedAt,
    measurements: [{ oid, metric: 'CURRENT' as const, unit: 'A' as const, value }],
  });
  return { topology, bindings, hub, packet };
}

describe('SNMP attack harness: adversarial collector and replay resistance', () => {
  it('rejects same-observation-time tampering rather than overwriting measured load', async () => {
    const f = lab();
    const service = new SnmpFeedService(f.topology, f.bindings, f.hub);
    expect((await service.ingest(f.packet(t, 220), t)).ok).toBe(true);
    const replay = await service.ingest(
      f.packet(t, 79999),
      new Date(Date.parse(t) + 10).toISOString(),
    );
    expect(replay).toMatchObject({ ok: false, error: 'OUT_OF_ORDER_SNMP_SAMPLE' });
    const view = await summarizeSnmpBdfbLoad(
      'sec-bdfb',
      f.topology,
      f.bindings,
      f.hub,
      Date.parse(t),
    );
    expect(view?.totalCurrentA).toBe(220);
  });

  it('denies forged source identity and wrong OID without publishing or storing measurements', async () => {
    const f = lab();
    const writes: TelemetrySample[] = [];
    const service = new SnmpFeedService(f.topology, f.bindings, f.hub, {
      async write(sample) {
        writes.push(sample);
      },
    });
    expect(await service.ingest(f.packet(t, 400, 'FORGED-DELTA'), t)).toMatchObject({
      ok: false,
      error: 'UNKNOWN_SNMP_POINT',
    });
    expect(
      await service.ingest(
        {
          ...f.packet(t, 400),
          measurements: [
            {
              oid: oid + '.99',
              metric: 'CURRENT' as const,
              unit: 'A' as const,
              value: 400,
            },
          ],
        },
        t,
      ),
    ).toMatchObject({ ok: false, error: 'UNKNOWN_SNMP_POINT' });
    expect(writes).toHaveLength(0);
    expect(f.hub.snapshot()).toHaveLength(0);
  });

  it('rejects replays recovered from durable store after a process restart', async () => {
    const f = lab();
    const old: TelemetrySample = {
      bindingId: 'snmp:feed:SEC-DELTA-01:sec-feed-a',
      targetId: 'sec-feed-a',
      targetType: 'ACCESS_PORT',
      entityId: 'sec-feed-a',
      entityKind: 'ACCESS_PORT',
      sourceIdentity: 'SEC-DELTA-01',
      protocol: 'SNMP',
      receivedAt: '2026-10-21T12:01:00.000Z',
      sourceObservedAt: t,
      reported: { currentA: { oid, unit: 'A', value: 220, observedAt: t } },
    };
    const writes: TelemetrySample[] = [];
    const history = {
      async write(sample: TelemetrySample) {
        writes.push(sample);
      },
      async writeDurable(sample: TelemetrySample) {
        writes.push(sample);
      },
      async queryLatestEntities(ids: readonly string[], targetType: string) {
        expect(ids).toContain('sec-feed-a');
        expect(targetType).toBe('ACCESS_PORT');
        return [old];
      },
    };
    // Hub is fresh after restart: anti-replay must not rely solely on its empty memory.
    const service = new SnmpFeedService(f.topology, f.bindings, new TelemetryHub(10), history);
    const replay = await service.ingest(f.packet(t, 9999), '2026-10-21T12:02:00.000Z');
    expect(replay).toMatchObject({ ok: false, error: 'OUT_OF_ORDER_SNMP_SAMPLE' });
    expect(writes).toHaveLength(0);
  });

  it('serializes two simultaneous submissions of the same SNMP observation', async () => {
    const f = lab();
    const writes: TelemetrySample[] = [];
    const writer = {
      async write() {},
      async commitSnmpBatch(_source: string, _at: string, samples: readonly TelemetrySample[]) {
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
        writes.push(...samples);
        return 'committed' as const;
      },
    };
    const service = new SnmpFeedService(f.topology, f.bindings, f.hub, writer);
    const results = await Promise.all([
      service.ingest(f.packet(t, 220), '2026-10-21T12:00:02.000Z'),
      service.ingest(f.packet(t, 50000), '2026-10-21T12:00:03.000Z'),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.filter((x) => !x.ok)).toHaveLength(1);
    expect(writes).toHaveLength(1);
  });

  it('refuses old timestamps and malformed future metric packets at the envelope boundary', () => {
    const f = lab();
    expect(
      parseSnmpFeedPacket(
        f.packet('2001-01-01T00:00:00.000Z', 120),
        Date.parse('2026-10-21T12:00:00Z'),
      ).ok,
    ).toBe(false);
    expect(
      parseSnmpFeedPacket(
        f.packet('2026-10-21T12:05:00.000Z', 120),
        Date.parse('2026-10-21T12:00:00Z'),
      ).ok,
    ).toBe(false);
    expect(parseSnmpFeedPacket(f.packet(t, -1), Date.parse(t)).ok).toBe(false);
    expect(
      parseSnmpFeedPacket(
        {
          ...f.packet(t, 25),
          measurements: Array.from({ length: 65 }, () => ({
            oid,
            metric: 'CURRENT',
            unit: 'A',
            value: 25,
          })),
        },
        Date.parse(t),
      ).ok,
    ).toBe(false);
  });
});
