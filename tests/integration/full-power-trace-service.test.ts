import { describe, expect, it } from 'vitest';

import { FullPowerTraceService } from '@/modules/power/application/full-power-trace-service';
import { PowerService } from '@/modules/power/application/power-service';
import { MemoryPowerRepository } from '@/modules/power/infrastructure/memory-power-repository';
import type { TelemetrySample } from '@/modules/telemetry/domain/entities';
import type {
  ContainerRackNode,
  DeviceNode,
  EquipmentNode,
} from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const timestamp = '2026-10-01T18:00:00.000Z';

function bdfb(id: string, breakerId: string, rawPointId: string): DeviceNode {
  return {
    id,
    kind: 'DEVICE',
    parentId: 'rack-power',
    name: id.toUpperCase(),
    lifecycle: 'ACTIVE',
    pinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    bdfb: {
      shelves: [
        {
          id: `${id}-shelf`,
          label: 'Shelf',
          frames: [
            {
              id: `${id}-frame`,
              label: 'Frame',
              panels: [
                {
                  id: `${id}-panel`,
                  label: 'Panel',
                  endpoints: [
                    {
                      id: breakerId,
                      variant: 'BREAKER',
                      label: breakerId.toUpperCase(),
                      telemetry: { rawPointId },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

function source(id: string, breakerId: string) {
  return {
    entityId: id,
    internal: {
      shelfId: `${id}-shelf`,
      frameId: `${id}-frame`,
      panelId: `${id}-panel`,
      breakerHolderId: breakerId,
    },
  };
}

describe('FullPowerTraceService', () => {
  it('resolves independent A/B feeds across different BDFBs to recursively nested Equipment ports', async () => {
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
    const root: DeviceNode = {
      id: 'device-root',
      kind: 'DEVICE',
      parentId: rack.id,
      name: 'Compute Chassis',
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const computeModule: EquipmentNode = {
      id: 'equipment-module',
      kind: 'EQUIPMENT',
      parentId: root.id,
      name: 'Compute Module',
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const controller: EquipmentNode = {
      id: 'equipment-controller',
      kind: 'EQUIPMENT',
      parentId: computeModule.id,
      name: 'Power Controller',
      lifecycle: 'ACTIVE',
      pinned: false,
      accessPorts: [
        { id: 'power-a', label: 'Power A', kind: 'POWER', feed: 'A' },
        { id: 'power-b', label: 'Power B', kind: 'POWER', feed: 'B' },
      ],
      powerRequirement: { redundancy: 'A_B_REQUIRED', requiredFeeds: ['A', 'B'] },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const bdfbA = bdfb('bdfb-a', 'breaker-a', '0_1_8');
    const bdfbB = bdfb('bdfb-b', 'breaker-b', '0_3_11');

    const topology = new MemoryTopologyRepository([
      rack,
      root,
      computeModule,
      controller,
      bdfbA,
      bdfbB,
    ]);
    const power = new MemoryPowerRepository();
    const service = new PowerService(topology, power);

    const feedA = await service.create({
      source: source(bdfbA.id, 'breaker-a'),
      target: { entityId: controller.id, internal: { accessPortId: 'power-a' } },
      feed: 'A',
      label: 'Primary feed',
    });
    const feedB = await service.create({
      source: source(bdfbB.id, 'breaker-b'),
      target: { entityId: controller.id, internal: { accessPortId: 'power-b' } },
      feed: 'B',
      label: 'Secondary feed',
    });

    expect(feedA.ok).toBe(true);
    expect(feedB.ok).toBe(true);

    const samples = new Map<string, TelemetrySample>([
      [
        bdfbA.id,
        {
          entityId: bdfbA.id,
          entityKind: 'DEVICE',
          sourceIdentity: 'EMU-BFDB-01',
          reported: {},
          receivedAt: timestamp,
          breakerReadings: [
            {
              deviceId: bdfbA.id,
              sourceIdentity: 'EMU-BFDB-01',
              shelfId: 'bdfb-a-shelf',
              frameId: 'bdfb-a-frame',
              panelId: 'bdfb-a-panel',
              panelLabel: 'Panel',
              breakerId: 'breaker-a',
              breakerLabel: 'BREAKER-A',
              rawPointId: '0_1_8',
              position: 8,
              metrics: {
                voltageV: { value: 12.2, observedAt: timestamp },
                currentA: { value: 8.1, observedAt: timestamp },
              },
              receivedAt: timestamp,
            },
          ],
        },
      ],
      [
        bdfbB.id,
        {
          entityId: bdfbB.id,
          entityKind: 'DEVICE',
          sourceIdentity: 'EMU-BFDB-02',
          reported: {},
          receivedAt: timestamp,
          breakerReadings: [
            {
              deviceId: bdfbB.id,
              sourceIdentity: 'EMU-BFDB-02',
              shelfId: 'bdfb-b-shelf',
              frameId: 'bdfb-b-frame',
              panelId: 'bdfb-b-panel',
              panelLabel: 'Panel',
              breakerId: 'breaker-b',
              breakerLabel: 'BREAKER-B',
              rawPointId: '0_3_11',
              position: 11,
              metrics: {
                voltageV: { value: 12.3, observedAt: timestamp },
                currentA: { value: 7.9, observedAt: timestamp },
              },
              receivedAt: timestamp,
            },
          ],
        },
      ],
    ]);

    const trace = await new FullPowerTraceService(topology, power, {
      latest: (entityId) => samples.get(entityId) ?? null,
    }).resolve(root.id);

    expect(trace).not.toBeNull();
    expect(trace?.feedA).toHaveLength(1);
    expect(trace?.feedB).toHaveLength(1);
    expect(trace?.feedA[0]?.source.entityId).toBe(bdfbA.id);
    expect(trace?.feedB[0]?.source.entityId).toBe(bdfbB.id);
    expect(trace?.feedA[0]?.target.hierarchy).toEqual([
      'RACK-LOAD',
      'Compute Chassis',
      'Compute Module',
      'Power Controller',
    ]);
    expect(trace?.feedA[0]?.target.accessPort?.id).toBe('power-a');
    expect(trace?.feedB[0]?.target.accessPort?.id).toBe('power-b');
    expect(trace?.feedA[0]?.telemetry).toMatchObject({
      status: 'LIVE',
      rawPointId: '0_1_8',
      sourceIdentity: 'EMU-BFDB-01',
      voltageV: 12.2,
    });
    expect(trace?.policies.find((policy) => policy.entityId === controller.id)).toMatchObject({
      policy: 'A_B_REQUIRED',
      status: 'SATISFIED',
      feedsPresent: ['A', 'B'],
    });
  });

  it('preserves legacy entity-only targets but marks them as ambiguous instead of inventing a port', async () => {
    const load: DeviceNode = {
      id: 'legacy-load',
      kind: 'DEVICE',
      parentId: 'rack-load',
      name: 'Legacy Load',
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const sourceDevice = bdfb('legacy-bdfb', 'legacy-breaker', '0_1_1');
    const topology = new MemoryTopologyRepository([load, sourceDevice]);
    const power = new MemoryPowerRepository([
      {
        id: 'legacy-path',
        sourceEntityId: sourceDevice.id,
        targetEntityId: load.id,
        source: source(sourceDevice.id, 'legacy-breaker'),
        target: { entityId: load.id },
        feed: 'A',
        lifecycle: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);

    const trace = await new FullPowerTraceService(topology, power).resolve(load.id);
    expect(trace?.feedA[0]?.topologyStatus).toBe('LEGACY_TARGET_WITHOUT_PORT');
    expect(trace?.feedA[0]?.target.accessPort).toBeUndefined();
  });
});
