import { describe, expect, it } from 'vitest';

import {
  parseQdfTotalCurrentLogicalPoint,
  projectQdfTotalCurrentSignals,
} from '@/modules/telemetry/application/qdf-modbus-projection';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const at = '2026-11-01T05:00:00.000Z';

function sample(portId: string, currentA: number, oid: string): TelemetrySample {
  return {
    bindingId: `snmp:${portId}`,
    targetId: portId,
    targetType: 'ACCESS_PORT',
    entityId: portId,
    entityKind: 'ACCESS_PORT',
    sourceIdentity: 'ELTEK-01',
    reported: {
      currentA: { value: currentA, unit: 'A', oid, observedAt: at },
    },
    receivedAt: at,
    sourceObservedAt: at,
    protocol: 'SNMP',
  };
}

function fixture(latest: readonly TelemetrySample[]) {
  const device: DeviceNode = {
    id: 'qdf-2',
    name: 'QDF-2',
    kind: 'DEVICE',
    parentId: 'rack-1',
    deviceType: 'BDFB',
    rootEquipmentIds: ['chassis'],
    pinned: false,
    lifecycle: 'ACTIVE',
    attributes: { bdfbHardwareProfile: 'ELTEK_BDCBB_CONFIG_2' },
    createdAt: at,
    updatedAt: at,
  };
  const equipment: EquipmentNode = {
    id: 'chassis',
    name: 'Chassis',
    kind: 'EQUIPMENT',
    parentId: 'qdf-2',
    parentEquipmentId: null,
    deviceId: 'qdf-2',
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    accessPorts: ['A', 'B'].map((side) => ({
      id: `feed-${side}`,
      deviceId: 'qdf-2',
      equipmentId: 'chassis',
      name: `Feed ${side}`,
      portType: 'POWER' as const,
      direction: 'INPUT' as const,
      exposure: 'EXTERNAL' as const,
      lifecycle: 'ACTIVE' as const,
      attributes: {
        feed: side,
        snmpFeedInput: true,
        independentInputConfirmed: true,
        servedPanelIds: side === 'A' ? ['panel-A1', 'panel-A2'] : ['panel-B1', 'panel-B2'],
      },
    })),
  };
  const panels: EquipmentNode[] = ['A1', 'A2', 'B1', 'B2'].map((name) => ({
    id: `panel-${name}`,
    name,
    kind: 'EQUIPMENT',
    parentId: 'qdf-2',
    parentEquipmentId: null,
    deviceId: 'qdf-2',
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    accessPorts: [],
  }));
  const oidA = '1.3.6.1.4.1.12148.10.10.18.4.1.6.1.1';
  const oidB = '1.3.6.1.4.1.12148.10.10.18.4.1.6.2.1';
  const binding = (id: string, oid: string, targetId: string): TelemetryBinding => ({
    id,
    protocol: 'SNMP',
    sourceIdentity: 'ELTEK-01',
    sourcePointId: oid,
    metric: 'CURRENT',
    unit: 'A',
    targetType: 'ACCESS_PORT',
    targetId,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
  });
  return {
    topology: new MemoryTopologyRepository([device, equipment, ...panels]),
    bindings: new MemoryTelemetryBindingRepository([
      binding('current-A', oidA, 'feed-A'),
      binding('current-B', oidB, 'feed-B'),
    ]),
    history: {
      async queryLatestEntities() {
        return latest;
      },
    },
    oidA,
    oidB,
  };
}

describe('QDF total current Modbus projection', () => {
  it('parses only the explicit QDF TOTAL_CURRENT logical point', () => {
    expect(parseQdfTotalCurrentLogicalPoint('QDF/qdf-2/TOTAL_CURRENT')).toEqual({
      deviceId: 'qdf-2',
    });
    expect(parseQdfTotalCurrentLogicalPoint('QDF/qdf-2/TOTAL_POWER')).toBeNull();
  });

  it('projects the complete verified total as a VALID A measurement', async () => {
    const base = fixture([]);
    const f = fixture([sample('feed-A', 220, base.oidA), sample('feed-B', 210, base.oidB)]);
    const [signal] = await projectQdfTotalCurrentSignals(
      [{ signalId: 'a'.repeat(64), logicalPointId: 'QDF/qdf-2/TOTAL_CURRENT' }],
      f.topology,
      f.bindings,
      f.history,
      new Date(at),
    );
    expect(signal).toMatchObject({
      id: 'a'.repeat(64),
      targetId: 'qdf-2',
      value: 430,
      unit: 'A',
      quality: 'VALID',
      kind: 'measurement',
    });
  });

  it('publishes unavailable quality and no fabricated zero when coverage is incomplete', async () => {
    const base = fixture([]);
    const f = fixture([sample('feed-A', 220, base.oidA)]);
    const [signal] = await projectQdfTotalCurrentSignals(
      [{ signalId: 'b'.repeat(64), logicalPointId: 'QDF/qdf-2/TOTAL_CURRENT' }],
      f.topology,
      f.bindings,
      f.history,
      new Date(at),
    );
    expect(signal?.value).toBeNull();
    expect(signal?.quality).not.toBe('VALID');
  });
});
