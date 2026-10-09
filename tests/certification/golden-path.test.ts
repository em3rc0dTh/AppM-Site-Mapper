import { describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';
import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { CasService } from '@/modules/rack/application/cas-service';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { TopologyService } from '@/modules/topology/application/topology-service';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';

function requireSuccess<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw new Error(`Expected success, received: ${String(result.error)}`);
  return result.value;
}

const SITE_POLYGON = [
  { x: 0, y: 0 },
  { x: 4800, y: 0 },
  { x: 4800, y: 3000 },
  { x: 0, y: 3000 },
] as const;

const STRUCTURE_POLYGON = [
  { x: 100, y: 100 },
  { x: 4700, y: 100 },
  { x: 4700, y: 2900 },
  { x: 100, y: 2900 },
] as const;

const ROOM_POLYGON = [
  { x: 0, y: 0 },
  { x: 2400, y: 0 },
  { x: 2400, y: 1800 },
  { x: 0, y: 1800 },
] as const;

const BAY_POLYGON = [
  { x: 0, y: 0 },
  { x: 1200, y: 0 },
  { x: 1200, y: 600 },
  { x: 0, y: 600 },
] as const;

describe('MK1 system golden path', () => {
  it('certifies v1.2 identity → topology → Equipment → CAS → power → telemetry → workspace', async () => {
    const identityRepository = new MemoryIdentityRepository();
    const auth = new AuthService(identityRepository, new MemoryAuthThrottle());

    requireSuccess(
      await auth.bootstrapSuperadmin(
        'admin@example.test',
        'StrongPassword!123',
        'Certification Admin',
      ),
    );

    const login = requireSuccess(
      await auth.authenticate('admin@example.test', 'StrongPassword!123', 'certification-client'),
    );
    expect(requireSuccess(await auth.authorize(login.token, 'topology:write')).role).toBe(
      'SUPERADMIN',
    );

    const topologyRepository = new MemoryTopologyRepository();
    const topology = new TopologyService(topologyRepository);

    const network = requireSuccess(
      await topology.create({ kind: 'NETWORK', parentId: null, name: 'Certification Network' }),
    );
    const site = requireSuccess(
      await topology.create({
        kind: 'SITE',
        parentId: network.id,
        name: 'Certification Site',
        polygon: SITE_POLYGON,
      }),
    );
    const structure = requireSuccess(
      await topology.create({
        kind: 'STRUCTURE',
        parentId: site.id,
        name: 'Certification Structure',
        polygon: STRUCTURE_POLYGON,
      }),
    );
    const level = requireSuccess(
      await topology.create({ kind: 'LEVEL', parentId: structure.id, name: 'Level 1' }),
    );
    const room = requireSuccess(
      await topology.create({
        kind: 'ROOM_SUBSTRUCTURE',
        parentId: level.id,
        name: 'Equipment Room',
        roomVariant: 'ROOM',
        polygon: ROOM_POLYGON,
      }),
    );
    const bay = requireSuccess(
      await topology.create({
        kind: 'CONTAINER_CLUSTER_BAY',
        parentId: room.id,
        name: 'Bay A',
        clusterVariant: 'BAY',
        polygon: BAY_POLYGON,
      }),
    );
    const position = requireSuccess(
      await topology.create({
        kind: 'POSITION',
        parentId: bay.id,
        name: 'A-1',
        coordinate: { row: 'A', column: 1 },
      }),
    );
    const rack = requireSuccess(
      await topology.create({
        kind: 'CONTAINER_RACK',
        parentId: position.id,
        name: 'Rack 01',
        containerVariant: 'RACK',
        totalU: 42,
      }),
    );

    const bdfb = requireSuccess(
      await topology.create({
        kind: 'DEVICE',
        parentId: rack.id,
        name: 'BDFB-01',
        serialNumber: 'CERT-BDFB-001',
        category: 'BDFB',
        deviceType: 'BDFB',
      }),
    ) as DeviceNode;

    const chassis = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: bdfb.id,
        name: 'BDFB-01 Chassis',
        equipmentType: 'CHASSIS',
        childMode: 'POSITIONAL',
        childCapacity: 1,
      }),
    ) as EquipmentNode;

    const shelf = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: chassis.id,
        parentSlotIndex: 0,
        name: 'Shelf 1',
        equipmentType: 'SHELF',
        childMode: 'POSITIONAL',
        childCapacity: 1,
      }),
    ) as EquipmentNode;

    const frame = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: shelf.id,
        parentSlotIndex: 0,
        name: 'Frame 1',
        equipmentType: 'FRAME',
        childMode: 'POSITIONAL',
        childCapacity: 1,
      }),
    ) as EquipmentNode;

    const panel = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: frame.id,
        parentSlotIndex: 0,
        name: 'Panel A',
        equipmentType: 'PANEL',
        childMode: 'POSITIONAL',
        childCapacity: 2,
      }),
    ) as EquipmentNode;

    const breaker = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: panel.id,
        parentSlotIndex: 0,
        name: 'Breaker 1',
        equipmentType: 'CIRCUIT_BREAKER',
      }),
    ) as EquipmentNode;

    expect(chassis.deviceId).toBe(bdfb.id);
    expect(breaker.parentEquipmentId).toBe(panel.id);

    const loadDevice = requireSuccess(
      await topology.create({
        kind: 'DEVICE',
        parentId: rack.id,
        name: 'Load-01',
        serialNumber: 'CERT-LOAD-001',
        category: 'LOAD',
        deviceType: 'SERVER',
      }),
    ) as DeviceNode;
    let loadEquipment = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: loadDevice.id,
        name: 'Load-01 Chassis',
        serialNumber: 'CERT-EQUIPMENT-001',
        category: 'LOAD',
        equipmentType: 'CHASSIS',
      }),
    ) as EquipmentNode;

    loadEquipment = {
      ...loadEquipment,
      accessPorts: [
        {
          id: loadEquipment.id + ':power-in',
          deviceId: loadDevice.id,
          equipmentId: loadEquipment.id,
          name: 'Power input',
          portType: 'POWER',
          direction: 'INPUT',
          exposure: 'EXTERNAL',
          lifecycle: 'ACTIVE',
        },
      ],
    };
    await topologyRepository.replace(loadEquipment);

    expect(loadEquipment.deviceId).toBe(loadDevice.id);

    const deepLink = await topology.buildDeepLink(bdfb.id);
    const resolved = requireSuccess(
      await topology.resolveDeepLink(deepLink.split('/').filter(Boolean).slice(1)),
    );
    expect(resolved.id).toBe(bdfb.id);

    const spatial = new SpatialService(topologyRepository);
    const layout = requireSuccess(await spatial.getRoomLayout(room.id));
    expect(layout.racks).toEqual([
      expect.objectContaining({
        id: rack.id,
        rect: expect.objectContaining({ x: 0, y: 0, width: 600, depth: 600 }),
      }),
    ]);

    const cas = new CasService(topologyRepository);
    const reservedRack = requireSuccess(
      await cas.reserve(rack.id, {
        mountStartU: 10,
        physicalSizeU: 2,
        clearanceTopU: 1,
        clearanceBottomU: 1,
      }),
    );
    const reservation = reservedRack.cas.find((range) => range.state === 'RESERVED');
    expect(reservation).toBeDefined();
    requireSuccess(await cas.equip(rack.id, reservation!.id, loadEquipment.id));

    const elevation = requireSuccess(
      await new RackElevationService(topologyRepository).getView(rack.id),
    );
    expect(
      elevation.rows.some(
        (row) => row.occupant?.id === loadEquipment.id && row.role === 'PHYSICAL',
      ),
    ).toBe(true);

    const inventory = new InventoryService(topologyRepository);
    requireSuccess(await inventory.setPinned(bdfb.id, true));
    requireSuccess(await inventory.setPinned(loadEquipment.id, true));

    const powerRepository = new MemoryPowerRepository();
    const power = new PowerService(topologyRepository, powerRepository);
    const sourceAccessPortId = breaker.id + ':power-out';
    const path = requireSuccess(
      await power.create({
        sourceAccessPortId,
        targetAccessPortId: loadEquipment.id + ':power-in',
        feed: 'A',
        label: 'Certification Feed A',
      }),
    );

    expect(path.sourceAccessPortId).toBe(sourceAccessPortId);
    expect(path.targetAccessPortId).toBe(loadEquipment.id + ':power-in');

    const timestamp = '2026-09-22T20:00:00.000Z';
    const sourceBinding: TelemetryBinding = {
      id: 'cert-source-binding',
      protocol: 'MQTT',
      sourceIdentity: 'CERT-BDFB-001',
      metric: 'SOURCE',
      targetType: 'DEVICE',
      targetId: bdfb.id,
      lifecycle: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const telemetry = new TelemetryService(
      topologyRepository,
      new TelemetryHub(8),
      { topicPrefix: 'data/dev/', maxPayloadBytes: 4096 },
      { configuredBindings: [sourceBinding] },
    );

    const sample = requireSuccess(
      await telemetry.ingest(
        'data/dev/CERT-BDFB-001',
        new TextEncoder().encode(
          JSON.stringify({
            reported: {
              voltage: 48.1,
              status: 'online',
            },
          }),
        ),
        timestamp,
      ),
    );

    expect(sample.entityId).toBe(bdfb.id);
    expect(telemetry.latest(bdfb.id)?.reported).toMatchObject({
      voltage: 48.1,
      status: 'online',
    });

    const workspace = await new WorkspaceService(topologyRepository, powerRepository).getSnapshot();
    expect(workspace.navigation).toHaveLength(1);
    expect(workspace.pinned.map((item) => item.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
    expect(workspace.bdfb).toEqual([
      expect.objectContaining({
        deviceId: bdfb.id,
        shelves: 1,
        frames: 1,
        panels: 1,
        endpoints: 1,
      }),
    ]);
    expect(workspace.activePowerPaths).toBe(1);

    const standard = requireSuccess(
      await auth.createUser(login.user, {
        email: 'operator@example.test',
        displayName: 'Read Only Operator',
        role: 'STANDARD',
        temporaryPassword: 'TemporaryPass!123',
      }),
    );
    expect(standard.role).toBe('STANDARD');

    const standardLogin = requireSuccess(
      await auth.authenticate(
        'operator@example.test',
        'TemporaryPass!123',
        'certification-standard-client',
      ),
    );
    expect(await auth.authorize(standardLogin.token, 'topology:write')).toEqual({
      ok: false,
      error: 'PASSWORD_CHANGE_REQUIRED',
    });

    await auth.logout(login.token);
    expect(await auth.resolveSession(login.token)).toBeNull();
  });
});
