import { describe, expect, it } from 'vitest';

import { MemoryAlarmRepository } from '@/modules/alarm/infrastructure/memory-alarm-repository';
import {
  METASYS_ELTEK_POINTS,
  parseMetasysEltekLogicalPoint,
  projectMetasysEltekSignals,
} from '@/modules/telemetry/application/metasys-eltek-modbus-projection';
import type { TelemetryBinding, TelemetrySample } from '@/modules/telemetry/domain/entities';
import { MemoryTelemetryBindingRepository } from '@/modules/telemetry/infrastructure/memory-telemetry-binding-repository';
import type { DeviceNode, EquipmentNode } from '@/modules/topology/domain/entities';
import { MemoryTopologyRepository } from '@/modules/topology/infrastructure/memory-topology-repository';

const at = '2026-11-18T15:00:00.000Z';

function sample(
  portId: string,
  currentA: number,
  voltageV: number,
  currentOid: string,
  voltageOid: string,
): TelemetrySample {
  return {
    bindingId: `snmp:${portId}`,
    targetId: portId,
    targetType: 'ACCESS_PORT',
    entityId: portId,
    entityKind: 'ACCESS_PORT',
    sourceIdentity: 'ELTEK-QDF-2',
    reported: {
      currentA: { value: currentA, unit: 'A', oid: currentOid, observedAt: at },
      voltageV: { value: voltageV, unit: 'V', oid: voltageOid, observedAt: at },
    },
    receivedAt: at,
    sourceObservedAt: at,
    protocol: 'SNMP',
  };
}

function fixture() {
  const device: DeviceNode = {
    id: 'device-qdf-2',
    name: 'BDFB QDF-2',
    kind: 'DEVICE',
    parentId: 'rack-qdf-2',
    deviceType: 'BDFB',
    rootEquipmentIds: ['chassis', 'controller'],
    pinned: false,
    lifecycle: 'ACTIVE',
    attributes: { bdfbHardwareProfile: 'ELTEK_BDCBB_CONFIG_2' },
    createdAt: at,
    updatedAt: at,
  };
  const panels: EquipmentNode[] = ['A3', 'A2', 'B3', 'B2'].map((name) => ({
    id: `panel-${name}`,
    name,
    kind: 'EQUIPMENT',
    parentId: device.id,
    parentEquipmentId: null,
    deviceId: device.id,
    equipmentType: 'PANEL',
    childMode: 'POSITIONAL',
    children: [],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
  }));
  const chassis: EquipmentNode = {
    id: 'chassis',
    name: 'QDF-2 Chassis',
    kind: 'EQUIPMENT',
    parentId: device.id,
    parentEquipmentId: null,
    deviceId: device.id,
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
        deviceId: device.id,
        equipmentId: 'chassis',
        name: 'SNMP INPUT A',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        protocol: 'SNMP',
        lifecycle: 'ACTIVE',
        attributes: {
          snmpFeedInput: true,
          feed: 'A',
          ratedCurrentA: 800,
          independentInputConfirmed: true,
          servedPanelIds: ['panel-A3', 'panel-A2'],
        },
      },
      {
        id: 'feed-B',
        deviceId: device.id,
        equipmentId: 'chassis',
        name: 'SNMP INPUT B',
        portType: 'POWER',
        direction: 'INPUT',
        exposure: 'EXTERNAL',
        protocol: 'SNMP',
        lifecycle: 'ACTIVE',
        attributes: {
          snmpFeedInput: true,
          feed: 'B',
          ratedCurrentA: 800,
          independentInputConfirmed: true,
          servedPanelIds: ['panel-B3', 'panel-B2'],
        },
      },
    ],
  };
  const controller: EquipmentNode = {
    id: 'controller',
    name: 'QDF-2_CTRL-1',
    kind: 'EQUIPMENT',
    parentId: device.id,
    parentEquipmentId: null,
    deviceId: device.id,
    equipmentType: 'CONTROLLER_BOARD',
    childMode: 'DYNAMIC',
    children: [],
    accessPorts: [],
    pinned: false,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
  };
  const currentA = '1.3.6.1.4.1.12148.1.1';
  const voltageA = '1.3.6.1.4.1.12148.2.1';
  const currentB = '1.3.6.1.4.1.12148.1.2';
  const voltageB = '1.3.6.1.4.1.12148.2.2';
  const binding = (
    id: string,
    targetId: string,
    metric: 'CURRENT' | 'VOLTAGE',
    oid: string,
    unit: 'A' | 'V',
  ): TelemetryBinding => ({
    id,
    protocol: 'SNMP',
    sourceIdentity: 'ELTEK-QDF-2',
    sourcePointId: oid,
    metric,
    unit,
    targetType: 'ACCESS_PORT',
    targetId,
    lifecycle: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
  });
  const topology = new MemoryTopologyRepository([device, chassis, controller, ...panels]);
  const bindings = new MemoryTelemetryBindingRepository([
    binding('current-A', 'feed-A', 'CURRENT', currentA, 'A'),
    binding('voltage-A', 'feed-A', 'VOLTAGE', voltageA, 'V'),
    binding('current-B', 'feed-B', 'CURRENT', currentB, 'A'),
    binding('voltage-B', 'feed-B', 'VOLTAGE', voltageB, 'V'),
  ]);
  const history = {
    async queryLatestEntities() {
      return [
        sample('feed-A', 10, -53.2, currentA, voltageA),
        sample('feed-B', 11, -53.0, currentB, voltageB),
      ];
    },
    async querySnmpFeedTotalEnergy(targetId: string) {
      return {
        observedAt: at,
        estimatedEnergyKwh: targetId === 'feed-A' ? 1.25 : 1.5,
        coveredSeconds: 3600,
        integratedIntervals: 120,
      };
    },
  };
  return { topology, bindings, history };
}

