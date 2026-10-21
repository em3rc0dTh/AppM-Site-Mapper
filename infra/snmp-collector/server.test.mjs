import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeVarbinds, pointsFromEnvironment } from './collector-core.mjs';

const oid = '1.3.6.1.4.1.12148.10.10.18.4.1.6.1.1';

test('read-only collector normalizes a commissioned SNMP current with scale', () => {
  const points = pointsFromEnvironment(JSON.stringify([{ oid, metric: 'CURRENT', scale: 0.1 }]));
  const packet = normalizeVarbinds(
    points, [{ oid, value: 2200 }], '2026-10-21T13:00:00.000Z', 'ELTEK-01',
  );
  assert.equal(packet.measurements[0].value, 220);
  assert.equal(packet.measurements[0].unit, 'A');
  assert.equal(packet.sourceIdentity, 'ELTEK-01');
});

test('malformed and duplicate point commissioning is rejected', () => {
  assert.throws(() => pointsFromEnvironment('[]'));
  assert.throws(() => pointsFromEnvironment(JSON.stringify([
    { oid, metric: 'CURRENT' }, { oid, metric: 'CURRENT' },
  ])));
  assert.throws(() => normalizeVarbinds(
    [{ oid, metric: 'CURRENT', scale: 1 }],
    [{ oid: oid + '.1', value: 10 }], '2026-10-21T13:00:00.000Z', 'ELTEK-01',
  ));
});
