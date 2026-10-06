import { describe, expect, it } from 'vitest';

import { BdfbProjectionService } from '@/modules/power/application/bdfb-projection-service';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import { canonicalBdfb96Structure } from '@/modules/power/domain/bdfb-model';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-10-06T00:00:00.000Z';

describe('Canonical BDFB materialization', () => {
  it('reuses the mounted root chassis and materializes 4 panels / 96 breakers', async () => {
    const rack: ContainerRackNode = {
      id: 'rack-1',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position-1',
      name: 'Rack 1',
      totalU: 42,
      cas: [],
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const chassisId = 'equipment-existing-chassis';
    const device: DeviceNode = {
      id: 'device-bdfb',
      parentId: rack.id,
      name: 'BDFB-01',
      kind: 'DEVICE',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: false,
      deviceType: 'BDFB',
      rootEquipmentIds: [chassisId],
    };

    const chassis: EquipmentNode = {
      id: chassisId,
      parentId: device.id,
      deviceId: device.id,
      name: 'BDFB-01 · BDFB Chassis',
      kind: 'EQUIPMENT',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      equipmentType: 'CUSTOM',
      parentEquipmentId: null,
      childMode: 'DYNAMIC',
      children: [],
      accessPorts: [],
      pinned: false,
      category: 'Battery distribution fuse bay chassis',
      rackPlacement: {
        rackId: rack.id,
        mode: 'U_RANGE',
        startU: 2,
        sizeU: 40,
        clearanceBottomU: 1,
        clearanceTopU: 1,
      },
    };

    const repository = new MemoryTopologyRepository([rack, device, chassis]);
    const result = await new BdfbService(repository).configure(
      device.id,
      canonicalBdfb96Structure(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.rootEquipmentIds).toEqual([chassisId]);

    const equipment = await repository.listEquipmentForDevice(device.id);
    expect(equipment.filter((item) => item.equipmentType === 'CHASSIS')).toHaveLength(1);
    expect(equipment.filter((item) => item.equipmentType === 'SHELF')).toHaveLength(0);
    expect(equipment.filter((item) => item.equipmentType === 'FRAME')).toHaveLength(0);
    expect(equipment.filter((item) => item.equipmentType === 'PANEL')).toHaveLength(4);
    expect(equipment.filter((item) => item.equipmentType === 'CIRCUIT_BREAKER')).toHaveLength(96);

    const storedChassis = await repository.getById(chassisId);
    expect(storedChassis?.kind === 'EQUIPMENT' ? storedChassis.equipmentType : null).toBe(
      'CHASSIS',
    );
    expect(storedChassis?.kind === 'EQUIPMENT' ? storedChassis.rackPlacement : null).toEqual(
      chassis.rackPlacement,
    );

    const presentation = await new BdfbProjectionService(repository).get(device.id);
    expect(presentation).not.toBeNull();
    const frames = presentation?.shelves.flatMap((shelf) => shelf.frames) ?? [];
    const panels = frames.flatMap((frame) => frame.panels);
    const breakers = panels.flatMap((panel) => panel.positions).filter(Boolean);

    expect(presentation?.shelves.every((shelf) => shelf.physical === false)).toBe(true);
    expect(frames.map((frame) => ({ label: frame.label, physical: frame.physical }))).toEqual([
      { label: 'A', physical: false },
      { label: 'B', physical: false },
    ]);
    expect(panels.map((panel) => panel.label)).toEqual(['A1', 'A2', 'B1', 'B2']);
    expect(breakers).toHaveLength(96);
    expect(breakers[0]?.rawPointId).toBe('0_1_1');
    expect(breakers.at(-1)?.rawPointId).toBe('0_4_24');
  });
});
