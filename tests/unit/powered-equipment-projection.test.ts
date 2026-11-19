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
    aliases: [target],
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
  it('parses endpoint composition without promoting the endpoint to equipment identity', () => {
    expect(
      parseDeclaredPowerTarget('GRTLuren3 PSU0 A0', { targetFootprint: '010202.09' }),
    ).toEqual({
      equipmentKey: 'grtluren3',
      equipmentName: 'GRTLuren3',
      targetKind: 'EQUIPMENT',
      aid: 'GRTLuren3::NoShelf::PSU0::A0',
      localAid: 'GRTLuren3::NoShelf::PSU0::A0',
      rackAid: 'RACK::010202.09',
      targetLabel: 'GRTLuren3 PSU0 A0',
      displayLabel: 'PSU0 / A0',
      module: 'PSU0',
      endpoint: 'A0',
      side: 'A',
    });

    expect(parseDeclaredPowerTarget('DTX-LUR-FP2-01 SH15 PEM B1.2')).toMatchObject({
      equipmentKey: 'dtx-lur-fp2-01',
      equipmentName: 'DTX-LUR-FP2-01',
      targetKind: 'EQUIPMENT',
      shelf: 'SH15',
      module: 'PEM',
      endpoint: 'B1.2',
      side: 'B',
      aid: 'DTX-LUR-FP2-01::SH15::PEM::B1.2',
      localAid: 'DTX-LUR-FP2-01::SH15::PEM::B1.2',
    });
  });

  it('normalizes shelf numbering while preserving the declared target label', () => {
    expect(parseDeclaredPowerTarget('GXLUR02 SH01 PEM1')).toMatchObject({
      shelf: 'SH1',
      module: 'PEM1',
      aid: 'GXLUR02::SH1::PEM1::NoPort',
      targetLabel: 'GXLUR02 SH01 PEM1',
    });
  });

  it('resolves PDU identity only when the physical rack context is known', () => {
    expect(parseDeclaredPowerTarget('Rack CDN PDU-1A')).toBeNull();

    expect(
      parseDeclaredPowerTarget('Rack CDN PDU-1A', { targetFootprint: '010202.10' }),
    ).toEqual({
      equipmentKey: 'rack-010202.10-pdu01',
      equipmentName: 'PDU 01',
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

    expect(
      parseDeclaredPowerTarget('010208.14 PDU1-B', { targetFootprint: '010208.14' }),
    ).toMatchObject({
      equipmentKey: 'rack-010208.14-pdu01',
      equipmentName: 'PDU 01',
      targetKind: 'PDU',
      aid: 'RACK::010208.14::PDU01::B',
      localAid: 'PDU01::NoShelf::NoSlot::B',
      baseAid: 'RACK::010208.14::PDU01',
      rackAid: 'RACK::010208.14',
      side: 'B',
    });
  });

  it('groups existing breaker aliases additively under one powered equipment projection', async () => {
    const seed: TopologyNode[] = [
      device(),
      panel(),
      breaker('breaker-a', 'A3-01', 'BB-LUR-04 SH2 A1', 'A', '010206.20'),
      breaker('breaker-b', 'B3-01', 'BB-LUR-04 SH2 FEED B1', 'B', '010206.20'),
    ];
    const repository = new MemoryTopologyRepository(seed);
    const projection = await new PoweredEquipmentProjectionService(repository).list();

    expect(projection).toHaveLength(1);
    const powered = projection[0];
    expect(powered).toBeDefined();
    if (!powered) throw new Error('EXPECTED_POWERED_EQUIPMENT');

    expect(powered).toMatchObject({
      id: 'powered-equipment:bb-lur-04',
      key: 'bb-lur-04',
      name: 'BB-LUR-04',
      kind: 'EQUIPMENT',
      qdfs: ['QDF2'],
      rackAids: ['RACK::010206.20'],
      feeds: ['A', 'B'],
    });
    expect(powered.connections).toHaveLength(2);
    expect(powered.connections.map((item) => item.breakerId)).toEqual(['breaker-a', 'breaker-b']);
  });

  it('groups PDU feed A/B as one rack-scoped target and preserves remarks and aliases', async () => {
    const seed: TopologyNode[] = [
      device(),
      panel(),
      breaker(
        'breaker-pdu-a',
        'A3-17',
        '010208.14 PDU1-A',
        'A',
        '010208.14',
        ['Pos-1: MTC-9 SH10 PEM A', 'Pos-2: XTM-LUR01 PEM A'],
      ),
      breaker(
        'breaker-pdu-b',
        'B3-17',
        '010208.14 PDU1-B',
        'B',
        '010208.14',
        ['Pos-1: MTC-9 SH10 PEM B', 'Pos-2: XTM-LUR01 PEM B'],
      ),
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
    expect(pdu.connections[0]?.remarks).toContain('Pos-1: MTC-9 SH10 PEM A');
    expect(pdu.connections[1]?.remarks).toContain('Pos-1: MTC-9 SH10 PEM B');

    const originalPdu = await repository.getById('breaker-pdu-a');
    expect(originalPdu?.kind === 'EQUIPMENT' ? originalPdu.aliases : undefined).toEqual([
      '010208.14 PDU1-A',
    ]);
  });
});
