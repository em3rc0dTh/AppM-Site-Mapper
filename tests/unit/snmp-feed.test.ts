import { describe, expect, it } from 'vitest';

import {
  SnmpFeedService,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { parseSnmpFeedPacket } from '@/modules/telemetry/domain/snmp-feed';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const t = '2026-10-21T12:00:00.000Z';
const oidA = '1.3.6.1.4.1.12148.10.10.18.4.1.6.1.1';
const oidB = '1.3.6.1.4.1.12148.10.10.18.4.1.6.2.1';

function fixture(withB = true) {
  const device: DeviceNode = {
    id: 'bdfb',
    name: 'BDFB',
    kind: 'DEVICE',
    parentId: 'rack',
    deviceType: 'BDFB',
    rootEquipmentIds: ['chassis'],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: t,
    updatedAt: t,
  };
  const chassis: EquipmentNode = {
    id: 'chassis',
    name: 'Chassis',
    kind: 'EQUIPMENT',
    parentId: 'bdfb',
    parentEquipmentId: null,
    deviceId: 'bdfb',
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: t,
    updatedAt: t,
    accessPorts: ['A', 'B'].map((side) => ({
      id: `feed-${side}`,
      deviceId: 'bdfb',
      equipmentId: 'chassis',
      name: `Feed ${side}`,
      portType: 'POWER' as const,
      direction: 'INPUT' as const,
      exposure: 'EXTERNAL' as const,
      lifecycle: 'ACTIVE' as const,
      attributes: { feed: side, ratedCurrentA: 800 },
    })),
  };
  const binding = (id: string, oid: string, portId: string): TelemetryBinding => ({
    id,
    protocol: 'SNMP',
    sourceIdentity: 'ELTEK-01',
    sourcePointId: oid,
    metric: 'CURRENT',
    unit: 'A',
    targetType: 'ACCESS_PORT',
    targetId: portId,
    lifecycle: 'ACTIVE',
    createdAt: t,
    updatedAt: t,
  });
  const topology = new MemoryTopologyRepository([device, chassis]);
  const bindings = new MemoryTelemetryBindingRepository([
    binding('snmp-A', oidA, 'feed-A'),
    ...(withB ? [binding('snmp-B', oidB, 'feed-B')] : []),
  ]);
  const hub = new TelemetryHub(10);
  const service = new SnmpFeedService(topology, bindings, hub);
  const packet = (rows: Array<{ oid: string; value: number }>) => ({
    schemaVersion: 1 as const,
    sourceIdentity: 'ELTEK-01',
    observedAt: t,
    measurements: rows.map((x) => ({
      oid: x.oid,
      metric: 'CURRENT' as const,
      unit: 'A' as const,
      value: x.value,
    })),
  });
  return { topology, bindings, hub, service, packet };
}

describe('SNMP per-feed contract', () => {
  it('rejects malformed OIDs, duplicate points and non-engineering units', () => {
    const f = fixture();
    expect(parseSnmpFeedPacket(f.packet([{ oid: oidA, value: 150 }]), Date.parse(t)).ok).toBe(true);
    expect(parseSnmpFeedPacket(f.packet([{ oid: '1.2.3', value: 1 }])).ok).toBe(false);
    expect(
      parseSnmpFeedPacket(
        f.packet([
          { oid: oidA, value: 1 },
          { oid: oidA, value: 2 },
        ]),
      ).ok,
    ).toBe(false);
    expect(
      parseSnmpFeedPacket({
        ...f.packet([{ oid: oidA, value: 1 }]),
        measurements: [{ oid: oidA, metric: 'CURRENT', unit: 'mV', value: 30 }],
      }).ok,
    ).toBe(false);
  });

  it('sums only commissioned independently measured feeds', async () => {
    const f = fixture();
    const accepted = await f.service.ingest(
      f.packet([
        { oid: oidA, value: 220 },
        { oid: oidB, value: 210 },
      ]),
      t,
    );
    expect(accepted.ok).toBe(true);
    const view = await summarizeSnmpBdfbLoad('bdfb', f.topology, f.bindings, f.hub, Date.parse(t));
    expect(view).toMatchObject({
      status: 'COMPLETE',
      totalCurrentA: 430,
      measuredCurrentA: 430,
      feedCount: 2,
      freshFeedCount: 2,
    });
  });

  it('does not invent missing feed load or copy the first feed into another', async () => {
    const f = fixture();
    await f.service.ingest(f.packet([{ oid: oidA, value: 220 }]), t);
    const view = await summarizeSnmpBdfbLoad('bdfb', f.topology, f.bindings, f.hub, Date.parse(t));
    expect(view).toMatchObject({
      status: 'PARTIAL',
      totalCurrentA: null,
      measuredCurrentA: 220,
      feedCount: 2,
      freshFeedCount: 1,
    });
    expect(view?.feeds.find((x) => x.accessPortId === 'feed-B')?.currentA).toBeNull();
  });

  it('refuses uncommissioned points atomically', async () => {
    const f = fixture();
    const result = await f.service.ingest(
      f.packet([
        { oid: oidA, value: 220 },
        { oid: oidA + '.1', value: 100 },
      ]),
      t,
    );
    expect(result).toMatchObject({ ok: false, error: 'UNKNOWN_SNMP_POINT' });
    expect(f.hub.snapshot()).toHaveLength(0);
  });

  it('marks old samples STALE rather than claiming a current load', async () => {
    const f = fixture();
    await f.service.ingest(
      f.packet([
        { oid: oidA, value: 220 },
        { oid: oidB, value: 210 },
      ]),
      t,
    );
    const view = await summarizeSnmpBdfbLoad(
      'bdfb',
      f.topology,
      f.bindings,
      f.hub,
      Date.parse(t) + 180_000,
    );
    expect(view).toMatchObject({ status: 'PARTIAL', totalCurrentA: null, freshFeedCount: 0 });
    expect(view?.feeds.every((x) => x.status === 'STALE')).toBe(true);
  });

  it('treats uncommissioned physical feeds as missing coverage', async () => {
    const f = fixture(false);
    await f.service.ingest(f.packet([{ oid: oidA, value: 220 }]), t);
    const view = await summarizeSnmpBdfbLoad('bdfb', f.topology, f.bindings, f.hub, Date.parse(t));
    expect(view?.status).toBe('PARTIAL');
    expect(view?.feeds.find((x) => x.accessPortId === 'feed-B')?.status).toBe('UNMAPPED');
    expect(view?.totalCurrentA).toBeNull();
  });
});
