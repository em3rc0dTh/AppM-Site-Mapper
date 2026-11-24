#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clientModbusV13ExtensionRows,
  clientModbusV13Manifest,
} from '../../infra/modbus-tcp/client-contract-v1.3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'config/industrial/modbus-points-v1.3.json');
const csvPath = path.join(root, 'docs/telemetry/metasys-eltek-register-map-v1.3.csv');
const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !['--check', '--stdout'].includes(arg))) {
  throw new Error('Supported flags: --check, --stdout');
}

const manifest = JSON.stringify(clientModbusV13Manifest(), null, 2) + '\n';
const columns = [
  ['QDF', 'qdf'],
  ['Unit ID', 'unitId'],
  ['Measurement Applies To', 'measurementAppliesTo'],
  ['Point', 'point'],
  ['Measurement', 'measurement'],
  ['Modbus Register', 'reference'],
  ['Start Address', 'startAddress'],
  ['Unit', 'unit'],
];
const quote = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const csv =
  [
    columns.map(([name]) => quote(name)).join(','),
    ...clientModbusV13ExtensionRows().map((row) =>
      columns.map(([, key]) => quote(row[key])).join(','),
    ),
  ].join('\n') + '\n';

if (args.has('--stdout')) {
  process.stdout.write(csv);
} else if (args.has('--check')) {
  const matches =
    fs.existsSync(manifestPath) &&
    fs.readFileSync(manifestPath, 'utf8') === manifest &&
    fs.existsSync(csvPath) &&
    fs.readFileSync(csvPath, 'utf8') === csv;
  if (!matches) {
    console.error(
      'Modbus TCP v1.3 ELTEK extension drifted: run node scripts/operations/generate-modbus-v13-extension.mjs',
    );
    process.exitCode = 1;
  } else {
    console.log('MODBUS_V13_ELTEK_MAP_MATCH: 51 extension points (17 per QDF)');
  }
} else {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  fs.writeFileSync(manifestPath, manifest);
  fs.writeFileSync(csvPath, csv);
  console.log('Wrote ' + manifestPath);
  console.log('Wrote ' + csvPath);
}