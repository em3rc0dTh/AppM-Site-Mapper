import { describe, expect, it } from 'vitest';
import {
  assessConfig4Inventory, bdfbHardwareProfile, ELTEK_BDCBB_CONFIG_4,
} from '@/modules/power/domain/bdfb-hardware-profile';
import { SnmpFeedService, summarizeSnmpBdfbLoad } from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import type { TelemetryBinding } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const time = '2026-10-21T12:00:00.000Z';
const slots = ['A1', 'A2', 'B1', 'B2'] as const;
function fixture(count = 4, profile = true) {
  const device: DeviceNode = {
    id: 'bdfb-c4', kind: 'DEVICE', parentId: 'rack', name: 'BDCBB',
    deviceType: 'BDFB', rootEquipmentIds: ['chassis'], pinned: false,
    ...(profile ? { attributes: { bdfbHardwareProfile: ELTEK_BDCBB_CONFIG_4 } } : {}),
    lifecycle: 'ACTIVE', createdAt: time, updatedAt: time,
  };
  const panels: EquipmentNode[] = slots.map((slot) => ({
    id: 'panel-' + slot, kind: 'EQUIPMENT', parentId: 'chassis',
    parentEquipmentId: 'chassis', deviceId: device.id, name: 'Panel ' + slot,
    equipmentType: 'PANEL', childMode: 'POSITIONAL', children: [],
    accessPorts: [], pinned: false, lifecycle: 'ACTIVE',
    createdAt: time, updatedAt: time,
  }));
  const chassis: EquipmentNode = {
    id: 'chassis', kind: 'EQUIPMENT', parentId: device.id, parentEquipmentId: null,
    deviceId: device.id, name: 'DC cabinet', equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC', children: panels.map((x) => x.id), accessPorts:
      slots.slice(0, count).map((slot) => ({
        id: 'feed-' + slot, equipmentId: 'chassis', deviceId: device.id,
        name: 'Input ' + slot, portType: 'POWER' as const, direction: 'INPUT' as const,
        exposure: 'EXTERNAL' as const, lifecycle: 'ACTIVE' as const,
        attributes: { snmpFeedInput: true, feedPosition: slot, feed: slot[0],
          servedPanelIds: ['panel-' + slot], ratedCurrentA: 800,
          shuntRatedCurrentA: 1000, shuntRatedMillivolts: 60,
          independentInputConfirmed: true },
      })),
    pinned: false, lifecycle: 'ACTIVE', createdAt: time, updatedAt: time,
  };
  const oid = (i: number) => `1.3.6.1.4.1.8072.9999.2026.48.1.${i + 1}.0`;
  const bindings: TelemetryBinding[] = slots.slice(0, count).map((slot, i) => ({
    id: 'binding-' + slot, protocol: 'SNMP', sourceIdentity: 'EMU-CONFIG4',
    sourcePointId: oid(i), metric: 'CURRENT', unit: 'A',
    targetType: 'ACCESS_PORT', targetId: 'feed-' + slot,
    lifecycle: 'ACTIVE', createdAt: time, updatedAt: time,
  }));
  const topology = new MemoryTopologyRepository([device, chassis, ...panels]);
  const repository = new MemoryTelemetryBindingRepository(bindings);
  const hub = new TelemetryHub(10);
  return { device, chassis, panels, topology, repository, hub, oid };
}

