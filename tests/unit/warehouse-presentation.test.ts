import { describe, expect, it } from 'vitest';

import { initializeCas } from '@/modules/rack/domain/cas';
import type { ContainerRackNode, EquipmentPresentation } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { parseAssetTemplateJson } from '@/modules/warehouse/application/template-json-parser';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { MemoryWarehouseRepository } from '@/modules/warehouse/infrastructure/memory-warehouse-repository';

const row: EquipmentPresentation = {
  direction: 'ROW',
  maxPerLine: 2,
  childrenVisibility: 'INLINE',
};
const column: EquipmentPresentation = {
  direction: 'COLUMN',
  maxPerLine: 4,
  childrenVisibility: 'SUMMARY',
};
const rack: ContainerRackNode = {
  id: 'presentation-rack',
  kind: 'CONTAINER_RACK',
  parentId: 'position',
  variant: 'RACK',
  name: 'Rack',
  lifecycle: 'ACTIVE',
  cas: initializeCas(42),
  totalU: 42,
  createdAt: '2026-10-12T00:00:00.000Z',
  updatedAt: '2026-10-12T00:00:00.000Z',
};

describe('Warehouse template versus instance composition', () => {
  it('accepts a reusable template without child count or visual layout', () => {
    const parsed = parseAssetTemplateJson({
      kind: 'EQUIPMENT',
      name: 'Generic Chassis',
      equipmentType: 'CHASSIS',
      allowedChildTypes: ['SHELF'],
    });
    expect(parsed).toMatchObject({
      name: 'Generic Chassis',
      equipmentType: 'CHASSIS',
      allowedChildTypes: ['SHELF'],
    });
    expect(parsed?.childCapacity).toBeUndefined();
    expect(parsed?.presentation).toBeUndefined();
  });

  it('does not accept visual layout fields in reusable Warehouse JSONs', () => {
    expect(
      parseAssetTemplateJson({
        kind: 'EQUIPMENT',
        name: 'Layout belongs to the instance',
        presentation: row,
      }),
    ).toBeNull();
  });

  it('creates two independent root configurations from one template, preserving its identity', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const topology = new MemoryTopologyRepository([rack]);
    const service = new WarehouseService(warehouse);
    const template = await service.create({
      kind: 'EQUIPMENT',
      name: 'MK1 BDFB Chassis A/B',
      equipmentType: 'CHASSIS',
      allowedChildTypes: ['SHELF'],
    });
    if (!template.ok) throw new Error('Could not create template');
    const factory = new WarehouseInstantiationService(warehouse, topology);

    const a = await factory.instantiate({
      templateId: template.value.id,
      rackId: rack.id,
      name: 'BDFB-A',
      childMode: 'POSITIONAL',
      childCapacity: 2,
      presentation: row,
    });
    const b = await factory.instantiate({
      templateId: template.value.id,
      rackId: rack.id,
      name: 'BDFB-B',
      childMode: 'POSITIONAL',
      childCapacity: 6,
      presentation: column,
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.equipment.children).toHaveLength(2);
    expect(b.value.equipment.children).toHaveLength(6);
    expect(a.value.equipment.presentation).toEqual(row);
    expect(b.value.equipment.presentation).toEqual(column);
    expect(a.value.equipment.template?.templateId).toBe(template.value.id);
    expect(b.value.equipment.template?.templateId).toBe(template.value.id);
    expect((await warehouse.getById(template.value.id))?.presentation).toBeUndefined();
  });

  it('ignores layout and capacity recorded in an old template unless configured for the new instance', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const topology = new MemoryTopologyRepository([rack]);
    const template = await new WarehouseService(warehouse).create({
      kind: 'EQUIPMENT',
      name: 'Old Chassis',
      equipmentType: 'CHASSIS',
      childMode: 'POSITIONAL',
      childCapacity: 12,
      presentation: row,
    });
    if (!template.ok) throw new Error('Legacy template creation failed');
    const factory = new WarehouseInstantiationService(warehouse, topology);
    const created = await factory.instantiate({
      templateId: template.value.id,
      rackId: rack.id,
      name: 'Independent instance',
      childMode: 'POSITIONAL',
      childCapacity: 3,
      presentation: column,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.equipment.children).toHaveLength(3);
    expect(created.value.equipment.presentation).toEqual(column);

    const unconfigured = await factory.instantiate({
      templateId: template.value.id,
      rackId: rack.id,
      name: 'Default instance',
    });
    expect(unconfigured.ok).toBe(true);
    if (!unconfigured.ok) return;
    expect(unconfigured.value.equipment.childMode).toBe('DYNAMIC');
    expect(unconfigured.value.equipment.children).toHaveLength(0);
    expect(unconfigured.value.equipment.presentation).toBeUndefined();
  });

  it('lets two child Equipment from the same template have different slot counts and layouts', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const topology = new MemoryTopologyRepository([rack]);
    const service = new WarehouseService(warehouse);
    const chassis = await service.create({
      kind: 'EQUIPMENT',
      name: 'Chassis',
      equipmentType: 'CHASSIS',
    });
    const panel = await service.create({
      kind: 'EQUIPMENT',
      name: 'Panel template',
      equipmentType: 'PANEL',
      allowedChildTypes: ['CIRCUIT_BREAKER'],
    });
    if (!chassis.ok || !panel.ok) throw new Error('Fixtures invalid');
    const factory = new WarehouseInstantiationService(warehouse, topology);
    const root = await factory.instantiate({
      templateId: chassis.value.id,
      rackId: rack.id,
      name: 'BDFB-01',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    if (!root.ok) throw new Error('Root invalid');
    const first = await factory.instantiateChild({
      templateId: panel.value.id,
      parentEquipmentId: root.value.equipment.id,
      slotIndex: 0,
      childMode: 'POSITIONAL',
      childCapacity: 24,
      presentation: row,
    });
    const second = await factory.instantiateChild({
      templateId: panel.value.id,
      parentEquipmentId: root.value.equipment.id,
      slotIndex: 1,
      childMode: 'POSITIONAL',
      childCapacity: 48,
      presentation: column,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.children).toHaveLength(24);
    expect(second.value.children).toHaveLength(48);
    expect(first.value.presentation).toEqual(row);
    expect(second.value.presentation).toEqual(column);
    expect(first.value.template?.templateId).toBe(second.value.template?.templateId);
  });
});
