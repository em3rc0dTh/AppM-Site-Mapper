import { describe, expect, it } from 'vitest';

import type { AlarmRepository } from '@/modules/alarm/application/alarm-repository';
import {
  parseQdfClientV13LogicalPoint,
  projectQdfClientV13Signals,
} from '@/modules/telemetry/application/qdf-client-modbus-v13';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const at = '2026-11-24T14:25:00.000Z';

function fixture() {
  const device: DeviceNode = {
    id: 'internal-device-qdf5',
    name: 'BDFB QDF-5',
    kind: 'DEVICE',
    parentId: 'rack-1',
    deviceType: 'BDFB',
    rootEquipmentIds: ['chassis'],
    pinned: false,
    lifecycle: 'ACTIVE',
    attributes: { bdfbHardwareProfile: 'ELTEK_BDCBB_CONFIG_2', qdfVoltageToleranceV: 1 },
    createdAt: at,
    updatedAt: at,
  };
  const equipment: EquipmentNode = {
    id: 'chassis',
    name: 'Chassis',
    kind: 'EQUIPMENT',
    parentId: 'internal-device-qdf5',
    parentEquipmentId: null,
    deviceId: 'internal-device-qdf5',
    equipmentType: 'CHASSIS',
    childMode: 'DYNAMIC',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    accessPorts: [
      {
        id: 'feed-A',
        deviceId: 'internal-device-qdf5',
        equipmentId: 'chassis',
        name: 'Input A',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
        attributes: {
          feed: 'A',
          snmpFeedInput: true,
          independentInputConfirmed: true,
          ratedCurrentA: 400,
          servedPanelIds: ['panel-A3', 'panel-A2'],
        },
      },
      {
        id: 'feed-B',
        deviceId: 'internal-device-qdf5',
        equipmentId: 'chassis',
        name: 'Input B',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        lifecycle: 'ACTIVE',
        attributes: {
          feed: 'B',
          snmpFeedInput: true,
          independentInputConfirmed: true,
          ratedCurrentA: 400,
          servedPanelIds: ['panel-B3', 'panel-B2'],
        },
      },
    ],
  };
  const panels: EquipmentNode[] = ['A3', 'A2', 'B3', 'B2'].map((side) => ({
    id: `panel-${side}`,
    name: `Panel ${side}`,
    kind: 'EQUIPMENT',
    parentId: 'internal-device-qdf5',
    parentEquipmentId: null,
    deviceId: 'internal-device-qdf5',
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    children: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    accessPorts: [],
  }));
  const bindings: TelemetryBinding[] = [
    ['current-A', 'feed-A', '1.3.6.1.4.1.12148.10.1.1.3.1', 'CURRENT', 'A'],
    ['voltage-A', 'feed-A', '1.3.6.1.4.1.12148.10.1.1.4.1', 'VOLTAGE', 'V'],
    ['current-B', 'feed-B', '1.3.6.1.4.1.12148.10.1.1.3.2', 'CURRENT', 'A'],
    ['voltage-B', 'feed-B', '1.3.6.1.4.1.12148.10.1.1.4.2', 'VOLTAGE', 'V'],
  ].map(([id, targetId, oid, metric, unit]) => ({
    id: id as string,
    protocol: 'SNMP',
    sourceIdentity: 'ELTEK-SMARTPACK2-LURIN-REAL',
    sourcePointId: oid as string,
    metric: metric as 'CURRENT' | 'VOLTAGE',
    unit: unit as 'A' | 'V',
    targetType: 'ACCESS_PORT',
    targetId: targetId as string,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
  }));
  const sample = (
    targetId: string,
    currentA: number,
    voltageV: number,
    currentOid: string,
    voltageOid: string,
  ): TelemetrySample => ({
    bindingId: `snmp:${targetId}`,
    targetId,
    targetType: 'ACCESS_PORT',
    entityId: targetId,
    entityKind: 'ACCESS_PORT',
    sourceIdentity: 'ELTEK-SMARTPACK2-LURIN-REAL',
    reported: {
      currentA: { value: currentA, unit: 'A', oid: currentOid, observedAt: at },
      voltageV: { value: voltageV, unit: 'V', oid: voltageOid, observedAt: at },
    },
    receivedAt: at,
    sourceObservedAt: at,
    protocol: 'SNMP',
  });
  const samples = [
    sample('feed-A', 15.1, -53.5, bindings[0]!.sourcePointId!, bindings[1]!.sourcePointId!),
    sample('feed-B', 14.93, -53.7, bindings[2]!.sourcePointId!, bindings[3]!.sourcePointId!),
  ];
  return {
    topology: new MemoryTopologyRepository([device, equipment, ...panels]),
    bindings: new MemoryTelemetryBindingRepository(bindings),
    history: {
      async queryLatestEntities() {
        return samples;
      },
    },
    alarms: {
      async listActive() {
        return [];
      },
    } as unknown as AlarmRepository,
  };
}