describe('ELTEK_BDCBB_CONFIG_4 manufacturer profile (non-breaking)', () => {
  it('preserves generic BDFB behavior unless profile explicitly selected', () => {
    const f = fixture(2, false);
    expect(bdfbHardwareProfile(f.device)).toBeNull();
    expect(assessConfig4Inventory([f.chassis, ...f.panels]).inventoryComplete).toBe(false);
  });

  it('requires exactly four different input-shunt-panel mappings before COMPLETE', async () => {
    const f = fixture(2);
    expect(assessConfig4Inventory([f.chassis, ...f.panels])).toMatchObject({
      hardwareProfile: ELTEK_BDCBB_CONFIG_4,
      expectedFeedCount: 4,
      missingFeedPositions: ['B1', 'B2'],
      inventoryComplete: false,
    });
    const service = new SnmpFeedService(f.topology, f.repository, f.hub);
    const accepted = await service.ingest({
      schemaVersion: 1, sourceIdentity: 'EMU-CONFIG4', observedAt: time,
      measurements: [220, 210].map((value, i) => ({
        oid: f.oid(i), metric: 'CURRENT' as const, unit: 'A' as const, value,
      })),
    }, time);
    expect(accepted.ok).toBe(true);
    const view = await summarizeSnmpBdfbLoad('bdfb-c4', f.topology, f.repository,
      f.hub, Date.parse(time));
    expect(view).toMatchObject({
      hardwareProfile: ELTEK_BDCBB_CONFIG_4,
      inventoryStatus: 'INCOMPLETE', expectedFeedCount: 4,
      feedCount: 2, freshFeedCount: 2, status: 'PARTIAL',
      measuredCurrentA: 430, totalCurrentA: null, totalRatedCurrentA: null,
    });
  });

  it('adds four independently metered inputs and flags calculated 640 A overload', async () => {
    const f = fixture();
    expect(assessConfig4Inventory([f.chassis, ...f.panels]).inventoryComplete).toBe(true);
    const values = [650, 210, 190, 180];
    const service = new SnmpFeedService(f.topology, f.repository, f.hub);
    expect((await service.ingest({
      schemaVersion: 1, sourceIdentity: 'EMU-CONFIG4', observedAt: time,
      measurements: values.map((value, i) => ({
        oid: f.oid(i), metric: 'CURRENT' as const, unit: 'A' as const, value,
      })),
    }, time)).ok).toBe(true);
    const view = await summarizeSnmpBdfbLoad('bdfb-c4', f.topology, f.repository,
      f.hub, Date.parse(time));
    expect(view).toMatchObject({
      status: 'COMPLETE', inventoryStatus: 'COMPLETE', expectedFeedCount: 4,
      feedCount: 4, freshFeedCount: 4, totalCurrentA: 1230, totalRatedCurrentA: 3200,
    });
    expect(view?.feeds.find((f) => f.feedPosition === 'A1'))
      .toMatchObject({ overloadThresholdA: 640, overloadWarning: true });
    expect(view?.feeds.find((f) => f.feedPosition === 'B2')?.overloadWarning).toBe(false);
    expect(view?.totalEstimatedPowerW).toBeNull(); // Voltages not commissioned.
  });

  it('refuses duplicate panel, duplicate slot, incorrect shunt, and unverified feed', () => {
    const f = fixture();
    const original = f.chassis.accessPorts;
    const altered = [
      { ...original[0]!, attributes: { ...original[0]!.attributes,
        shuntRatedMillivolts: 75, independentInputConfirmed: false } },
      { ...original[1]!, attributes: { ...original[1]!.attributes,
        servedPanelIds: ['panel-A1'] } },
      { ...original[2]!, attributes: { ...original[2]!.attributes,
        feedPosition: 'A1' } },
      original[3]!,
    ];
    const assessment = assessConfig4Inventory([
      { ...f.chassis, accessPorts: altered }, ...f.panels,
    ]);
    expect(assessment.inventoryComplete).toBe(false);
    expect(assessment.issues).toContain('DUPLICATE_INPUT_A1');
    expect(assessment.issues).toContain('DUPLICATE_PANEL_MAPPING_A2');
    expect(assessment.missingFeedPositions).toContain('B1');
  });

  it('rejects a missing panel even if the four shunts report CURRENT', () => {
    const f = fixture();
    const result = assessConfig4Inventory([f.chassis, ...f.panels.slice(1)]);
    expect(result.inventoryComplete).toBe(false);
    expect(result.issues).toContain('PANEL_MAPPING_INCOMPLETE_A1');
  });
});
