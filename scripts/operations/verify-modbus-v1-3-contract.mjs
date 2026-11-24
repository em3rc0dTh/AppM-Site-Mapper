import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGISTERS_PER_UNIT, registerMapRows } from '../../infra/modbus-tcp/register-map.mjs';

const customer = JSON.parse(
  readFileSync(new URL('../../config/industrial/modbus-tcp-v1.3-contract.json', import.meta.url)),
);
const manifest = JSON.parse(
  readFileSync(
    new URL('../../config/industrial/modbus-points.metasys-eltek-v1.3.json', import.meta.url),
  ),
);

assert.equal(customer.version, '1.3');
assert.equal(customer.workbook, 'Modbus_TCP_v1.3.xlsx');
assert.equal(customer.protocol, 'Modbus TCP');
assert.equal(customer.tcpPort, 502);
assert.equal(customer.access, 'READ_ONLY');
assert.equal(customer.functionCode, 4);
assert.equal(customer.dataType, 'FLOAT32');
assert.equal(customer.registersPerPoint, 2);
assert.equal(customer.wordOrder, 'ABCD / High Word First');
assert.equal(customer.base.valuesPerQdf, 388);
assert.equal(customer.base.totalValues, 1164);
assert.deepEqual(customer.qdfs, [
  { name: 'QDF-2', unitId: 1 },
  { name: 'QDF-4', unitId: 2 },
  { name: 'QDF-5', unitId: 3 },
]);

const units = Object.freeze(
  Object.fromEntries(customer.qdfs.map(({ name, unitId }) => [name, unitId])),
);
const baseRows = registerMapRows(units, 'blocks-2x48');
assert.equal(REGISTERS_PER_UNIT, 776);
assert.equal(baseRows.length, 1164);

for (const [qdf, unitId] of Object.entries(units)) {
  const rows = baseRows.filter((row) => row.unitId === unitId);
  assert.equal(rows.length, 388);
  assert.equal(rows[0].circuitLabel, '00');
  assert.equal(rows[0].startAddress, 768);
  assert.equal(rows[0].engineeringUnit, 'V');
  assert.equal(rows[1].startAddress, 770);
  assert.equal(rows[1].engineeringUnit, 'A');
  assert.equal(rows[2].startAddress, 772);
  assert.equal(rows[2].engineeringUnit, 'kW');
  assert.equal(rows[3].startAddress, 774);
  assert.equal(rows[3].engineeringUnit, 'kWh');
  assert.equal(rows[4].circuitLabel, '01-A');
  assert.equal(rows[4].startAddress, 0);
  assert.equal(rows[195].circuitLabel, '48-A');
  assert.equal(rows[196].circuitLabel, '01-B');
  assert.equal(rows[196].startAddress, 384);
  assert.equal(rows.at(-1).circuitLabel, '48-B');
  assert.equal(rows.at(-1).startAddress, 766);
  for (const row of rows) {
    assert.equal(row.functionCode, '04');
    assert.equal(row.dataType, 'FLOAT32');
    assert.equal(row.registerCount, 2);
    assert.equal(row.wordOrder, 'High word first');
    assert.equal(row.reference, `${40001 + row.startAddress}-${40002 + row.startAddress}`);
  }
  assert.ok(rows.every((row) => row.sourceIdentity === qdf));
}

const extension = [
  ['INPUT_A_RATED_CURRENT', 1024, 'A'],
  ['INPUT_A_VOLTAGE', 1027, 'V'],
  ['INPUT_A_CURRENT', 1030, 'A'],
  ['INPUT_A_POWER', 1033, 'kW'],
  ['INPUT_B_RATED_CURRENT', 1039, 'A'],
  ['INPUT_B_VOLTAGE', 1042, 'V'],
  ['INPUT_B_CURRENT', 1045, 'A'],
  ['INPUT_B_POWER', 1048, 'kW'],
  ['TOTAL_CURRENT', 1054, 'A'],
  ['BUS_A_VOLTAGE', 1057, 'V'],
  ['BUS_B_VOLTAGE', 1060, 'V'],
  ['TOTAL_VOLTAGE', 1063, 'V'],
  ['TOTAL_POWER', 1066, 'kW'],
  ['TOTAL_ENERGY', 1069, 'kWh'],
  ['COMMUNICATION_STATUS', 1072, ''],
  ['CONTROLLER_ALARM_STATE', 1075, ''],
  ['ALARM_SEVERITY', 1078, ''],
];

assert.equal(manifest.contract, 'Modbus_TCP_v1.3');
assert.equal(manifest.points.length, 51);
for (const [qdf, unitId] of Object.entries(units)) {
  const points = manifest.points.filter((point) => point.unitId === unitId);
  assert.equal(points.length, 17);
  for (const [name, address, unit] of extension) {
    const point = points.find((candidate) => candidate.logicalPointId === `QDF/${qdf}/${name}`);
    assert.ok(point, `${qdf} ${name} missing`);
    assert.equal(point.address, address);
    assert.equal(point.dataType, 'FLOAT32');
    assert.equal(point.unit, unit);
    assert.equal(
      40001 + point.address,
      Number(`41${String(25 + (address - 1024)).padStart(3, '0')}`) || 40001 + address,
    );
  }
}

// Exact customer references for the extension, including the three status values.
const refs = extension.map(([, address]) => `${40001 + address}-${40002 + address}`);
assert.deepEqual(refs, [
  '41025-41026',
  '41028-41029',
  '41031-41032',
  '41034-41035',
  '41040-41041',
  '41043-41044',
  '41046-41047',
  '41049-41050',
  '41055-41056',
  '41058-41059',
  '41061-41062',
  '41064-41065',
  '41067-41068',
  '41070-41071',
  '41073-41074',
  '41076-41077',
  '41079-41080',
]);

console.log('MODBUS_V1_3_CONTRACT_PASS base=1164 extension=51 units=1,2,3 fc=04');
