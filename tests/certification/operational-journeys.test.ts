import { describe, expect, it } from 'vitest';

import { TopologyService } from '@/modules/topology/application/topology-service';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import { TelemetryService } from '@/modules/telemetry/application/telemetry-service';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import type { EquipmentNode } from '@/modules/topology/domain/entities';
import { WorkspaceService } from '@/modules/workspace/application/workspace-service';

function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const polygon = (side: number) => [
  { x: 0, y: 0 },
  { x: side, y: 0 },
  { x: side, y: side },
  { x: 0, y: side },
];
const timestamp = '2026-10-13T16:00:00.000Z';
const metrics = ['VOLTAGE', 'CURRENT', 'POWER', 'ENERGY'] as const;
const binding = (
  id: string,
  source: string,
  target: string,
  metric: string,
  point?: string,
): TelemetryBinding => ({
  id,
  protocol: 'MQTT',
  sourceIdentity: source,
  targetType: 'EQUIPMENT',
  targetId: target,
  metric,
  ...(point ? { sourcePointId: point } : {}),
  lifecycle: 'ACTIVE',
  createdAt: timestamp,
  updatedAt: timestamp,
});

describe('Operational journeys: isolated sites, physical connections and MQTT', () => {
  it('creates two full Sites, provisions independent panels and verifies isolation', async () => {
    const repository = new MemoryTopologyRepository();
    const topology = new TopologyService(repository);
    const powerRepository = new MemoryPowerRepository();
    const power = new PowerService(repository, powerRepository);
    const network = must(
      await topology.create({ kind: 'NETWORK', parentId: null, name: 'Lab Network' }),
    );

    async function siteFixture(name: string, source: string, prefix: string) {
      const site = must(
        await topology.create({
          kind: 'SITE',
          parentId: network.id,
          name,
          polygon: polygon(6000),
        }),
      );
      const structure = must(
        await topology.create({
          kind: 'STRUCTURE',
          parentId: site.id,
          name: name + ' Structure',
          polygon: polygon(5000),
        }),
      );
      const level = must(
        await topology.create({
          kind: 'LEVEL',
          parentId: structure.id,
          name: name + ' Level',
        }),
      );
      const room = must(
        await topology.create({
          kind: 'ROOM_SUBSTRUCTURE',
          parentId: level.id,
          name: name + ' Room',
          roomVariant: 'ROOM',
          polygon: polygon(4000),
        }),
      );
      const bay = must(
        await topology.create({
          kind: 'CONTAINER_CLUSTER_BAY',
          parentId: room.id,
          name: name + ' Bay',
          clusterVariant: 'BAY',
          polygon: polygon(2000),
        }),
      );
      const position = must(
        await topology.create({
          kind: 'POSITION',
          parentId: bay.id,
          name: name + ' Position',
          coordinate: { row: 'A', column: 1 },
        }),
      );
      const rack = must(
        await topology.create({
          kind: 'CONTAINER_RACK',
          parentId: position.id,
          name: name + ' Rack',
          containerVariant: 'RACK',
          totalU: 42,
        }),
      );
      const device = must(
        await topology.create({
          kind: 'DEVICE',
          parentId: rack.id,
          name: name + ' BDFB',
          deviceType: 'BDFB',
        }),
      );
      const panel = must(
        await topology.create({
          kind: 'EQUIPMENT',
          parentId: device.id,
          name: name + ' Panel',
          equipmentType: 'PANEL',
          childMode: 'POSITIONAL',
          childCapacity: 24,
          serialNumber: source,
          telemetryPointPrefix: prefix,
        }),
      ) as EquipmentNode;
      const breaker = must(
        await topology.create({
          kind: 'EQUIPMENT',
          parentId: panel.id,
          parentSlotIndex: 0,
          name: name + ' Breaker',
          equipmentType: 'CIRCUIT_BREAKER',
        }),
      ) as EquipmentNode;

      // A load Equipment receives two distinct power feeds.
      const load = must(
        await topology.create({
          kind: 'EQUIPMENT',
          parentId: device.id,
          name: name + ' UPS',
          equipmentType: 'CHASSIS',
        }),
      ) as EquipmentNode;
      const sourcePortA = breaker.id + ':out-a';
      const sourcePortB = breaker.id + ':out-b';
      const targetPortA = load.id + ':in-a';
      const targetPortB = load.id + ':in-b';
      await repository.replace({
        ...breaker,
        accessPorts: [
          {
            id: sourcePortA,
            deviceId: device.id,
            equipmentId: breaker.id,
            name: 'Breaker A output',
            portType: 'POWER',
            direction: 'OUTPUT',
            exposure: 'EXTERNAL',
            lifecycle: 'ACTIVE',
            attributes: { feed: 'A' },
          },
          {
            id: sourcePortB,
            deviceId: device.id,
            equipmentId: breaker.id,
            name: 'Breaker B output',
            portType: 'POWER',
            direction: 'OUTPUT',
            exposure: 'EXTERNAL',
            lifecycle: 'ACTIVE',
            attributes: { feed: 'B' },
          },
        ],
      });
      await repository.replace({
        ...load,
        accessPorts: [
          {
            id: targetPortA,
            deviceId: device.id,
            equipmentId: load.id,
            name: 'UPS A input',
            portType: 'POWER',
            direction: 'INPUT',
            exposure: 'EXTERNAL',
            lifecycle: 'ACTIVE',
            attributes: { feed: 'A' },
          },
          {
            id: targetPortB,
            deviceId: device.id,
            equipmentId: load.id,
            name: 'UPS B input',
            portType: 'POWER',
            direction: 'INPUT',
            exposure: 'EXTERNAL',
            lifecycle: 'ACTIVE',
            attributes: { feed: 'B' },
          },
        ],
      });

      return {
        site,
        rack,
        device,
        panel,
        breaker,
        load,
        sourcePortA,
        sourcePortB,
        targetPortA,
        targetPortB,
      };
    }

    const a = await siteFixture('SITE LIMA', 'LAB-SN-LIMA', '0_1');
    const b = await siteFixture('SITE QUITO', 'LAB-SN-QUITO', '0_2');

    expect((await topology.listChildren(network.id)).map((x) => x.name).sort()).toEqual([
      'SITE LIMA',
      'SITE QUITO',
    ]);
    expect(await topology.getById(a.panel.id)).toMatchObject({
      telemetryPointPrefix: '0_1',
      children: [a.breaker.id, ...Array(23).fill(null)],
    });
    expect(await topology.getById(b.panel.id)).toMatchObject({
      telemetryPointPrefix: '0_2',
      children: [b.breaker.id, ...Array(23).fill(null)],
    });

    // Valid dual-feed wiring, idempotent insert, and circuit collision errors.
    const powerA = must(
      await power.create({
        sourceAccessPortId: a.sourcePortA,
        targetAccessPortId: a.targetPortA,
        feed: 'A',
      }),
    );
    const powerB = must(
      await power.create({
        sourceAccessPortId: a.sourcePortB,
        targetAccessPortId: a.targetPortB,
        feed: 'B',
      }),
    );
    expect(powerA.id).not.toBe(powerB.id);
    expect(
      must(
        await power.create({
          sourceAccessPortId: a.sourcePortA,
          targetAccessPortId: a.targetPortA,
          feed: 'A',
        }),
      ).id,
    ).toBe(powerA.id);
    expect(
      await power.create({
        sourceAccessPortId: a.sourcePortA,
        targetAccessPortId: a.targetPortB,
        feed: 'A',
      }),
    ).toEqual({ ok: false, error: 'FEED_MISMATCH' });
    expect(
      await power.create({
        sourceAccessPortId: a.sourcePortB,
        targetAccessPortId: a.targetPortA,
        feed: 'B',
      }),
    ).toEqual({ ok: false, error: 'FEED_MISMATCH' });
    must(
      await power.create({
        sourceAccessPortId: b.sourcePortA,
        targetAccessPortId: b.targetPortA,
        feed: 'A',
      }),
    );
    expect(
      await power.create({
        sourceAccessPortId: a.sourcePortA,
        targetAccessPortId: b.targetPortA,
        feed: 'A',
      }),
    ).toEqual({ ok: false, error: 'TARGET_ALREADY_CONNECTED' });
    expect((await power.listActive()).length).toBe(3);

    // Two unique MQTT sources are commissioned to distinct panel/point/Equipment IDs.
    const bindings = new MemoryTelemetryBindingRepository([
      binding('lima-source', 'LAB-SN-LIMA', a.panel.id, 'SOURCE'),
      binding('quito-source', 'LAB-SN-QUITO', b.panel.id, 'SOURCE'),
      ...metrics.map((m) => binding('lima-' + m, 'LAB-SN-LIMA', a.breaker.id, m, '0_1_1')),
      ...metrics.map((m) => binding('quito-' + m, 'LAB-SN-QUITO', b.breaker.id, m, '0_2_1')),
    ]);
    const hub = new TelemetryHub(20);
    const telemetry = new TelemetryService(
      repository,
      hub,
      { topicPrefix: 'data/dev/', maxPayloadBytes: 8192 },
      {},
      bindings,
    );

    async function publish(sn: string, prefix: string, voltage: number) {
      return telemetry.ingest(
        'data/dev/' + sn,
        new TextEncoder().encode(
          JSON.stringify({
            sn,
            method: 'update',
            timestamp: Date.parse(timestamp) / 1000,
            reported: {
              [prefix + '_1']: {
                state: 'ONLINE',
                U1: voltage,
                I1: 2,
                P1: voltage * 2,
                EP1: 0.3,
              },
            },
          }),
        ),
        timestamp,
      );
    }

    expect((await publish('LAB-SN-LIMA', '0_1', 13.7)).ok).toBe(true);
    expect((await publish('LAB-SN-QUITO', '0_2', 48.2)).ok).toBe(true);
    expect(telemetry.latest(a.breaker.id)?.reported).toMatchObject({
      voltageV: { value: 13.7, unit: 'V' },
      currentA: { value: 2, unit: 'A' },
    });
    expect(telemetry.latest(b.breaker.id)?.reported).toMatchObject({
      voltageV: { value: 48.2, unit: 'V' },
      powerW: { value: 96.4, unit: 'W' },
    });
    expect(telemetry.latest(a.breaker.id)?.sourceIdentity).toBe('LAB-SN-LIMA');
    expect(telemetry.latest(b.breaker.id)?.sourceIdentity).toBe('LAB-SN-QUITO');

    const spoof = await publish('LAB-SN-LIMA', '0_2', 999);
    expect(spoof.ok).toBe(true);
    expect(telemetry.latest(a.breaker.id)?.reported.voltageV).toMatchObject({ value: 13.7 });
    const mismatched = await telemetry.ingest(
      'data/dev/LAB-SN-LIMA',
      new TextEncoder().encode(
        JSON.stringify({
          method: 'update',
          sn: 'LAB-SN-QUITO',
          timestamp: Date.parse(timestamp) / 1000,
          reported: {},
        }),
      ),
      timestamp,
    );
    expect(mismatched).toEqual({ ok: false, error: 'SOURCE_IDENTITY_MISMATCH' });

    const snapshot = await new WorkspaceService(repository, powerRepository).getSnapshot();
    expect(snapshot.navigation).toHaveLength(1);
    expect(snapshot.activePowerPaths).toBe(3);
    expect(await topology.getById(b.panel.id)).toMatchObject({ telemetryPointPrefix: '0_2' });
  });
});
