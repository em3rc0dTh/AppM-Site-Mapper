import { describe, expect, it } from 'vitest';

import { FullPowerTraceService } from '@/modules/power/application/full-power-trace-service';
import { PowerService } from '@/modules/power/application/power-service';
import type { PowerPath } from '@/modules/power/domain/entities';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type {
  AccessPort,
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
  EquipmentType,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-10-01T18:00:00.000Z';

function powerPort(
  deviceId: string,
  equipmentId: string,
  id: string,
  direction: 'INPUT' | 'OUTPUT',
  feed?: 'A' | 'B',
): AccessPort {
  return {
    id,
    deviceId,
    equipmentId,
    name: id,
    portType: 'POWER',
    direction,
    exposure: 'EXTERNAL',
    lifecycle: 'ACTIVE',
    ...(feed ? { attributes: { feed } } : {}),
  };
}

function device(id: string, parentId: string, deviceType: DeviceNode['deviceType'], rootIds: string[]): DeviceNode {
  return {
    id,
    kind: 'DEVICE',
    parentId,
    name: id.toUpperCase(),
    deviceType,
    rootEquipmentIds: rootIds,
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function equipment(input: {
  id: string;
  deviceId: string;
  parentId: string;
  parentEquipmentId: string | null;
  equipmentType: EquipmentType;
  name?: string;
  children?: readonly (string | null)[];
  accessPorts?: readonly AccessPort[];
  attributes?: Readonly<Record<string, unknown>>;
}): EquipmentNode {
  return {
    id: input.id,
    kind: 'EQUIPMENT',
    parentId: input.parentId,
    deviceId: input.deviceId,
    equipmentType: input.equipmentType,
    parentEquipmentId: input.parentEquipmentId,
    childMode: 'DYNAMIC',
    children: input.children ?? [],
    accessPorts: input.accessPorts ?? [],
    name: input.name ?? input.id,
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(input.attributes ? { attributes: input.attributes } : {}),
  };
}

function sourceFixture(id: string, breakerId: string, rawPointId: string) {
  const chassisId = `${id}-chassis`;
  const shelfId = `${id}-shelf`;
  const frameId = `${id}-frame`;
  const panelId = `${id}-panel`;
  const portId = `${breakerId}-out`;
  const sourceDevice = device(id, 'rack-power', 'BDFB', [chassisId]);

  const chassis = equipment({
    id: chassisId,
    deviceId: id,
    parentId: id,
    parentEquipmentId: null,
    equipmentType: 'CHASSIS',
    children: [shelfId],
    name: 'Chassis',
  });
  const shelf = equipment({
    id: shelfId,
    deviceId: id,
    parentId: chassisId,
    parentEquipmentId: chassisId,
    equipmentType: 'SHELF',
    children: [frameId],
    name: 'Shelf',
  });
  const frame = equipment({
    id: frameId,
    deviceId: id,
    parentId: shelfId,
    parentEquipmentId: shelfId,
    equipmentType: 'FRAME',
    children: [panelId],
    name: 'Frame',
  });
  const panel = equipment({
    id: panelId,
    deviceId: id,
    parentId: frameId,
    parentEquipmentId: frameId,
    equipmentType: 'PANEL',
    children: [breakerId],
    name: 'Panel',
  });
  const breakerPort = powerPort(id, breakerId, portId, 'OUTPUT');
  const breaker = equipment({
    id: breakerId,
    deviceId: id,
    parentId: panelId,
    parentEquipmentId: panelId,
    equipmentType: 'CIRCUIT_BREAKER',
    name: breakerId.toUpperCase(),
    accessPorts: [breakerPort],
    attributes: { telemetryRawPointId: rawPointId },
  });

  return {
    device: sourceDevice,
    equipment: [chassis, shelf, frame, panel, breaker] as const,
    breaker,
    port: breakerPort,
  };
}

function sample(
  sourceDeviceId: string,
  breaker: EquipmentNode,
  sourceIdentity: string,
  rawPointId: string,
  voltageV: number,
  currentA: number,
): TelemetrySample {
  return {
    bindingId: `binding:${sourceIdentity}`,
    targetId: sourceDeviceId,
    targetType: 'DEVICE',
    entityId: sourceDeviceId,
    entityKind: 'DEVICE',
    sourceIdentity,
    reported: {},
    receivedAt: timestamp,
    protocol: 'BFDB',
    breakerReadings: [
      {
        deviceId: sourceDeviceId,
        sourceIdentity,
        shelfId: `${sourceDeviceId}-shelf`,
        frameId: `${sourceDeviceId}-frame`,
        panelId: `${sourceDeviceId}-panel`,
        panelLabel: 'Panel',
        breakerId: breaker.id,
        breakerLabel: breaker.name,
        rawPointId,
        position: 1,
        metrics: {
          voltageV: { value: voltageV, observedAt: timestamp },
          currentA: { value: currentA, observedAt: timestamp },
        },
        receivedAt: timestamp,
      },
    ],
  };
}

describe('FullPowerTraceService', () => {
  it('resolves independent A/B feeds from breaker AccessPorts to recursively nested Equipment', async () => {
    const rack: ContainerRackNode = {
      id: 'rack-load',
      kind: 'CONTAINER_RACK',
      parentId: 'position-load',
      name: 'RACK-LOAD',
      variant: 'RACK',
      totalU: 42,
      cas: [],
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const root = device('device-root', rack.id, 'SERVER', ['equipment-module']);
    const computeModule = equipment({
      id: 'equipment-module',
      deviceId: root.id,
      parentId: root.id,
      parentEquipmentId: null,
      equipmentType: 'CHASSIS',
      name: 'Compute Module',
      children: ['equipment-controller'],
    });
    const portA = powerPort(root.id, 'equipment-controller', 'power-a', 'INPUT', 'A');
    const portB = powerPort(root.id, 'equipment-controller', 'power-b', 'INPUT', 'B');
    const controller = equipment({
      id: 'equipment-controller',
      deviceId: root.id,
      parentId: computeModule.id,
      parentEquipmentId: computeModule.id,
      equipmentType: 'POWER_MODULE',
      name: 'Power Controller',
      accessPorts: [portA, portB],
      attributes: {
        powerContractRoot: true,
        powerRedundancy: 'A_B_REQUIRED',
        requiredFeeds: ['A', 'B'],
      },
    });

    const sourceA = sourceFixture('bdfb-a', 'breaker-a', '0_1_8');
    const sourceB = sourceFixture('bdfb-b', 'breaker-b', '0_3_11');

    const topology = new MemoryTopologyRepository([
      rack,
      root,
      computeModule,
      controller,
      sourceA.device,
      ...sourceA.equipment,
      sourceB.device,
      ...sourceB.equipment,
    ]);
    const power = new MemoryPowerRepository();
    const service = new PowerService(topology, power);

    expect(
      await service.create({
        sourceAccessPortId: sourceA.port.id,
        targetAccessPortId: portA.id,
        feed: 'A',
        label: 'Primary feed',
      }),
    ).toMatchObject({ ok: true });
    expect(
      await service.create({
        sourceAccessPortId: sourceB.port.id,
        targetAccessPortId: portB.id,
        feed: 'B',
        label: 'Secondary feed',
      }),
    ).toMatchObject({ ok: true });

    const samples = new Map<string, TelemetrySample>([
      [
        sourceA.device.id,
        sample(sourceA.device.id, sourceA.breaker, 'EMU-BFDB-01', '0_1_8', 12.2, 8.1),
      ],
      [
        sourceB.device.id,
        sample(sourceB.device.id, sourceB.breaker, 'EMU-BFDB-02', '0_3_11', 12.3, 7.9),
      ],
    ]);

    const trace = await new FullPowerTraceService(topology, power, {
      latest: (entityId) => samples.get(entityId) ?? null,
    }).resolve(root.id);

    expect(trace).not.toBeNull();
    expect(trace?.feedA).toHaveLength(1);
    expect(trace?.feedB).toHaveLength(1);
    expect(trace?.feedA[0]?.source.entityId).toBe(sourceA.device.id);
    expect(trace?.feedB[0]?.source.entityId).toBe(sourceB.device.id);
    expect(trace?.feedA[0]?.target.hierarchy).toEqual([
      'RACK-LOAD',
      'DEVICE-ROOT',
      'Compute Module',
      'Power Controller',
    ]);
    expect(trace?.feedA[0]?.target.accessPort).toMatchObject({ id: 'power-a', feed: 'A' });
    expect(trace?.feedB[0]?.target.accessPort).toMatchObject({ id: 'power-b', feed: 'B' });
    expect(trace?.feedA[0]?.telemetry).toMatchObject({
      status: 'LIVE',
      rawPointId: '0_1_8',
      sourceIdentity: 'EMU-BFDB-01',
      voltageV: 12.2,
      currentA: 8.1,
    });
    expect(trace?.policies).toEqual([
      expect.objectContaining({
        entityId: root.id,
        policy: 'A_B_REQUIRED',
        status: 'SATISFIED',
        feedsPresent: ['A', 'B'],
      }),
    ]);
  });

  it('keeps a target leg visible and marks a missing source AccessPort as broken', async () => {
    const root = device('load', 'rack-load', 'SERVER', ['load-power']);
    const input = powerPort(root.id, 'load-power', 'load-in', 'INPUT', 'A');
    const powerModule = equipment({
      id: 'load-power',
      deviceId: root.id,
      parentId: root.id,
      parentEquipmentId: null,
      equipmentType: 'POWER_MODULE',
      name: 'Load power',
      accessPorts: [input],
    });
    const topology = new MemoryTopologyRepository([root, powerModule]);
    const broken: PowerPath = {
      id: 'broken-path',
      sourceAccessPortId: 'missing-source',
      targetAccessPortId: input.id,
      feed: 'A',
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const power = new MemoryPowerRepository([broken]);

    const trace = await new FullPowerTraceService(topology, power).resolve(root.id);

    expect(trace?.feedA).toHaveLength(1);
    expect(trace?.feedA[0]?.topologyStatus).toBe('BROKEN_SOURCE');
    expect(trace?.feedA[0]?.target.accessPort?.id).toBe(input.id);
  });
});
