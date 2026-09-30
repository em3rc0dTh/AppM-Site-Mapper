import { describe, expect, it } from 'vitest';

import { parseAssetTemplateJson } from '@/modules/warehouse/application/template-json-parser';
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

  it('rejects a warehouse instance when its telemetry serial is already active', async () => {
    const warehouse = new MemoryWarehouseRepository();
    const template = await new WarehouseService(warehouse).create({
      kind: 'DEVICE',
      name: 'Telemetry Device',
    });
    if (!template.ok) throw new Error(template.error);

    const rack: ContainerRackNode = {
      id: 'rack-conflict',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position-conflict',
      name: 'Rack conflict',
      totalU: 42,
      cas: initializeCas(42),
      lifecycle: 'ACTIVE',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const existingDevice = {
      id: 'device-existing',
      kind: 'DEVICE' as const,
      parentId: rack.id,
      name: 'Existing telemetry device',
      serialNumber: 'EMU-BFDB-02',
      pinned: false,
      lifecycle: 'ACTIVE' as const,
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const topology = new MemoryTopologyRepository([rack, existingDevice]);

    const result = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: template.value.id,
      rackId: rack.id,
      name: 'Duplicate serial device',
      serialNumber: 'EMU-BFDB-02',
    });

    expect(result).toEqual({ ok: false, error: 'SERIAL_ALREADY_ASSIGNED' });
  });

  it('materializes the 96-point emulator into a six-slot physical BDFB chassis', async () => {
    const input = parseAssetTemplateJson({
      kind: 'DEVICE',
      name: 'BDFB Emulator 96P Chassis',
      manufacturer: 'Eaton',
      model: 'BDFB-EMU-96',
      category: 'Power distribution',
      deviceType: 'BDFB',
      sizeU: 4,
      dimensionsMm: { width: 482, depth: 600 },
      physicalBlueprint: {
        type: 'BDFB',
        shelves: [
          {
            label: 'Main Shelf',
            frames: [
              {
                label: 'A',
                panels: [
                  {
                    label: 'Panel A1',
                    endpointCount: 24,
                    endpointVariant: 'BREAKER',
                    rawPointPrefix: '0_1_',
                  },
                  {
                    label: 'Panel A2',
                    endpointCount: 24,
                    endpointVariant: 'BREAKER',
                    rawPointPrefix: '0_2_',
                  },
                  { label: 'Panel A3', endpoints: [] },
                ],
              },
              {
                label: 'B',
                panels: [
                  {
                    label: 'Panel B1',
                    endpointCount: 24,
                    endpointVariant: 'BREAKER',
                    rawPointPrefix: '0_3_',
                  },
                  {
                    label: 'Panel B2',
                    endpointCount: 24,
                    endpointVariant: 'BREAKER',
                    rawPointPrefix: '0_4_',
                  },
                  { label: 'Panel B3', endpoints: [] },
                ],
              },
            ],
          },
        ],
      },
    });
    if (!input) throw new Error('BDFB template JSON did not parse');

    const warehouse = new MemoryWarehouseRepository();
    const createdTemplate = await new WarehouseService(warehouse).create(input);
    if (!createdTemplate.ok) throw new Error(createdTemplate.error);

    const rack: ContainerRackNode = {
      id: 'rack-bdfb',
      kind: 'CONTAINER_RACK',
      variant: 'RACK',
      parentId: 'position-bdfb',
      name: 'Rack BDFB',
      totalU: 42,
      cas: initializeCas(42),
      lifecycle: 'ACTIVE',
      createdAt: '2026-09-30T00:00:00.000Z',
      updatedAt: '2026-09-30T00:00:00.000Z',
    };
    const topology = new MemoryTopologyRepository([rack]);

    const result = await new WarehouseInstantiationService(warehouse, topology).instantiate({
      templateId: createdTemplate.value.id,
      rackId: rack.id,
      name: 'BDFB-LURIN-02',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.node.kind).toBe('DEVICE');
    if (result.value.node.kind !== 'DEVICE') return;
    expect(result.value.node.deviceType).toBe('BDFB');
    expect(result.value.node.bdfb?.shelves).toHaveLength(1);

    const frames = result.value.node.bdfb?.shelves[0]?.frames ?? [];
    expect(frames).toHaveLength(2);
    expect(frames.map((frame) => frame.label)).toEqual(['A', 'B']);
    expect(frames.flatMap((frame) => frame.panels).map((panel) => panel.label)).toEqual([
      'Panel A1',
      'Panel A2',
      'Panel A3',
      'Panel B1',
      'Panel B2',
      'Panel B3',
    ]);

    const endpoints = frames.flatMap((frame) => frame.panels.flatMap((panel) => panel.endpoints));
    expect(endpoints).toHaveLength(96);
    expect(frames[0]?.panels[2]?.endpoints).toHaveLength(0);
    expect(frames[1]?.panels[2]?.endpoints).toHaveLength(0);
    expect(endpoints[0]?.telemetry?.rawPointId).toBe('0_1_1');
    expect(endpoints.at(-1)?.telemetry?.rawPointId).toBe('0_4_24');
    expect(result.value.node.template?.deviceType).toBe('BDFB');

    const persisted = await topology.getById(result.value.node.id);
    expect(persisted?.kind === 'DEVICE' ? persisted.bdfb?.shelves.length : 0).toBe(1);
  });
});
