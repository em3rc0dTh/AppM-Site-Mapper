import { describe, expect, it } from 'vitest';

import { PoweredEquipmentProjectionService } from '@/modules/power/application/powered-equipment-projection-service';
import { parseDeclaredPowerTarget } from '@/modules/power/domain/powered-equipment';
import type {
  DeviceNode,
  EquipmentNode,
  TopologyNode,
} from '@/modules/topology/domain/entities';
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
    children: ['breaker-a', 'breaker-b', 'breaker-pdu'],
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
    expect(parseDeclaredPowerTarget('GRTLuren3 PSU0 A0')).toEqual({
      equipmentKey: 'grtluren3',
      equipmentName: 'GRTLuren3',
      aid: 'GRTLuren3::NoShelf::PSU0::A0',
      targetLabel: 'GRTLuren3 PSU0 A0',
      displayLabel: 'PSU0 / A0',
      module: 'PSU0',
      endpoint: 'A0',
      side: 'A',
    });

    expect(parseDeclaredPowerTarget('DTX-LUR-FP2-01 SH15 PEM B1.2')).toMatchObject({
      equipmentKey: 'dtx-lur-fp2-01',
      equipmentName: 'DTX-LUR-FP2-01',
      shelf: 'SH15',
      module: 'PEM',
      endpoint: 'B1.2',
      side: 'B',
      aid: 'DTX-LUR-FP2-01::SH15::PEM::B1.2',
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

  it('keeps PDU semantics unresolved instead of guessing', () => {
    expect(parseDeclaredPowerTarget('Rack CDN PDU-1A')).toBeNull();
    expect(parseDeclaredPowerTarget('010208.14 PDU1-A')).toBeNull();
  });

  it('groups existing breaker aliases additively under one powered equipment projection', async () => {
    const seed: TopologyNode[] = [
      device(),
      panel(),
      breaker('breaker-a', 'A3-01', 'BB-LUR-04 SH2 A1', 'A'),
      breaker('breaker-b', 'B3-01', 'BB-LUR-04 SH2 FEED B1', 'B'),
      breaker('breaker-pdu', 'A3-17', '010208.14 PDU1-A', 'A'),
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
      qdfs: ['QDF2'],
      feeds: ['A', 'B'],
    });
    expect(powered.connections).toHaveLength(2);
    expect(powered.connections.map((item) => item.breakerId)).toEqual([
      'breaker-a',
      'breaker-b',
    ]);

    const originalPdu = await repository.getById('breaker-pdu');
    expect(originalPdu?.kind === 'EQUIPMENT' ? originalPdu.aliases : undefined).toEqual([
      '010208.14 PDU1-A',
    ]);
  });
});
