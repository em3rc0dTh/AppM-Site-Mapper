import { describe, expect, it } from 'vitest';

import { PoweredEquipmentProjectionService } from '@/modules/power/application/powered-equipment-projection-service';
import { parseDeclaredPowerTarget } from '@/modules/power/domain/powered-equipment';
import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-11-19T00:00:00.000Z';

function device(): DeviceNode {
  return {
    id: 'qdf2',
    kind: 'DEVICE',
    parentId: 'rack',
    name: 'QDF2',
    deviceType: 'BDFB',
    rootEquipmentIds: ['panel-a3'],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function panel(): EquipmentNode {
  return {
    id: 'panel-a3',
    kind: 'EQUIPMENT',
    parentId: 'qdf2',
    name: 'A3',
    deviceId: 'qdf2',
    equipmentType: 'PANEL',
    parentEquipmentId: null,
    childMode: 'DYNAMIC',
    children: ['breaker-a', 'breaker-b', 'breaker-pdu-a', 'breaker-pdu-b'],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function breaker(
  id: string,
  name: string,
  target: string,
  feed: 'A' | 'B',
  targetFootprint?: string,
  remarks: readonly string[] = [],
  aliases: readonly string[] = [target],
): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId: 'panel-a3',
    name,
    deviceId: 'qdf2',
    equipmentType: 'CIRCUIT_BREAKER',
    parentEquipmentId: 'panel-a3',
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    aliases,
    attributes: {
      declaredPower: {
        qdf: 'QDF2',
        feed,
        targetLabel: target,
        ...(targetFootprint ? { targetFootprint } : {}),
        remarks: [...remarks],
      },
    },
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('powered equipment projection', () => {
  it('preserves stable GRTLuren3 identity while accepting the current display name', () => {
    expect(
      parseDeclaredPowerTarget('GRTLUREM3 PSU0 A0', {
        targetFootprint: '010202.09',
        feed: 'A',
      }),
    ).toEqual({
      equipmentKey: 'grtluren3',
      equipmentName: 'GRTLUREM3',
      canonicalEquipmentName: 'GRTLuren3',
      targetKind: 'EQUIPMENT',
      aid: 'GRTLuren3::NoShelf::PSU0::A0',
      localAid: 'GRTLuren3::NoShelf::PSU0::A0',
      rackAid: 'RACK::010202.09',
      targetLabel: 'GRTLUREM3 PSU0 A0',
      displayLabel: 'PSU0 / A0',
      module: 'PSU0',
      endpoint: 'A0',
      side: 'A',
    });
  });

  it('parses current PA/PB, PWR and spaced PEM endpoint notation', () => {
    expect(parseDeclaredPowerTarget('DTX-LUR-FP2-01 SH15 PA1-1')).toMatchObject({
      canonicalEquipmentName: 'DTX-LUR-FP2-01',
      shelf: 'SH15',
      endpoint: 'PA1-1',
      side: 'A',
      aid: 'DTX-LUR-FP2-01::SH15::NoSlot::PA1-1',
    });

    expect(parseDeclaredPowerTarget('DTN-LUR-FP4-01 SH1 PWR:B')).toMatchObject({
      shelf: 'SH1',
      endpoint: 'PWR:B',
      side: 'B',
      aid: 'DTN-LUR-FP4-01::SH1::NoSlot::PWR:B',
    });

    expect(parseDeclaredPowerTarget('GX-LUR-02 SH01 PEM 3')).toMatchObject({
      equipmentKey: 'gx-lur-02',
      canonicalEquipmentName: 'GX-LUR-02',
      shelf: 'SH1',
      module: 'PEM3',
      aid: 'GX-LUR-02::SH1::PEM3::NoPort',
    });
  });

  it('keeps legacy GX names mapped to the current logical equipment identity', () => {
    expect(parseDeclaredPowerTarget('GXLUR02 SH01 PEM1')).toMatchObject({
      equipmentKey: 'gx-lur-02',
      equipmentName: 'GXLUR02',
      canonicalEquipmentName: 'GX-LUR-02',
      shelf: 'SH1',
      module: 'PEM1',
      aid: 'GX-LUR-02::SH1::PEM1::NoPort',
    });
  });

  it('derives feed-specific endpoint identity only when the source gives equipment name alone', () => {
    expect(
      parseDeclaredPowerTarget('Orion', { targetFootprint: '010205.16', feed: 'A' }),
    ).toMatchObject({
      equipmentKey: 'orion',
      canonicalEquipmentName: 'Orion',
      endpoint: 'FEED-A',
      side: 'A',
      aid: 'Orion::NoShelf::NoSlot::FEED-A',
      rackAid: 'RACK::010205.16',
    });
  });

  it('resolves PDU identity only when the physical rack context is known', () => {
    expect(parseDeclaredPowerTarget('Rack CDN PDU-1A')).toBeNull();

    expect(parseDeclaredPowerTarget('Rack CDN PDU-1A', { targetFootprint: '010202.10' })).toEqual({
      equipmentKey: 'rack-010202.10-pdu01',
      equipmentName: 'PDU 01',
      canonicalEquipmentName: 'PDU 01',
      targetKind: 'PDU',
      aid: 'RACK::010202.10::PDU01::A',
      localAid: 'PDU01::NoShelf::NoSlot::A',
      baseAid: 'RACK::010202.10::PDU01',
      rackAid: 'RACK::010202.10',
      targetLabel: 'Rack CDN PDU-1A',
      displayLabel: 'Feed A',
      endpoint: 'A',
      side: 'A',
    });

    expect(parseDeclaredPowerTarget('PDU1-B', { targetFootprint: '010208.14' })).toMatchObject({
      equipmentKey: 'rack-010208.14-pdu01',
      canonicalEquipmentName: 'PDU 01',
      aid: 'RACK::010208.14::PDU01::B',
      localAid: 'PDU01::NoShelf::NoSlot::B',
      baseAid: 'RACK::010208.14::PDU01',
      rackAid: 'RACK::010208.14',
      side: 'B',
    });
  });

  it('projects the current declared target once even when legacy aliases are retained', async () => {
    const seed: TopologyNode[] = [
      device(),
      panel(),
      breaker(
        'breaker-a',
        'A3-03',
        'GX-LUR-02 SH01 PEM 1',
        'A',
        '010208.13',
        [],
        ['GXLUR02 SH01 PEM1', 'GX-LUR-02 SH01 PEM 1'],
      ),
      breaker(
        'breaker-b',
        'B3-03',
        'GX-LUR-02 SH01 PEM 3',
        'B',
        '010208.13',
        [],
        ['GXLUR02 SH1 PEM3', 'GX-LUR-02 SH01 PEM 3'],
      ),
    ];
    const repository = new MemoryTopologyRepository(seed);
    const projection = await new PoweredEquipmentProjectionService(repository).list();

    expect(projection).toHaveLength(1);
    const powered = projection[0];
    expect(powered).toBeDefined();
    if (!powered) throw new Error('EXPECTED_POWERED_EQUIPMENT');

    expect(powered).toMatchObject({
      id: 'powered-equipment:gx-lur-02',
      key: 'gx-lur-02',
      name: 'GX-LUR-02',
      kind: 'EQUIPMENT',
      qdfs: ['QDF2'],
      rackAids: ['RACK::010208.13'],
      feeds: ['A', 'B'],
    });
    expect(powered.connections).toHaveLength(2);
    expect(powered.connections.map((item) => item.endpoint.aid)).toEqual([
      'GX-LUR-02::SH1::PEM1::NoPort',
      'GX-LUR-02::SH1::PEM3::NoPort',
    ]);
  });

  it('groups PDU feed A/B as one rack-scoped target and preserves remarks', async () => {
    const seed: TopologyNode[] = [
      device(),
      panel(),
      breaker('breaker-pdu-a', 'A3-17', 'PDU1-A', 'A', '010208.14', [
        'Pos-1: MTC-9 SH10 PEM A',
        'Pos-2: XTM-LUR01 PEM A',
      ]),
      breaker('breaker-pdu-b', 'B3-17', 'PDU1-B', 'B', '010208.14', [
        'Pos-1: MTC-9 SH10 PEM B',
        'Pos-2: XTM-LUR01 PEM B',
      ]),
    ];
    const repository = new MemoryTopologyRepository(seed);
    const projection = await new PoweredEquipmentProjectionService(repository).list();

    expect(projection).toHaveLength(1);
    const pdu = projection[0];
    expect(pdu).toBeDefined();
    if (!pdu) throw new Error('EXPECTED_PDU');

    expect(pdu).toMatchObject({
      id: 'powered-equipment:rack-010208.14-pdu01',
      key: 'rack-010208.14-pdu01',
      name: 'PDU 01',
      kind: 'PDU',
      rackAids: ['RACK::010208.14'],
      feeds: ['A', 'B'],
    });
    expect(pdu.connections.map((item) => item.endpoint.aid)).toEqual([
      'RACK::010208.14::PDU01::A',
      'RACK::010208.14::PDU01::B',
    ]);
  });

  it('reads configured nominal breaker current without inventing values', async () => {
    const rated = breaker('breaker-a', 'A3-03', 'GX-LUR-02 SH01 PEM 1', 'A');
    const unrated = breaker('breaker-b', 'B3-03', 'GX-LUR-02 SH01 PEM 3', 'B');
    const repository = new MemoryTopologyRepository([
      device(),
      panel(),
      { ...rated, attributes: { ...rated.attributes, ratedCurrentA: 80 } },
      unrated,
    ]);
    const projections = await new PoweredEquipmentProjectionService(repository).list();
    const connections = projections[0]?.connections ?? [];
    expect(connections.find((item) => item.breakerId === 'breaker-a')?.nominalCurrentA).toBe(
      80,
    );
    expect(
      connections.find((item) => item.breakerId === 'breaker-b')?.nominalCurrentA,
    ).toBeUndefined();
  });
});
