import { describe, expect, it } from 'vitest';
import {
  assessConfig2Inventory,
  ELTEK_BDCBB_CONFIG_2,
} from '@/modules/power/domain/bdfb-hardware-profile';
import {
  SnmpFeedService,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';

const timestamp = '2026-10-21T12:00:00.000Z';
function fixture(feedCount: number) {
  const id = 'config2-bdfb';
  const device: DeviceNode = {
    id,
    kind: 'DEVICE',
    parentId: 'rack',
    name: 'Config2',
    deviceType: 'BDFB',
    rootEquipmentIds: ['chassis'],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
    attributes: { bdfbHardwareProfile: ELTEK_BDCBB_CONFIG_2 },
  };
  const slots = ['A1', 'A2', 'B1', 'B2'];
  const panels: EquipmentNode[] = slots.map((slot) => ({
    id: 'panel-' + slot,
    kind: 'EQUIPMENT',
    parentId: 'chassis',
    parentEquipmentId: 'chassis',
    deviceId: id,
    name: 'Panel ' + slot,
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    children: [],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const sides = ['A', 'B'].slice(0, feedCount);
  const chassis: EquipmentNode = {
    id: 'chassis',
    kind: 'EQUIPMENT',
    parentId: id,
    parentEquipmentId: null,
    deviceId: id,
    name: 'Chassis',
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
    children: panels.map((p) => p.id),
    accessPorts: sides.map((side) => ({
      id: 'feed-' + side,
      deviceId: id,
      equipmentId: 'chassis',
      name: 'Shunt ' + side,
      portType: 'POWER' as const,
      direction: 'INPUT' as const,
      exposure: 'EXTERNAL' as const,
      lifecycle: 'ACTIVE' as const,
      attributes: {
        feed: side,
        snmpFeedInput: true,
        independentInputConfirmed: true,
        ratedCurrentA: 800,
        servedPanelIds: ['panel-' + side + '1', 'panel-' + side + '2'],
      },
    })),
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const oid = (i: number) => `1.3.6.1.4.1.8072.9999.2026.48.1.${i + 1}.0`;
  const bindings: TelemetryBinding[] = sides.map((side, i) => ({
    id: 'binding-' + side,
    protocol: 'SNMP',
    sourceIdentity: 'EMU-CONFIG2',
    sourcePointId: oid(i),
    metric: 'CURRENT',
    unit: 'A',
    targetType: 'ACCESS_PORT',
    targetId: 'feed-' + side,
    lifecycle: 'ACTIVE',
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  return {
    device,
    chassis,
    panels,
    oid,
    topology: new MemoryTopologyRepository([device, chassis, ...panels]),
    bindings: new MemoryTelemetryBindingRepository(bindings),
    hub: new TelemetryHub(10),
  };
}

describe('ELTEK_BDCBB_CONFIG_2 linked panels / independent A-B shunts', () => {
  it('requires two distinct shunts covering all four panels, not four separate shunts', () => {
    const f = fixture(2);
    expect(assessConfig2Inventory([f.chassis, ...f.panels])).toMatchObject({
      expectedFeedCount: 2,
      inventoriedFeedCount: 2,
      inventoryComplete: true,
      missingFeedPositions: [],
    });
  });

  it('preserves PARTIAL when B shunt is not inventoried', async () => {
    const f = fixture(1);
    expect(assessConfig2Inventory([f.chassis, ...f.panels]).missingFeedPositions).toEqual(['B']);
    const view = await summarizeSnmpBdfbLoad(
      f.device.id,
      f.topology,
      f.bindings,
      f.hub,
      Date.parse(timestamp),
    );
    expect(view).toMatchObject({
      expectedFeedCount: 2,
      inventoryStatus: 'INCOMPLETE',
      feedCount: 1,
      status: 'PARTIAL',
      totalCurrentA: null,
    });
  });

  it('totals exactly two currents, never four linked panel readings', async () => {
    const f = fixture(2);
    const accepted = await new SnmpFeedService(f.topology, f.bindings, f.hub).ingest(
      {
        schemaVersion: 1,
        sourceIdentity: 'EMU-CONFIG2',
        observedAt: timestamp,
        measurements: [220, 210].map((value, i) => ({
          oid: f.oid(i),
          metric: 'CURRENT' as const,
          unit: 'A' as const,
          value,
        })),
      },
      timestamp,
    );
    expect(accepted.ok).toBe(true);
    const view = await summarizeSnmpBdfbLoad(
      f.device.id,
      f.topology,
      f.bindings,
      f.hub,
      Date.parse(timestamp),
    );
    expect(view).toMatchObject({
      hardwareProfile: ELTEK_BDCBB_CONFIG_2,
      inventoryStatus: 'COMPLETE',
      expectedFeedCount: 2,
      feedCount: 2,
      freshFeedCount: 2,
      totalCurrentA: 430,
      totalRatedCurrentA: 1600,
      status: 'COMPLETE',
    });
  });

  it('rejects shunt reuse of the same physical panels', () => {
    const f = fixture(2);
    const left = f.chassis.accessPorts[0]!;
    const right = f.chassis.accessPorts[1]!;
    const mutated = {
      ...f.chassis,
      accessPorts: [
        left,
        { ...right, attributes: { ...right.attributes, servedPanelIds: ['panel-A1', 'panel-B2'] } },
      ],
    };
    expect(assessConfig2Inventory([mutated, ...f.panels]).issues).toContain(
      'DUPLICATE_PANEL_MAPPING',
    );
  });
});
