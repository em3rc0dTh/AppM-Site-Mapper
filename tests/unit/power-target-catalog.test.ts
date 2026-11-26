import { describe, expect, it } from 'vitest';

import { PowerTargetCatalogService } from '@/modules/power/application/power-target-catalog-service';
import { buildPowerTargetCatalogIdentity } from '@/modules/power/domain/power-target-catalog';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { MemoryPowerTargetCatalogRepository } from '@/modules/power/infrastructure/memory-power-target-catalog-repository';
import type { DeviceNode, EquipmentNode, TopologyNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-11-26T00:00:00.000Z';

function device(): DeviceNode {
  return {
    id: 'qdf5',
    kind: 'DEVICE',
    parentId: 'rack',
    name: 'QDF-5',
    deviceType: 'BDFB',
    rootEquipmentIds: ['panel-a2', 'panel-b2'],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function panel(id: string, name: string, children: readonly string[]): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId: 'qdf5',
    name,
    deviceId: 'qdf5',
    equipmentType: 'PANEL',
    parentEquipmentId: null,
    childMode: 'DYNAMIC',
    children,
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function breaker(id: string, parentEquipmentId: string, name: string): EquipmentNode {
  return {
    id,
    kind: 'EQUIPMENT',
    parentId: parentEquipmentId,
    name,
    deviceId: 'qdf5',
    equipmentType: 'CIRCUIT_BREAKER',
    parentEquipmentId,
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [
      {
        id: `${id}-out`,
        deviceId: 'qdf5',
        equipmentId: id,
        name: 'Power output',
        portType: 'POWER',
        direction: 'OUTPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
      },
    ],
    aliases: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('power target catalog', () => {
  it('builds RackAID + local AID identity without inventing missing hierarchy', () => {
    expect(
      buildPowerTargetCatalogIdentity({
        equipmentName: 'UAT-SWITCH-01',
        footprint: '010208.20',
      }),
    ).toMatchObject({
      rackAid: 'RACK::010208.20',
      localAid: 'UAT-SWITCH-01::NoShelf::NoSlot::NoPort',
      identityKey: 'RACK::010208.20|UAT-SWITCH-01::NOSHELF::NOSLOT::NOPORT',
    });
  });

  it('persists a reusable declared target and lets A/B breakers converge on it', async () => {
    const topologySeed: TopologyNode[] = [
      device(),
      panel('panel-a2', 'A2', ['breaker-a']),
      panel('panel-b2', 'B2', ['breaker-b']),
      breaker('breaker-a', 'panel-a2', 'UAT-A'),
      breaker('breaker-b', 'panel-b2', 'UAT-B'),
    ];
    const topology = new MemoryTopologyRepository(topologySeed);
    const service = new PowerTargetCatalogService(
      topology,
      new MemoryPowerRepository(),
      new MemoryPowerTargetCatalogRepository(),
    );

    const created = await service.create({
      equipmentName: 'UAT-SWITCH-01',
      footprint: '010208.20',
      displayLabel: 'UAT SWITCH 01',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error('EXPECTED_TARGET');

    const again = await service.create({
      equipmentName: 'UAT-SWITCH-01',
      footprint: '010208.20',
      displayLabel: 'UAT SWITCH 01',
    });
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error('EXPECTED_TARGET');
    expect(again.value.id).toBe(created.value.id);

    const a = await service.assign({
      sourceAccessPortId: 'breaker-a-out',
      targetIdentityKey: created.value.identityKey,
      feed: 'A',
    });
    const b = await service.assign({
      sourceAccessPortId: 'breaker-b-out',
      targetIdentityKey: created.value.identityKey,
      feed: 'B',
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const breakerA = await topology.getById('breaker-a');
    const breakerB = await topology.getById('breaker-b');
    expect(
      (breakerA?.kind === 'EQUIPMENT' ? breakerA.attributes?.declaredPower : null) as Record<
        string,
        unknown
      >,
    ).toMatchObject({
      feed: 'A',
      targetLabel: 'UAT SWITCH 01',
      targetRackAid: 'RACK::010208.20',
      targetLocalAid: 'UAT-SWITCH-01::NoShelf::NoSlot::NoPort',
    });
    expect(
      (breakerB?.kind === 'EQUIPMENT' ? breakerB.attributes?.declaredPower : null) as Record<
        string,
        unknown
      >,
    ).toMatchObject({
      feed: 'B',
      targetCatalogKey: created.value.identityKey,
    });
    expect(breakerA?.kind === 'EQUIPMENT' ? breakerA.aliases : undefined).toEqual([]);
    expect(breakerB?.kind === 'EQUIPMENT' ? breakerB.aliases : undefined).toEqual([]);
  });

  it('keeps identical names in different footprints as different catalog identities', async () => {
    const topology = new MemoryTopologyRepository([device()]);
    const service = new PowerTargetCatalogService(
      topology,
      new MemoryPowerRepository(),
      new MemoryPowerTargetCatalogRepository(),
    );

    const first = await service.create({
      equipmentName: 'DUPLICATE-NAME',
      footprint: '010208.13',
    });
    const second = await service.create({
      equipmentName: 'DUPLICATE-NAME',
      footprint: '010208.14',
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('EXPECTED_TARGETS');
    expect(first.value.identityKey).not.toBe(second.value.identityKey);
    expect(await service.list()).toHaveLength(2);
  });
});
