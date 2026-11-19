import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL('../../scripts/operations/plan-field-power-target-materialization.mjs', import.meta.url),
  'utf8',
);

describe('FIELD powered-target materialization PLAN safety contract', () => {
  it('is PLAN-only and rejects APPLY', () => {
    expect(source).toContain('PLAN_ONLY_NO_APPLY');
    expect(source).toContain("mode: 'PLAN_READ_ONLY'");
    expect(source).toContain("args.includes('--apply')");
  });

  it('does not issue Mongo mutations', () => {
    expect(source).not.toMatch(
      /\.(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite)\s*\(/,
    );
  });

  it('requires the complete v14 breaker and target cardinality', () => {
    expect(source).toContain("option('--expected-breakers', '76')");
    expect(source).toContain("option('--expected-targets', '19')");
    expect(source).toContain('refuse to plan against incomplete/changed inventory');
    expect(source).toContain('refuse to plan against changed identity cardinality');
  });

  it('uses canonical entity identity, AID and RackAID without inferring placement', () => {
    expect(source).toContain('declaration.targetCanonicalEntityName');
    expect(source).toContain('declaration.targetEntityName');
    expect(source).toContain('declaration.targetAid');
    expect(source).toContain('declaration.targetLocalAid');
    expect(source).toContain('declaration.targetRackAid');
    expect(source).toContain("placementBoundary: 'RACK_ASSOCIATED_U_UNKNOWN'");
    expect(source).toContain("parentAuthorization: 'NOT_DECLARED_DO_NOT_INFER'");
  });

  it('classifies entity and endpoint materialization gaps explicitly', () => {
    expect(source).toContain("'ENTITY_NOT_MATERIALIZED'");
    expect(source).toContain("'ENTITY_AMBIGUOUS'");
    expect(source).toContain("'ENDPOINT_NOT_MATERIALIZED'");
    expect(source).toContain("'ENDPOINT_AMBIGUOUS'");
    expect(source).toContain("'ENDPOINT_FEED_CONFLICT'");
    expect(source).toContain("'MATERIALIZE_ENTITY_AND_ENDPOINTS'");
    expect(source).toContain("'MATERIALIZE_ENDPOINTS'");
  });

  it('preserves the no-inventory/no-PowerPath mutation invariant', () => {
    expect(source).toContain("invariant: 'NO_INVENTORY_OR_POWERPATH_MUTATION'");
    expect(source).not.toContain("db.collection('power_paths')");
    expect(source).not.toContain("db.collection('telemetry_bindings')");
  });
});
