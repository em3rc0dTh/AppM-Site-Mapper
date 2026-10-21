import { describe, expect, it } from 'vitest';
import {
  SnmpFeedService,
  summarizeSnmpBdfbLoad,
} from '@/modules/telemetry/application/snmp-feed-service';
import { TelemetryHub } from '@/modules/telemetry/application/telemetry-hub';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';

const observed = '2026-10-21T12:00:00.000Z';
const slots = ['A1', 'A2', 'B1', 'B2'] as const;
function lab() {
  const all: (DeviceNode | EquipmentNode)[] = [];
  const bindings: TelemetryBinding[] = [];
  const identities = ['CHAOS-BFDB-01', 'CHAOS-BFDB-02', 'CHAOS-BFDB-03'];
  for (const [index, source] of identities.entries()) {
    const deviceId = 'bdfb-' + index;
    all.push({
      id: deviceId,
      kind: 'DEVICE',
      parentId: 'rack',
      name: source,
      deviceType: 'BDFB',
      rootEquipmentIds: ['chassis-' + index],
      attributes: { bdfbHardwareProfile: 'ELTEK_BDCBB_CONFIG_4' },
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: observed,
      updatedAt: observed,
    });
    const panels: EquipmentNode[] = slots.map((slot) => ({
      id: 'panel-' + index + '-' + slot,
      name: 'Panel ' + slot,
      kind: 'EQUIPMENT',
      deviceId,
      parentId: 'chassis-' + index,
      parentEquipmentId: 'chassis-' + index,
      equipmentType: 'PANEL',
      accessPorts: [],
      childMode: 'POSITIONAL',
      children: [],
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: observed,
      updatedAt: observed,
    }));
    all.push(...panels);
    all.push({
      id: 'chassis-' + index,
      name: 'Chassis',
      kind: 'EQUIPMENT',
      deviceId,
      parentId: deviceId,
      parentEquipmentId: null,
      equipmentType: 'CHASSIS',
      childMode: 'DYNAMIC',
      children: panels.map((p) => p.id),
      accessPorts: slots.map((slot) => ({
        id: 'port-' + index + '-' + slot,
        deviceId,
        equipmentId: 'chassis-' + index,
        name: 'Input ' + slot,
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
        attributes: {
          feed: slot[0],
          feedPosition: slot,
          snmpFeedInput: true,
          independentInputConfirmed: true,
          ratedCurrentA: 800,
          shuntRatedCurrentA: 1000,
          shuntRatedMillivolts: 60,
          servedPanelIds: ['panel-' + index + '-' + slot],
        },
      })),
      lifecycle: 'ACTIVE',
      pinned: false,
      createdAt: observed,
      updatedAt: observed,
    });
    for (const [slotIndex, slot] of slots.entries()) {
      bindings.push({
        id: 'binding-' + index + '-' + slot,
        protocol: 'SNMP',
        sourceIdentity: source,
        sourcePointId: oid(slotIndex),
        metric: 'CURRENT',
        unit: 'A',
        targetType: 'ACCESS_PORT',
        targetId: 'port-' + index + '-' + slot,
        lifecycle: 'ACTIVE',
        createdAt: observed,
        updatedAt: observed,
      });
    }
  }
  return {
    identities,
    topology: new MemoryTopologyRepository(all),
    bindings: new MemoryTelemetryBindingRepository(bindings),
  };
}
function oid(i: number): string {
  return '1.3.6.1.4.1.8072.9999.2026.49.1.' + (i + 1) + '.0';
}
function packet(source: string, sequence: number) {
  return {
    schemaVersion: 1 as const,
    sourceIdentity: source,
    observedAt: new Date(Date.parse(observed) + sequence * 1000).toISOString(),
    measurements: slots.map((_slot, index) => ({
      oid: oid(index),
      metric: 'CURRENT' as const,
      unit: 'A' as const,
      value: 200 + sequence + index,
    })),
  };
}

describe('Bounded SNMP Config4 chaos stress (only isolated memory fixtures)', () => {
  it('serializes 120 concurrent polls for three independent BDFBs and preserves 12 shunts', async () => {
    const f = lab();
    const latest = new Map<string, TelemetrySample>();
    let writes = 0;
    const service = new SnmpFeedService(f.topology, f.bindings, new TelemetryHub(32), {
      async write() {},
      async writeDurable(sample) {
        writes++;
        latest.set(sample.targetId, sample);
      },
      async queryLatestEntities(targets) {
        return targets.flatMap((id) => {
          const sample = latest.get(id);
          return sample ? [sample] : [];
        });
      },
    });
    const hub = (service as unknown as { hub: TelemetryHub }).hub;
    const attempts = f.identities.flatMap((source) =>
      Array.from({ length: 40 }, (_, index) => service.ingest(packet(source, index), observed)),
    );
    const results = await Promise.all(attempts);
    expect(results).toHaveLength(120);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(writes).toBe(480);
    expect(latest.size).toBe(12);
    for (const [index] of f.identities.entries()) {
      const view = await summarizeSnmpBdfbLoad(
        'bdfb-' + index,
        f.topology,
        f.bindings,
        hub,
        Date.parse(observed) + 39_000,
      );
      expect(view).toMatchObject({
        inventoryStatus: 'COMPLETE',
        expectedFeedCount: 4,
        status: 'COMPLETE',
        feedCount: 4,
        freshFeedCount: 4,
        totalCurrentA: 4 * (200 + 39) + 6,
      });
    }
    const stale = await service.ingest(packet(f.identities[0]!, 2), observed);
    expect(stale).toMatchObject({ ok: false, error: 'OUT_OF_ORDER_SNMP_SAMPLE' });
  });

  it('exposes torn durable multi-feed writes when the store fails during one poll', async () => {
    const f = lab();
    const latest = new Map<string, TelemetrySample>();
    const hub = new TelemetryHub(32);
    let requests = 0;
    const service = new SnmpFeedService(f.topology, f.bindings, hub, {
      async write() {},
      async writeDurable(sample) {
        requests++;
        if (requests === 3) throw new Error('INJECTED_TIMESCALE_FAILURE');
        latest.set(sample.targetId, sample);
      },
      async queryLatestEntities(targets) {
        return targets.flatMap((id) => {
          const sample = latest.get(id);
          return sample ? [sample] : [];
        });
      },
    });
    const first = await service.ingest(packet(f.identities[0]!, 0), observed);
    expect(first).toMatchObject({ ok: false, error: 'HISTORY_STORE_UNAVAILABLE' });
    expect(latest.size).toBe(2); // Found: partial durable writes (not atomic).
    expect(hub.snapshot()).toHaveLength(0);
    const retry = await service.ingest(packet(f.identities[0]!, 0), observed);
    expect(retry).toMatchObject({ ok: false, error: 'OUT_OF_ORDER_SNMP_SAMPLE' });
    expect(hub.snapshot()).toHaveLength(0);
  });
});
