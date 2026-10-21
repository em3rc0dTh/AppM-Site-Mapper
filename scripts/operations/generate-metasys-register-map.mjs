#!/usr/bin/env node
// Generates/checks the native FC03/FLOAT32 register table, using the same contract as server.mjs.
// Default sources are SIMULATOR identities only. Never commit production serials to the public repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerMapRows } from '../../infra/modbus-tcp/register-map.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'docs/telemetry/metasys-register-map.csv');
const defaultSources = { 'EMU-BFDB-01': 1, 'EMU-BFDB-02': 2, 'EMU-BFDB-03': 3 };
const sourceMap = process.env.MODBUS_SOURCE_UNITS_JSON
  ? JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON)
  : defaultSources;
const layout = process.env.MODBUS_POINT_LAYOUT || 'panels-4x24';
const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !['--check', '--stdout'].includes(arg))) {
  throw new Error('Supported flags: --check, --stdout');
}
const columns = [
  ['CATEGORY', 'category'],
  ['NAME/DESCRIPTION', 'description'],
  ['REFERENCE', 'reference'],
  ['DATA ADDRESS', 'dataAddress'],
  ['START ADDRESS (0-BASED)', 'startAddress'],
  ['UNIT ID', 'unitId'],
  ['SOURCE ID', 'sourceIdentity'],
  ['CIRCUIT', 'circuit'],
  ['RAW POINT', 'rawPoint'],
  ['FUNCTION', 'functionCode'],
  ['DATA TYPE', 'dataType'],
  ['REGISTER COUNT', 'registerCount'],
  ['ENGINEERING UNIT', 'engineeringUnit'],
  ['SCALE', 'scale'],
  ['WORD ORDER', 'wordOrder'],
];
const quote = (v) => '"' + String(v).replaceAll('"', '""') + '"';
const data =
  [
    columns.map(([name]) => quote(name)).join(','),
    ...registerMapRows(sourceMap, layout).map((row) =>
      columns.map(([, key]) => quote(row[key])).join(','),
    ),
  ].join('\n') + '\n';
if (args.has('--stdout')) process.stdout.write(data);
else if (args.has('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== data) {
    console.error(
      'Metasys register map has drifted: run node scripts/operations/generate-metasys-register-map.mjs',
    );
    process.exitCode = 1;
  } else console.log('METASYS_REGISTER_MAP_MATCH: 1152 measurement points (lab profile)');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  console.log('Wrote ' + target);
}
