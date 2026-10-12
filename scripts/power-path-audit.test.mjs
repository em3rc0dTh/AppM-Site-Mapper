import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { auditActivePowerPaths } from './power-path-audit.mjs';

function check(paths, ports = new Map()) {
  const violations = [];
  const totals = auditActivePowerPaths(paths, ports, (code, id, details) => {
    violations.push({ code, id, details });
  });
  return { totals, violations };
}

const source = {
  portType: 'POWER',
  direction: 'OUTPUT',
  attributes: { feed: 'A' },
};
const target = {
  portType: 'POWER',
  direction: 'INPUT',
  attributes: { feed: 'A' },
};

describe('read-only audit of canonical and historical PowerPaths', () => {
  it('does not create phantom invalid endpoints or repeated undefined targets', () => {
    const paths = [
      { id: 'legacy-1', sourceId: 'breaker-1', targetId: 'switch-1' },
      { id: 'legacy-2', sourceId: 'breaker-2', targetId: 'switch-2' },
      { id: 'legacy-3', sourceId: 'breaker-3', targetId: 'switch-3' },
    ];
    const result = check(paths);
    assert.deepEqual(result.totals, {
      canonicalPowerPaths: 0,
      incompletePowerPaths: 3,
    });
    assert.deepEqual(
      result.violations.map((item) => item.code),
      Array(3).fill('NON_CANONICAL_POWER_PATH_ENDPOINTS'),
    );
    assert.match(result.violations[0].details, /sourceId, targetId/);
    assert.doesNotMatch(result.violations[0].details, /breaker-1/);
  });

  it('flags missing real ports only for canonical paths with valid IDs', () => {
    const result = check([
      {
        id: 'invalid-canonical',
        sourceAccessPortId: 'port-not-found',
        targetAccessPortId: 'load-not-found',
      },
    ]);
    assert.deepEqual(result.totals, { canonicalPowerPaths: 1, incompletePowerPaths: 0 });
    assert.deepEqual(
      result.violations.map((item) => item.code),
      ['INVALID_POWER_SOURCE', 'INVALID_POWER_TARGET'],
    );
  });

  it('checks duplicates only when both endpoints are actual identifiers', () => {
    const ports = new Map([
      ['source-a', source],
      ['source-b', source],
      ['load-a', target],
    ]);
    const result = check(
      [
        { id: 'path-a', sourceAccessPortId: 'source-a', targetAccessPortId: 'load-a' },
        { id: 'path-b', sourceAccessPortId: 'source-b', targetAccessPortId: 'load-a' },
        { id: 'legacy-path' },
      ],
      ports,
    );
    assert.deepEqual(
      result.violations.map((item) => item.code),
      ['MULTIPLE_ACTIVE_POWER_PATHS_FOR_INPUT', 'NON_CANONICAL_POWER_PATH_ENDPOINTS'],
    );
  });

  it('detects real mismatched Feed A/B contracts independently', () => {
    const result = check(
      [{ id: 'feed-b', sourceAccessPortId: 'source-a', targetAccessPortId: 'load-a', feed: 'B' }],
      new Map([
        ['source-a', source],
        ['load-a', target],
      ]),
    );
    assert.deepEqual(result.violations.map((item) => item.code), ['POWER_FEED_MISMATCH']);
  });

  it('does not flag a well-formed valid power connection', () => {
    const result = check(
      [{ id: 'valid', sourceAccessPortId: 'source-a', targetAccessPortId: 'load-a', feed: 'A' }],
      new Map([
        ['source-a', source],
        ['load-a', target],
      ]),
    );
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.totals, { canonicalPowerPaths: 1, incompletePowerPaths: 0 });
  });
});