describe('Modbus TCP v1.3 QDF/ELTEK projection', () => {
  it('parses all v1.3 extension logical points without claiming the frozen base totals', () => {
    expect(parseQdfClientV13LogicalPoint('QDF/QDF-5/INPUT_A_CURRENT')).toEqual({
      qdf: 'QDF-5',
      point: 'INPUT_A_CURRENT',
    });
    expect(parseQdfClientV13LogicalPoint('QDF/QDF-5/COMMUNICATION_STATUS')).toEqual({
      qdf: 'QDF-5',
      point: 'COMMUNICATION_STATUS',
    });
    expect(parseQdfClientV13LogicalPoint('QDF/QDF-5/MODBUS_V13_TOTAL_CURRENT')).toEqual({
      qdf: 'QDF-5',
      point: 'MODBUS_V13_TOTAL_CURRENT',
    });
    expect(parseQdfClientV13LogicalPoint('QDF/QDF-5/TOTAL_CURRENT')).toBeNull();
  });

  it('publishes Config2 A/B rated, V/I/P and controller status with client units', async () => {
    const f = fixture();
    const names = [
      'INPUT_A_RATED_CURRENT',
      'INPUT_A_VOLTAGE',
      'INPUT_A_CURRENT',
      'INPUT_A_POWER',
      'INPUT_B_RATED_CURRENT',
      'INPUT_B_VOLTAGE',
      'INPUT_B_CURRENT',
      'INPUT_B_POWER',
      'MODBUS_V13_TOTAL_CURRENT',
      'MODBUS_V13_BUS_A_VOLTAGE',
      'MODBUS_V13_BUS_B_VOLTAGE',
      'MODBUS_V13_TOTAL_VOLTAGE',
      'MODBUS_V13_TOTAL_POWER',
      'COMMUNICATION_STATUS',
      'CONTROLLER_ALARM_STATE',
      'ALARM_SEVERITY',
    ] as const;
    const signals = await projectQdfClientV13Signals(
      names.map((name, index) => ({
        signalId: String(index + 1).padStart(64, '0'),
        logicalPointId: `QDF/QDF-5/${name}`,
      })),
      f.topology,
      f.bindings,
      f.history,
      f.alarms,
      new Date(at),
    );
    const byPoint = new Map(signals.map((signal) => [signal.logicalPointId, signal]));
    expect(signals.every((signal) => signal.targetId === 'internal-device-qdf5')).toBe(true);
    expect(byPoint.get('QDF/QDF-5/INPUT_A_RATED_CURRENT')).toMatchObject({
      value: 400,
      unit: 'A',
      quality: 'VALID',
    });
    expect(byPoint.get('QDF/QDF-5/INPUT_A_VOLTAGE')).toMatchObject({
      value: -53.5,
      unit: 'V',
      quality: 'VALID',
    });
    expect(byPoint.get('QDF/QDF-5/INPUT_A_CURRENT')).toMatchObject({
      value: 15.1,
      unit: 'A',
      quality: 'VALID',
    });
    expect(byPoint.get('QDF/QDF-5/INPUT_A_POWER')?.value).toBeCloseTo(0.80785, 6);
    expect(byPoint.get('QDF/QDF-5/INPUT_B_POWER')?.value).toBeCloseTo(0.801741, 6);
    expect(byPoint.get('QDF/QDF-5/MODBUS_V13_TOTAL_CURRENT')?.value).toBeCloseTo(30.03, 6);
    expect(byPoint.get('QDF/QDF-5/MODBUS_V13_BUS_A_VOLTAGE')?.value).toBeCloseTo(-53.5, 6);
    expect(byPoint.get('QDF/QDF-5/MODBUS_V13_BUS_B_VOLTAGE')?.value).toBeCloseTo(-53.7, 6);
    expect(byPoint.get('QDF/QDF-5/MODBUS_V13_TOTAL_VOLTAGE')?.value).toBeCloseTo(-53.6, 6);
    expect(byPoint.get('QDF/QDF-5/MODBUS_V13_TOTAL_POWER')?.value).toBeCloseTo(1.609591, 6);
    expect(byPoint.get('QDF/QDF-5/COMMUNICATION_STATUS')).toMatchObject({
      value: 1,
      unit: '',
      quality: 'VALID',
    });
    expect(byPoint.get('QDF/QDF-5/CONTROLLER_ALARM_STATE')?.value).toBe(0);
    expect(byPoint.get('QDF/QDF-5/ALARM_SEVERITY')?.value).toBe(0);
  });

  it('leaves TOTAL_ENERGY unobserved for the bridge to mirror from the frozen MQTT total', async () => {
    const f = fixture();
    const [signal] = await projectQdfClientV13Signals(
      [{ signalId: 'e'.repeat(64), logicalPointId: 'QDF/QDF-5/MODBUS_V13_TOTAL_ENERGY' }],
      f.topology,
      f.bindings,
      f.history,
      f.alarms,
      new Date(at),
    );
    expect(signal).toMatchObject({ value: null, unit: 'kWh', quality: 'UNOBSERVED' });
  });
});
