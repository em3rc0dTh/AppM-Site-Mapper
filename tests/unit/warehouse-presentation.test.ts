import { describe, expect, it } from 'vitest';

import { initializeCas } from '@/modules/rack/domain/cas';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { ContainerRackNode, EquipmentPresentation } from '@/modules/topology/domain/entities';
import { parseAssetTemplateJson } from '@/modules/warehouse/application/template-json-parser';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { MemoryWarehouseRepository } from '@/modules/warehouse/infrastructure/memory-warehouse-repository';

const presentation: EquipmentPresentation = {
  direction: 'COLUMN',
  maxPerLine: 2,
  childrenVisibility: 'INLINE',
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

describe('Warehouse presentation contract — JSON to physical Equipment', () => {
  it('parses validated presentation from JSON, including nullable maxPerLine', () => {
    const input = parseAssetTemplateJson({
      kind: 'EQUIPMENT',
      name: 'Frame',
      equipmentType: 'FRAME',
      childMode: 'POSITIONAL',
      childCapacity: 2,
      presentation,
    });
    expect(input?.presentation).toEqual(presentation);
    expect(parseAssetTemplateJson({
      kind: 'EQUIPMENT',
      name: 'Frame Auto',
      presentation: { direction: 'ROW', maxPerLine: null, childrenVisibility: 'AUTO' },
    })?.presentation?.maxPerLine).toBeNull();
  });

  it('rejects malformed and unknown presentation values instead of losing them', () => {
    for (const invalid of [
      { direction: 'GRID', maxPerLine: 2, childrenVisibility: 'INLINE' },
      { direction: 'ROW', maxPerLine: 0, childrenVisibility: 'INLINE' },
      { direction: 'ROW', maxPerLine: 257, childrenVisibility: 'INLINE' },
      { direction: 'ROW', maxPerLine: 2.5, childrenVisibility: 'INLINE' },
      { direction: 'COLUMN', maxPerLine: 2, childrenVisibility: 'EXPANDED' },
      { direction: 'ROW', maxPerLine: 2, childrenVisibility: 'AUTO', extra: true },
    ]) {
      expect(parseAssetTemplateJson({
        kind: 'EQUIPMENT',
        name: 'Invalid',
        presentation: invalid,
      })).toBeNull();
    }
  });

  it('persists template defaults, root Equipment presentation, and its immutable snapshot', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const topology = new MemoryTopologyRepository([rack]);
    const parsed = parseAssetTemplateJson({
      kind: 'EQUIPMENT',
      name: 'MK1 Lab chassis',
      equipmentType: 'CHASSIS',
      childMode: 'POSITIONAL',
      childCapacity: 2,
      presentation,
    });
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    const created = await new WarehouseService(warehouse).create(parsed);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await warehouse.getById(created.value.id))?.presentation).toEqual(presentation);

    const instance = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: created.value.id,
      rackId: rack.id,
      name: 'BDFB-01',
      deviceType: 'BDFB',
    });
    expect(instance.ok).toBe(true);
    if (!instance.ok) return;
    expect(instance.value.equipment.presentation).toEqual(presentation);
    expect(instance.value.equipment.template?.presentation).toEqual(presentation);
    expect(instance.value.equipment.children).toEqual([null, null]);
    const persisted = await topology.getById(instance.value.equipment.id);
    expect(persisted?.kind === 'EQUIPMENT' ? persisted.presentation : null).toEqual(presentation);

    const override: EquipmentPresentation = {
      direction: 'ROW',
      maxPerLine: 1,
      childrenVisibility: 'SUMMARY',
    };
    const second = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: created.value.id,
      rackId: rack.id,
      name: 'BDFB-02',
      presentation: override,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.equipment.presentation).toEqual(override);
    expect(second.value.equipment.template?.presentation).toEqual(presentation);
    expect((await warehouse.getById(created.value.id))?.presentation).toEqual(presentation);
  });

  it('inherits child Equipment presentation from its template unless explicitly overridden', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const topology = new MemoryTopologyRepository([rack]);
    const service = new WarehouseService(warehouse);
    const root = await service.create({
      kind: 'EQUIPMENT',
      name: 'Root',
      equipmentType: 'CHASSIS',
      childMode: 'POSITIONAL',
      childCapacity: 2,
    });
    const child = await service.create({
      kind: 'EQUIPMENT',
      name: 'Panel',
      equipmentType: 'PANEL',
      childMode: 'POSITIONAL',
      childCapacity: 24,
      presentation,
    });
    if (!root.ok || !child.ok) throw new Error('fixture template failed');
    const instantiator = new WarehouseInstantiationService(warehouse, topology);
    const device = await instantiator.instantiate({
      templateId: root.value.id,
      rackId: rack.id,
      name: 'BDFB-01',
    });
    if (!device.ok) throw new Error('fixture root failed');
    const first = await instantiator.instantiateChild({
      templateId: child.value.id,
      parentEquipmentId: device.value.equipment.id,
      slotIndex: 0,
    });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.presentation).toEqual(presentation);
    const override: EquipmentPresentation = {
      direction: 'ROW',
      maxPerLine: 8,
      childrenVisibility: 'INLINE',
    };
    const second = await instantiator.instantiateChild({
      templateId: child.value.id,
      parentEquipmentId: device.value.equipment.id,
      slotIndex: 1,
      presentation: override,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.presentation).toEqual(override);
      expect(second.value.template?.presentation).toEqual(presentation);
    }
  });
});
