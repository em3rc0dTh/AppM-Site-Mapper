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
    expect(source).toContain("'TARGET_ENTITY_NOT_MATERIALIZED'");
    expect(source).toContain("'TARGET_ENTITY_NOT_FOUND'");
    expect(source).toContain("'TARGET_ENTITY_AMBIGUOUS'");
    expect(source).toContain("'TARGET_ENDPOINT_NOT_MATERIALIZED'");
    expect(source).toContain("'TARGET_ENDPOINT_AMBIGUOUS'");
    expect(source).toContain("'SOURCE_PORT_MISSING'");
    expect(source).toContain("'TARGET_PORT_MISSING'");
    expect(source).toContain("'SOURCE_ALREADY_CONNECTED'");
    expect(source).toContain("'TARGET_ALREADY_CONNECTED'");
  });

  it('resolves v14 target identity before legacy display labels', () => {
    expect(source).toContain('declaration.targetCanonicalEntityName');
    expect(source).toContain('declaration.targetEntityName');
    expect(source).toContain('declaration.targetAid');
    expect(source).toContain('declaration.targetLocalAid');
    expect(source).toContain('declaration.targetRackAid');
    expect(source).toContain("targetPortResolution = 'DECLARED_AID'");
    expect(source).toContain('unresolvedByReason');
  });

  it('uses the canonical runtime Mongo database before legacy/default fallbacks', () => {
    expect(source).toContain('process.env.MONGODB_DB_NAME ?? process.env.SITEMAPPER_DATABASE');
  });

  it('requires the complete declared QDF breaker baseline by default', () => {
    expect(source).toContain("option('--expected-breakers', '76')");
    expect(source).toContain('refuse to infer against incomplete/changed inventory');
  });
});
