import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../../scripts/operations/reconcile-field-power-paths.mjs', import.meta.url),
  'utf8',
);

describe('FIELD PowerPath reconciliation safety contract', () => {
  it('is PLAN-first and requires explicit acknowledgement for APPLY', () => {
    expect(source).toContain("const apply = args.includes('--apply')");
    expect(source).toContain('RECONCILE_FIELD_POWER_PATHS');
    expect(source).toContain('PLAN_READ_ONLY');
  });

  it('does not issue topology mutations', () => {
    expect(source).not.toMatch(
      /topology\.(insertOne|updateOne|updateMany|replaceOne|deleteOne|deleteMany)\s*\(/,
    );
  });

  it('writes only PowerPath records during reconciliation', () => {
    expect(source).toContain("const powerPaths = db.collection('power_paths')");
    expect(source).toContain('await powerPaths.insertOne(change.proposed, { session })');
    expect(source).not.toContain("db.collection('telemetry_bindings')");
  });

  it('keeps unresolved and conflicting inventory out of CREATE', () => {
    expect(source).toContain("'TARGET_NOT_FOUND'");
    expect(source).toContain("'TARGET_AMBIGUOUS'");
    expect(source).toContain("'SOURCE_PORT_MISSING'");
    expect(source).toContain("'TARGET_PORT_MISSING'");
    expect(source).toContain("'SOURCE_ALREADY_CONNECTED'");
    expect(source).toContain("'TARGET_ALREADY_CONNECTED'");
  });

  it('requires the complete declared QDF breaker baseline by default', () => {
    expect(source).toContain("option('--expected-breakers', '74')");
    expect(source).toContain('refuse to infer against incomplete/changed inventory');
  });
});
