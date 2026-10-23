import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateRegistry } from '../../infra/modbus-tcp/point-registry.mjs';
// Input is an operator-approved list. Discovery never assigns Modbus addresses.
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error('Usage: node scripts/telemetry/commission-points.mjs INPUT_JSON OUTPUT_JSON');
const approved = JSON.parse(readFileSync(input, 'utf8'));
const registry = validateRegistry({
  version: approved.version,
  points: approved.points.map((p) => {
    if (
      !['MQTT', 'SNMP'].includes(p.protocol) ||
      typeof p.sourceIdentity !== 'string' ||
      typeof p.key !== 'string' ||
      (p.protocol === 'MQTT' && typeof p.topic !== 'string')
    )
      throw new Error('Invalid commissioned signal identity');
    return {
      signalId: createHash('sha256')
        .update(JSON.stringify([p.protocol, p.sourceIdentity, p.topic ?? '', p.key]))
        .digest('hex'),
      unitId: p.unitId,
      address: p.address,
      unit: p.unit,
      description: p.description,
    };
  }),
});
writeFileSync(output, JSON.stringify(registry, null, 2) + '\n');
console.info(JSON.stringify({ version: registry.version, points: registry.points.length }));
