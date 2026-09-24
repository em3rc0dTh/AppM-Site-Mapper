import { describe, expect, it } from 'vitest';

import { AuthService } from '@/modules/identity/application/auth-service';
import {
  MemoryAuthThrottle,
  MemoryIdentityRepository,
} from '@/modules/identity/infrastructure/memory-identity-repository';
import { InventoryService } from '@/modules/inventory/application/inventory-service';
import { BdfbService } from '@/modules/power/application/bdfb-service';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { CasService } from '@/modules/rack/application/cas-service';
import { RackElevationService } from '@/modules/rack/application/rack-elevation-service';
import { SpatialService } from '@/modules/spatial/application/spatial-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { MemoryTelemetryLatestRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-latest-repository';
import { MemoryTelemetrySourceRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-source-repository';
import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';

function requireSuccess<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) {
    throw new Error(`Expected success, received: ${String(result.error)}`);
  }

  return result.value;
}

describe('MK1 system golden path', () => {
  it('certifies identity → topology → Blueprint → CAS → inventory → power → telemetry → workspace', async () => {
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
      await topology.create({ kind: 'SITE', parentId: network.id, name: 'Certification Site' }),
    );
    const structure = requireSuccess(
      await topology.create({
        kind: 'STRUCTURE',
        parentId: site.id,
        name: 'Certification Structure',
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
      }),
    );
    const bay = requireSuccess(
      await topology.create({
        kind: 'CONTAINER_CLUSTER_BAY',
        parentId: room.id,
        name: 'Bay A',
        clusterVariant: 'BAY',
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
    const device = requireSuccess(
      await topology.create({
        kind: 'DEVICE',
        parentId: rack.id,
        name: 'BDFB-01',
        serialNumber: 'CERT-DEVICE-001',
        category: 'BDFB',
      }),
    );
    const equipment = requireSuccess(
      await topology.create({
        kind: 'EQUIPMENT',
        parentId: rack.id,
        name: 'Load-01',
        serialNumber: 'CERT-EQUIPMENT-001',
        category: 'LOAD',
      }),
    );

    expect(device.parentId).toBe(rack.id);
    expect(equipment.parentId).toBe(rack.id);
    expect(device.parentId).toBe(equipment.parentId);

    const deepLink = await topology.buildDeepLink(device.id);
    const resolved = requireSuccess(
      await topology.resolveDeepLink(deepLink.split('/').filter(Boolean).slice(1)),
    );
    expect(resolved.id).toBe(device.id);

    const spatial = new SpatialService(topologyRepository);
    requireSuccess(
      await spatial.updateRoomPolygon(room.id, [
        { x: 0, y: 0 },
        { x: 2400, y: 0 },
        { x: 2400, y: 1800 },
        { x: 0, y: 1800 },
      ]),
    );
    const layout = requireSuccess(await spatial.getRoomLayout(room.id));
    expect(layout.racks).toEqual([
      expect.objectContaining({
        id: rack.id,
        rect: expect.objectContaining({ x: 0, y: 0, width: 600, depth: 600 }),
      }),
    ]);
    expect(layout.assignableSlots.length).toBeGreaterThan(0);

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

    requireSuccess(await cas.equip(rack.id, reservation!.id, device.id));

    const elevation = requireSuccess(
      await new RackElevationService(topologyRepository).getView(rack.id),
    );
    expect(
      elevation.rows.some((row) => row.occupant?.id === device.id && row.role === 'PHYSICAL'),
    ).toBe(true);

    const inventory = new InventoryService(topologyRepository);
    requireSuccess(await inventory.setPinned(device.id, true));
    requireSuccess(await inventory.setPinned(equipment.id, true));

    const bdfb = new BdfbService(topologyRepository);
    requireSuccess(
      await bdfb.configure(device.id, {
        shelves: [
          {
            id: 'cert-shelf-1',
            label: 'Shelf 1',
            frames: [
              {
                id: 'cert-frame-1',
                label: 'Frame 1',
                panels: [
                  {
                    id: 'cert-panel-1',
                    label: 'Panel A',
                    endpoints: [
                      {
                        id: 'cert-breaker-1',
                        variant: 'BREAKER',
                        label: 'Breaker 1',
                        capacity: 20,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const powerRepository = new MemoryPowerRepository();
    const power = new PowerService(topologyRepository, powerRepository);
    const path = requireSuccess(
      await power.create({
        source: {
          entityId: device.id,
          internal: {
            shelfId: 'cert-shelf-1',
            frameId: 'cert-frame-1',
            panelId: 'cert-panel-1',
            breakerHolderId: 'cert-breaker-1',
          },
        },
        target: { entityId: equipment.id },
        feed: 'A',
        label: 'Certification Feed A',
      }),
    );
    expect(path.sourceEntityId).toBe(device.id);
    expect(path.targetEntityId).toBe(equipment.id);

    const hub = new TelemetryHub(8);
    const telemetrySources = new MemoryTelemetrySourceRepository([
      {
        id: 'cert-telemetry-source-1',
        entityId: device.id,
        entityKind: 'DEVICE',
        topicSource: 'cert-source-1',
        expectedSerialNumber: 'CERT-DEVICE-001',
        protocolProfile: 'telxius-v1',
        rawSchemaVersion: 'telxius-v1',
        staleAfterSeconds: 30,
        enabled: true,
      },
    ]);
    const telemetryLatest = new MemoryTelemetryLatestRepository();
    const telemetry = new TelemetryService(telemetrySources, telemetryLatest, hub, {
      topicPrefix: 'appmanager/v1/raw/',
      topicSuffix: '/telemetry',
      maxPayloadBytes: 4096,
    });

    const sample = requireSuccess(
      await telemetry.ingest(
        'appmanager/v1/raw/cert-source-1/telemetry',
        new TextEncoder().encode(
          JSON.stringify({
            sn: 'CERT-DEVICE-001',
            reported: {
              voltage: 48.1,
              status: 'online',
            },
          }),
        ),
        '2026-09-22T20:00:00.000Z',
      ),
    );

    expect(sample.entityId).toBe(device.id);
    expect((await telemetry.latest(device.id))?.reported).toMatchObject({
      voltage: 48.1,
      status: 'online',
    });

    const workspace = await new WorkspaceService(topologyRepository, powerRepository).getSnapshot();

    expect(workspace.navigation).toHaveLength(1);
    expect(workspace.pinned.map((item) => item.kind).sort()).toEqual(['DEVICE', 'EQUIPMENT']);
    expect(workspace.bdfb).toEqual([
      expect.objectContaining({
        deviceId: device.id,
        shelves: 1,
        frames: 1,
        panels: 1,
        endpoints: 1,
      }),
    ]);
    expect(workspace.activePowerPaths).toBe(1);
    expect(workspace.notifications).toEqual([]);

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
    const blocked = await auth.authorize(standardLogin.token, 'topology:write');
    expect(blocked).toEqual({ ok: false, error: 'PASSWORD_CHANGE_REQUIRED' });

    await auth.logout(login.token);
    expect(await auth.resolveSession(login.token)).toBeNull();
  });
});
