import { createHash } from 'node:crypto';

export const CLIENT_MODBUS_V13_QDFS = Object.freeze([
  Object.freeze({ qdf: 'QDF-2', deviceId: 'qdf-2', unitId: 1 }),
  Object.freeze({ qdf: 'QDF-4', deviceId: 'qdf-4', unitId: 2 }),
  Object.freeze({ qdf: 'QDF-5', deviceId: 'qdf-5', unitId: 3 }),
]);

export const CLIENT_MODBUS_V13_ELTEK_POINTS = Object.freeze([
  Object.freeze({
    appliesTo: 'Input A',
    point: 'A',
    measurement: 'Rated Current',
    address: 1024,
    unit: 'A',
    logicalSuffix: 'INPUT_A_RATED_CURRENT',
  }),
  Object.freeze({
    appliesTo: 'Input A',
    point: 'A',
    measurement: 'Voltage',
    address: 1027,
    unit: 'V',
    logicalSuffix: 'INPUT_A_VOLTAGE',
  }),
  Object.freeze({
    appliesTo: 'Input A',
    point: 'A',
    measurement: 'Current',
    address: 1030,
    unit: 'A',
    logicalSuffix: 'INPUT_A_CURRENT',
  }),
  Object.freeze({
    appliesTo: 'Input A',
    point: 'A',
    measurement: 'Power',
    address: 1033,
    unit: 'kW',
    logicalSuffix: 'INPUT_A_POWER',
  }),
  Object.freeze({
    appliesTo: 'Input B',
    point: 'B',
    measurement: 'Rated Current',
    address: 1039,
    unit: 'A',
    logicalSuffix: 'INPUT_B_RATED_CURRENT',
  }),
  Object.freeze({
    appliesTo: 'Input B',
    point: 'B',
    measurement: 'Voltage',
    address: 1042,
    unit: 'V',
    logicalSuffix: 'INPUT_B_VOLTAGE',
  }),
  Object.freeze({
    appliesTo: 'Input B',
    point: 'B',
    measurement: 'Current',
    address: 1045,
    unit: 'A',
    logicalSuffix: 'INPUT_B_CURRENT',
  }),
  Object.freeze({
    appliesTo: 'Input B',
    point: 'B',
    measurement: 'Power',
    address: 1048,
    unit: 'kW',
    logicalSuffix: 'INPUT_B_POWER',
  }),
  Object.freeze({
    appliesTo: 'Entire QDF (Total)',
    point: 'TOTAL',
    measurement: 'Current',
    address: 1054,
    unit: 'A',
    logicalSuffix: 'MODBUS_V13_TOTAL_CURRENT',
  }),
  Object.freeze({
    appliesTo: 'QDF Bus A',
    point: 'BUS-A',
    measurement: 'Voltage',
    address: 1057,
    unit: 'V',
    logicalSuffix: 'MODBUS_V13_BUS_A_VOLTAGE',
  }),
  Object.freeze({
    appliesTo: 'QDF Bus B',
    point: 'BUS-B',
    measurement: 'Voltage',
    address: 1060,
    unit: 'V',
    logicalSuffix: 'MODBUS_V13_BUS_B_VOLTAGE',
  }),
  Object.freeze({
    appliesTo: 'Entire QDF (Total)',
    point: 'TOTAL',
    measurement: 'Voltage',
    address: 1063,
    unit: 'V',
    logicalSuffix: 'MODBUS_V13_TOTAL_VOLTAGE',
  }),
  Object.freeze({
    appliesTo: 'Entire QDF (Total)',
    point: 'TOTAL',
    measurement: 'Power',
    address: 1066,
    unit: 'kW',
    logicalSuffix: 'MODBUS_V13_TOTAL_POWER',
  }),
  Object.freeze({
    appliesTo: 'Entire QDF (Total)',
    point: 'TOTAL',
    measurement: 'Energy',
    address: 1069,
    unit: 'kWh',
    logicalSuffix: 'MODBUS_V13_TOTAL_ENERGY',
  }),
  Object.freeze({
    appliesTo: 'SNMP / Controller',
    point: 'STATUS',
    measurement: 'Communication Status',
    address: 1072,
    unit: '',
    logicalSuffix: 'COMMUNICATION_STATUS',
  }),
  Object.freeze({
    appliesTo: 'SNMP / Controller',
    point: 'STATUS',
    measurement: 'Controller Alarm State',
    address: 1075,
    unit: '',
    logicalSuffix: 'CONTROLLER_ALARM_STATE',
  }),
  Object.freeze({
    appliesTo: 'SNMP / Controller',
    point: 'STATUS',
    measurement: 'Alarm Severity',
    address: 1078,
    unit: '',
    logicalSuffix: 'ALARM_SEVERITY',
  }),
]);

export function clientModbusV13SignalId(logicalPointId) {
  return createHash('sha256')
    .update('site-mapper:modbus-tcp:v1.3:' + logicalPointId)
    .digest('hex');
}

export function clientModbusV13ExtensionRows() {
  return CLIENT_MODBUS_V13_QDFS.flatMap((qdf) =>
    CLIENT_MODBUS_V13_ELTEK_POINTS.map((point) => {
      const logicalPointId = `QDF/${qdf.deviceId}/${point.logicalSuffix}`;
      return {
        qdf: qdf.qdf,
        unitId: qdf.unitId,
        measurementAppliesTo: point.appliesTo,
        point: point.point,
        measurement: point.measurement,
        reference: `${40001 + point.address}-${40002 + point.address}`,
        startAddress: point.address,
        unit: point.unit || 'no-units',
        logicalPointId,
        signalId: clientModbusV13SignalId(logicalPointId),
      };
    }),
  );
}

export function clientModbusV13Manifest() {
  return {
    version: 13,
    points: clientModbusV13ExtensionRows().map((row) => ({
      signalId: row.signalId,
      logicalPointId: row.logicalPointId,
      unitId: row.unitId,
      address: row.startAddress,
      unit: row.unit === 'no-units' ? '' : row.unit,
      description: `${row.qdf} · ${row.measurementAppliesTo} · ${row.point} · ${row.measurement}`,
    })),
  };
}