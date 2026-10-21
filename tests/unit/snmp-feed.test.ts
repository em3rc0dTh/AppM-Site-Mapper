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
      attributes: { feed: side, ratedCurrentA: 800, snmpFeedInput: true, independentInputConfirmed: true },
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

describe('SNMP operator readiness and durability', () => {
  it('does not certify totals without independent-shunt confirmation', async () => {
    const f = fixture();
    const device = await f.topology.getById('bdfb');
    const existing = await f.topology.getById('chassis');
    if (device?.kind !== 'DEVICE' || existing?.kind !== 'EQUIPMENT')
      throw new Error('invalid test fixture');
    const chassis: EquipmentNode = {
      ...existing,
      accessPorts: existing.accessPorts.map((port) =>
        port.id === 'feed-B'
          ? { ...port, attributes: { ...port.attributes, independentInputConfirmed: false } }
          : port),
    };
    const topology = new MemoryTopologyRepository([device, chassis]);
    const hub = new TelemetryHub(5);
    const service = new SnmpFeedService(topology, f.bindings, hub);
    await service.ingest(f.packet([{ oid: oidA, value: 220 }, { oid: oidB, value: 210 }]), t);
    const view = await summarizeSnmpBdfbLoad('bdfb', topology, f.bindings, hub, Date.parse(t));
    expect(view?.status).toBe('PARTIAL');
    expect(view?.totalCurrentA).toBeNull();
    expect(view?.feeds.find((feed) => feed.accessPortId === 'feed-B')?.status).toBe('UNVERIFIED');
  });

  it('rejects persistence failure before publishing a false LIVE sample', async () => {
    const f = fixture();
    const service = new SnmpFeedService(f.topology, f.bindings, f.hub, {
      async write() {},
      async writeDurable() { throw new Error('Timescale is down'); },
    });
    const result = await service.ingest(f.packet([{ oid: oidA, value: 220 }]), t);
    expect(result).toMatchObject({ ok: false, error: 'HISTORY_STORE_UNAVAILABLE' });
    expect(f.hub.snapshot()).toHaveLength(0);
  });

  it('blocks out-of-order measurements while preserving latest value', async () => {
    const f = fixture();
    await f.service.ingest(f.packet([{ oid: oidA, value: 220 }]), t);
    const older = { ...f.packet([{ oid: oidA, value: 500 }]),
      observedAt: new Date(Date.parse(t) - 5000).toISOString() };
    const result = await f.service.ingest(older, t);
    expect(result).toMatchObject({ ok: false, error: 'OUT_OF_ORDER_SNMP_SAMPLE' });
    const view = await summarizeSnmpBdfbLoad('bdfb', f.topology, f.bindings, f.hub, Date.parse(t));
    expect(view?.feeds.find((feed) => feed.accessPortId === 'feed-A')?.currentA).toBe(220);
  });

  it('computes power only when an aligned voltage OID is explicitly bound', async () => {
    const f = fixture();
    const voltageOid = '1.3.6.1.4.1.8072.9999.2026.48.2.1.0';
    await f.bindings.insert({
      id: 'v-feed-A', protocol: 'SNMP', sourceIdentity: 'ELTEK-01',
      sourcePointId: voltageOid, metric: 'VOLTAGE', unit: 'V',
      targetType: 'ACCESS_PORT', targetId: 'feed-A',
      lifecycle: 'ACTIVE', createdAt: t, updatedAt: t,
    });
    await f.service.ingest({
      schemaVersion: 1, sourceIdentity: 'ELTEK-01', observedAt: t,
      measurements: [
        { oid: oidA, metric: 'CURRENT', unit: 'A', value: 220 },
        { oid: voltageOid, metric: 'VOLTAGE', unit: 'V', value: -53.5 },
        { oid: oidB, metric: 'CURRENT', unit: 'A', value: 210 },
      ],
    }, t);
    const view = await summarizeSnmpBdfbLoad('bdfb', f.topology, f.bindings, f.hub, Date.parse(t));
    expect(view?.totalCurrentA).toBe(430);
    expect(view?.totalRatedCurrentA).toBe(1600);
    expect(view?.totalEstimatedPowerW).toBeNull(); // Voltage B not mapped.
    expect(view?.feeds.find((feed) => feed.accessPortId === 'feed-A')?.estimatedPowerW).toBe(11770);
  });
});
