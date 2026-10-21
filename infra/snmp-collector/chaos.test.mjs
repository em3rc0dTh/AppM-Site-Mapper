import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeVarbinds, pointsFromEnvironment } from './collector-core.mjs';

const oid = '1.3.6.1.4.1.8072.9999.2026.49.1.1.0';
const points = pointsFromEnvironment(JSON.stringify([{ oid, metric: 'CURRENT', scale: 0.1 }]));

test('invalid device values must never become a measured 0 A', () => {
  for (const raw of [null, undefined, '', false, true, [], {}, 'NaN', 'Infinity']) {
    assert.throws(
      () => normalizeVarbinds(points, [{ oid, value: raw }],
        '2026-10-21T12:00:00.000Z', 'CHAOS-01'),
      'accepted a malformed sensor value: ' + String(raw),
    );
  }
});

test('valid numeric zero, positive amperes and signed voltage remain accepted', () => {
  for (const raw of [0, 0n, '0', Buffer.from('0'), 2500]) {
    const result = normalizeVarbinds(points, [{ oid, value: raw }],
      '2026-10-21T12:00:00.000Z', 'CHAOS-01');
    assert.equal(result.measurements[0].value, Number(raw) * 0.1);
  }
  const voltageOid = '1.3.6.1.4.1.8072.9999.2026.49.2.1.0';
  const voltagePoints = [{ oid: voltageOid, metric: 'VOLTAGE', scale: 0.1 }];
  assert.equal(normalizeVarbinds(voltagePoints, [{ oid: voltageOid, value: -530 }],
    '2026-10-21T12:00:00.000Z', 'CHAOS-01').measurements[0].value, -53);
});

test('bounded anomalous points cannot silently enter current stream', () => {
  assert.throws(() => pointsFromEnvironment(JSON.stringify([{ oid, metric: 'CURRENT', scale: 0 }])));
  assert.throws(() => pointsFromEnvironment(JSON.stringify([{ oid, metric: 'CURRENT', scale: 1e12 }])));
});
