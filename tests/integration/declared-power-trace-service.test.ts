import { describe, expect, it } from 'vitest';

import { DeclaredPowerTraceService } from '@/modules/power/application/declared-power-trace-service';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-11-19T18:00:00.000Z';

function device(): DeviceNode {
  return {
    id: 'qdf-2-device',
    kind: 'DEVICE',
    parentId: 'rack-qdf2',
    name: 'QDF-2',
    deviceType: 'BDFB',
    rootEquipmentIds: ['panel-a3', 'panel-b3'],
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function panel(id: string, name: string): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId: 'qdf-2-device',
    deviceId: 'qdf-2-device',
    parentEquipmentId: null,
    equipmentType: 'PANEL',
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    name,
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function breaker(input: {
  id: string;
  name: string;
  panelId: string;
  feed: 'A' | 'B';
  targetLabel: string;
  targetAid: string;
  companionId: string;
  companionPanel: string;
  companionPosition: number;
  companionTarget: string;
}): EquipmentNode {
  return {
    id: input.id,
    kind: 'EQUIPMENT',
    parentId: input.panelId,
    deviceId: 'qdf-2-device',
    parentEquipmentId: input.panelId,
    equipmentType: 'CIRCUIT_BREAKER',
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    name: input.name,
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    aliases: [input.targetLabel],
    attributes: {
      declaredPower: {
        contractVersion: 3,
        state: 'DECLARED',
        qdf: 'QDF-2',
        pairId: 'seed01:QDF-2:row:3',
        feed: input.feed,
        targetLabel: input.targetLabel,
        targetEntityName: 'GRTLUREM3',
        targetCanonicalEntityName: 'GRTLuren3',
        targetKind: 'EQUIPMENT',
        targetAid: input.targetAid,
        targetLocalAid: input.targetAid,
        targetRackAid: 'RACK::010202.09',
        companionFeed: {
          breakerId: input.companionId,
          feed: input.feed === 'A' ? 'B' : 'A',
          panel: input.companionPanel,
          position: input.companionPosition,
          targetLabel: input.companionTarget,
        },
      },
    },
  };
}

describe('DeclaredPowerTraceService', () => {
  it('centers the powered target and resolves the A/B breaker pair from an A breaker', async () => {
    const a = breaker({
      id: 'breaker-a3-02',
      name: 'A3-02',
      panelId: 'panel-a3',
      feed: 'A',
      targetLabel: 'GRTLUREM3 PSU0 A0',
      targetAid: 'GRTLuren3::NoShelf::PSU0::A0',
      companionId: 'breaker-b3-02',
      companionPanel: 'B3',
      companionPosition: 2,
      companionTarget: 'GRTLUREM3 PSU0 B0',
    });
    const b = breaker({
      id: 'breaker-b3-02',
      name: 'B3-02',
      panelId: 'panel-b3',
      feed: 'B',
      targetLabel: 'GRTLUREM3 PSU0 B0',
      targetAid: 'GRTLuren3::NoShelf::PSU0::B0',
      companionId: 'breaker-a3-02',
      companionPanel: 'A3',
      companionPosition: 2,
      companionTarget: 'GRTLUREM3 PSU0 A0',
    });
    const topology = new MemoryTopologyRepository([
      device(),
      panel('panel-a3', 'A3'),
      panel('panel-b3', 'B3'),
      a,
      b,
    ]);

    const trace = await new DeclaredPowerTraceService(topology).resolveBreaker(a.id);

    expect(trace).toMatchObject({
      selectedBreakerId: a.id,
      targetLabel: 'GRTLUREM3 PSU0 A0',
      targetCanonicalEntityName: 'GRTLuren3',
      targetRackAid: 'RACK::010202.09',
      feedA: {
        breakerId: a.id,
        breakerName: 'A3-02',
        panelName: 'A3',
        targetLabel: 'GRTLUREM3 PSU0 A0',
      },
      feedB: {
        breakerId: b.id,
        breakerName: 'B3-02',
        panelName: 'B3',
        targetLabel: 'GRTLUREM3 PSU0 B0',
      },
    });
  });

  it('keeps A on the left and B on the right when navigation starts from the B breaker', async () => {
    const a = breaker({
      id: 'breaker-a3-02',
      name: 'A3-02',
      panelId: 'panel-a3',
      feed: 'A',
      targetLabel: 'GRTLUREM3 PSU0 A0',
      targetAid: 'GRTLuren3::NoShelf::PSU0::A0',
      companionId: 'breaker-b3-02',
      companionPanel: 'B3',
      companionPosition: 2,
      companionTarget: 'GRTLUREM3 PSU0 B0',
    });
    const b = breaker({
      id: 'breaker-b3-02',
      name: 'B3-02',
      panelId: 'panel-b3',
      feed: 'B',
      targetLabel: 'GRTLUREM3 PSU0 B0',
      targetAid: 'GRTLuren3::NoShelf::PSU0::B0',
      companionId: 'breaker-a3-02',
      companionPanel: 'A3',
      companionPosition: 2,
      companionTarget: 'GRTLUREM3 PSU0 A0',
    });
    const topology = new MemoryTopologyRepository([
      device(),
      panel('panel-a3', 'A3'),
      panel('panel-b3', 'B3'),
      a,
      b,
    ]);

    const trace = await new DeclaredPowerTraceService(topology).resolveBreaker(b.id);

    expect(trace?.selectedBreakerId).toBe(b.id);
    expect(trace?.targetLabel).toBe('GRTLUREM3 PSU0 B0');
    expect(trace?.feedA?.breakerName).toBe('A3-02');
    expect(trace?.feedB?.breakerName).toBe('B3-02');
  });
});