describe('Metasys Eltek v1.2 Modbus projection', () => {
  it('recognizes only the governed customer QDF logical points', () => {
    expect(parseMetasysEltekLogicalPoint('QDF/QDF-2/INPUT_A_CURRENT')).toEqual({
      qdfRef: 'QDF-2',
      point: 'INPUT_A_CURRENT',
    });
    expect(parseMetasysEltekLogicalPoint('QDF/QDF-2/UNKNOWN')).toBeNull();
  });

  it('projects the 17-point Excel contract from Site Mapper data and alarms', async () => {
    const f = fixture();
    const alarms = new MemoryAlarmRepository();
    await alarms.insertOccurrence({
      id: 'controller-alarm',
      alarmCode: 'CONTROLLER_ALARM',
      family: 'EQUIPMENT',
      name: 'Controller alarm',
      targetType: 'EQUIPMENT',
      targetId: 'controller',
      sourceContext: 'snmp:trap',
      openedAt: at,
      lastObservedAt: at,
      lifecycle: 'ACTIVE',
      severity: 'CRITICAL',
      confidence: 'CONFIRMED',
      acknowledgement: 'UNACKNOWLEDGED',
      correlationKey: 'controller|CONTROLLER_ALARM|snmp:trap',
      ruleVersion: 'v1',
      evidenceRefs: [],
      createdAt: at,
      updatedAt: at,
    });

    const requests = METASYS_ELTEK_POINTS.map((point, index) => ({
      signalId: (index + 1).toString(16).padStart(64, '0'),
      logicalPointId: `QDF/QDF-2/${point}`,
    }));
    const signals = await projectMetasysEltekSignals(
      requests,
      f.topology,
      f.bindings,
      f.history,
      alarms,
      new Date(at),
    );
    const byPoint = new Map(
      signals.map((signal) => [signal.logicalPointId!.split('/').at(-1)!, signal]),
    );

    expect(signals).toHaveLength(17);
    expect(byPoint.get('INPUT_A_RATED_CURRENT')?.value).toBe(800);
    expect(byPoint.get('INPUT_A_VOLTAGE')?.value).toBe(-53.2);
    expect(byPoint.get('INPUT_A_CURRENT')?.value).toBe(10);
    expect(byPoint.get('INPUT_A_POWER')?.value).toBeCloseTo(0.532, 8);
    expect(byPoint.get('INPUT_B_RATED_CURRENT')?.value).toBe(800);
    expect(byPoint.get('INPUT_B_POWER')?.value).toBeCloseTo(0.583, 8);
    expect(byPoint.get('TOTAL_CURRENT')?.value).toBe(21);
    expect(byPoint.get('BUS_A_VOLTAGE')?.value).toBe(-53.2);
    expect(byPoint.get('BUS_B_VOLTAGE')?.value).toBe(-53);
    expect(byPoint.get('TOTAL_VOLTAGE')?.value).toBeCloseTo(-53.1, 8);
    expect(byPoint.get('TOTAL_POWER')?.value).toBeCloseTo(1.115, 8);
    expect(byPoint.get('TOTAL_ENERGY')?.value).toBeCloseTo(2.75, 8);
    expect(byPoint.get('COMMUNICATION_STATUS')?.value).toBe(1);
    expect(byPoint.get('CONTROLLER_ALARM_STATE')?.value).toBe(1);
    expect(byPoint.get('ALARM_SEVERITY')?.value).toBe(3);
    expect(byPoint.get('COMMUNICATION_STATUS')?.unit).toBe('');
    expect(byPoint.get('CONTROLLER_ALARM_STATE')?.unit).toBe('');
    expect(byPoint.get('ALARM_SEVERITY')?.unit).toBe('');
  });

  it('publishes clear/no-severity integer states when the controller has no active alarms', async () => {
    const f = fixture();
    const alarms = new MemoryAlarmRepository();
    const requests = ['CONTROLLER_ALARM_STATE', 'ALARM_SEVERITY'].map((point, index) => ({
      signalId: (index + 1).toString(16).padStart(64, 'a'),
      logicalPointId: `QDF/QDF-2/${point}`,
    }));
    const signals = await projectMetasysEltekSignals(
      requests,
      f.topology,
      f.bindings,
      f.history,
      alarms,
      new Date(at),
    );
    expect(signals.map((signal) => signal.value)).toEqual([0, 0]);
  });
});
