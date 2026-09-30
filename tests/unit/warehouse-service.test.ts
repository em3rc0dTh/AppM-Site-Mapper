import { describe, expect, it } from 'vitest';

import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { MemoryWarehouseRepository } from '@/modules/warehouse/infrastructure/memory-warehouse-repository';
import { initializeCas } from '@/modules/rack/domain/cas';
import type { ContainerRackNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

describe('Virtual Warehouse', () => {
  it('creates reusable templates and rejects duplicate active names by kind', async () => {
    const repository = new MemoryWarehouseRepository();
    const service = new WarehouseService(repository);

    const created = await service.create({
      kind: 'DEVICE',
      name: 'Cisco Catalyst 9300-48P',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch',
      sizeU: 1,
      widthMm: 482,
      depthMm: 445,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.version).toBe(1);
    expect(created.value.dimensionsMm).toEqual({ width: 482, depth: 445 });

    const duplicate = await service.create({
      kind: 'DEVICE',
      name: 'Cisco Catalyst 9300-48P',
    });
    expect(duplicate).toEqual({ ok: false, error: 'DUPLICATE_TEMPLATE' });
  });

  it('instantiates a physical inventory item with a frozen template snapshot', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const warehouseService = new WarehouseService(warehouse);
    const templateResult = await warehouseService.create({
      kind: 'DEVICE',
      name: 'Cisco Catalyst 9300-48P',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch',
      sizeU: 1,
      widthMm: 482,
      depthMm: 445,
    });
    if (!templateResult.ok) throw new Error(templateResult.error);

    const rack: ContainerRackNode = {
      id: 'rack-1',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position-1',
      name: 'Rack 1',
      totalU: 42,
      cas: initializeCas(42),
      lifecycle: 'ACTIVE',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const topology = new MemoryTopologyRepository([rack]);

    const result = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: templateResult.value.id,
      rackId: rack.id,
      name: 'SW-CORE-01',
      serialNumber: 'FOC123',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toBe('UNMOUNTED');
    expect(result.value.recommendedMountSizeU).toBe(1);
    expect(result.value.node.name).toBe('SW-CORE-01');
    expect(result.value.node.serialNumber).toBe('FOC123');
    expect(result.value.node.category).toBe('Network switch');
    expect(result.value.node.template).toEqual({
      templateId: templateResult.value.id,
      templateVersion: 1,
      templateName: 'Cisco Catalyst 9300-48P',
      kind: 'DEVICE',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch',
      sizeU: 1,
      dimensionsMm: { width: 482, depth: 445 },
    });

    const stored = await topology.getById(result.value.node.id);
    expect(stored).toEqual(result.value.node);
    expect(rack.cas.every((range) => range.state !== 'EQUIPPED')).toBe(true);
  });
});
