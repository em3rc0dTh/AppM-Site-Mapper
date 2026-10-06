import { describe, expect, it } from 'vitest';

import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { initializeCas } from '@/modules/rack/domain/cas';
import type { ContainerRackNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { parseAssetTemplateJson } from '@/modules/warehouse/application/template-json-parser';
import { WarehouseInstantiationService } from '@/modules/warehouse/application/warehouse-instantiation-service';
import { WarehouseService } from '@/modules/warehouse/application/warehouse-service';
import { MemoryWarehouseRepository } from '@/modules/warehouse/infrastructure/memory-warehouse-repository';

const timestamp = '2026-09-30T00:00:00.000Z';

function rack(id = 'rack-1'): ContainerRackNode {
  return {
    id,
    kind: 'CONTAINER_RACK',
    variant: 'RACK',
    parentId: 'position-1',
    name: 'Rack 1',
    totalU: 42,
    cas: initializeCas(42),
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('Virtual Warehouse', () => {
  it('creates reusable Equipment templates and rejects duplicate active names', async () => {
    const repository = new MemoryWarehouseRepository();
    const service = new WarehouseService(repository);

    const created = await service.create({
      kind: 'EQUIPMENT',
      name: 'Cisco Catalyst 9300-48P Chassis',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch chassis',
      sizeU: 1,
      widthMm: 482,
      depthMm: 445,
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.kind).toBe('EQUIPMENT');
    expect(created.value.version).toBe(1);
    expect(created.value.dimensionsMm).toEqual({ width: 482, depth: 445 });

    const duplicate = await service.create({
      kind: 'EQUIPMENT',
      name: 'Cisco Catalyst 9300-48P Chassis',
    });
    expect(duplicate).toEqual({ ok: false, error: 'DUPLICATE_TEMPLATE' });
  });

  it('rejects Device templates at the Warehouse trust boundary', async () => {
    expect(
      parseAssetTemplateJson({
        kind: 'DEVICE',
        name: 'Legacy Device Template',
      }),
    ).toBeNull();

    const repository = new MemoryWarehouseRepository();
    const result = await new WarehouseService(repository).create({
      kind: 'DEVICE',
      name: 'Legacy Device Template',
    });

    expect(result).toEqual({ ok: false, error: 'INVALID_KIND' });
  });

  it('creates a Device identity plus an unmounted root Equipment snapshot', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const templateResult = await new WarehouseService(warehouse).create({
      kind: 'EQUIPMENT',
      name: 'Network Switch Chassis 1U',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch chassis',
      sizeU: 1,
      widthMm: 482,
      depthMm: 445,
    });
    if (!templateResult.ok) throw new Error(templateResult.error);

    const rackNode = rack();
    const topology = new MemoryTopologyRepository([rackNode]);

    const result = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: templateResult.value.id,
      rackId: rackNode.id,
      name: 'SW-CORE-01',
      serialNumber: 'FOC123',
      deviceType: 'NETWORK_ELEMENT',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.state).toBe('UNMOUNTED');
    expect(result.value.recommendedMountSizeU).toBe(1);
    expect(result.value.device).toMatchObject({
      kind: 'DEVICE',
      parentId: rackNode.id,
      name: 'SW-CORE-01',
      serialNumber: 'FOC123',
      deviceType: 'NETWORK_ELEMENT',
      category: 'Network switch chassis',
      rootEquipmentIds: [result.value.equipment.id],
    });
    expect(result.value.equipment).toMatchObject({
      kind: 'EQUIPMENT',
      parentId: result.value.device.id,
      deviceId: result.value.device.id,
      parentEquipmentId: null,
      name: 'SW-CORE-01 · Network Switch Chassis 1U',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch chassis',
    });
    expect(result.value.equipment.rackPlacement).toBeUndefined();
    expect(result.value.equipment.template).toEqual({
      templateId: templateResult.value.id,
      templateVersion: 1,
      templateName: 'Network Switch Chassis 1U',
      kind: 'EQUIPMENT',
      manufacturer: 'Cisco',
      model: 'C9300-48P',
      category: 'Network switch chassis',
      sizeU: 1,
      dimensionsMm: { width: 482, depth: 445 },
    });

    const storedDevice = await topology.getById(result.value.device.id);
    const storedEquipment = await topology.getById(result.value.equipment.id);
    expect(storedDevice).toEqual(result.value.device);
    expect(storedEquipment).toEqual(result.value.equipment);
    expect(rackNode.cas.every((range) => range.state !== 'EQUIPPED')).toBe(true);

    const inventory = await new InventoryService(topology).listRackInventory(rackNode.id);
    expect(inventory.ok).toBe(true);
    expect(inventory.ok ? inventory.value.map((item) => item.id) : []).toEqual([
      result.value.equipment.id,
    ]);
  });

  it('rejects a Warehouse instance when its Device serial is already active', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const template = await new WarehouseService(warehouse).create({
      kind: 'EQUIPMENT',
      name: 'Telemetry Chassis',
    });
    if (!template.ok) throw new Error(template.error);

    const rackNode = rack('rack-conflict');
    const existingDevice = {
      id: 'device-existing',
      kind: 'DEVICE' as const,
      parentId: rackNode.id,
      name: 'Existing telemetry device',
      serialNumber: 'EMU-BFDB-02',
      pinned: false,
      deviceType: 'CUSTOM' as const,
      rootEquipmentIds: [],
      lifecycle: 'ACTIVE' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const topology = new MemoryTopologyRepository([rackNode, existingDevice]);

    const result = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: template.value.id,
      rackId: rackNode.id,
      name: 'Duplicate serial device',
      serialNumber: 'EMU-BFDB-02',
    });

    expect(result).toEqual({ ok: false, error: 'SERIAL_ALREADY_ASSIGNED' });
  });
});
