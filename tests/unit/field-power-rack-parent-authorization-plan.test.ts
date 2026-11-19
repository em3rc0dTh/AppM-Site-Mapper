import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(
  new URL(
    '../../scripts/operations/plan-field-power-rack-parent-authorization.mjs',
    import.meta.url,
  ),
  'utf8',
);

describe('FIELD Rack/Parent Authorization PLAN safety contract', () => {
  it('is PLAN-only and rejects APPLY', () => {
    expect(source).toContain('PLAN_ONLY_NO_APPLY');
    expect(source).toContain("mode: 'PLAN_READ_ONLY'");
    expect(source).toContain("args.includes('--apply')");
  });

  it('does not issue topology or PowerPath writes', () => {
    expect(source).not.toMatch(
      /\.(insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|deleteMany|bulkWrite)\s*\(/,
    );
    expect(source).not.toContain("db.collection('power_paths')");
  });

  it('requires the v14 breaker, target and rack cardinality', () => {
    expect(source).toContain("option('--expected-breakers', '76')");
    expect(source).toContain("option('--expected-targets', '19')");
    expect(source).toContain("option('--expected-racks', '13')");
  });

  it('keeps Rack identity separate from Rack U placement', () => {
    expect(source).toContain('declaration.targetRackAid');
    expect(source).toContain('declaration.targetFootprint');
    expect(source).toContain('declaration.targetEntityName');
    expect(source).toContain('declaration.targetCanonicalEntityName');
    expect(source).toContain("rackPlacementAuthorization: 'RACK_IDENTITY_ONLY_U_UNKNOWN'");
  });

  it('reports target Device evidence without inferring an owner', () => {
    expect(source).toContain("'TARGET_DEVICE_MATCH'");
    expect(source).toContain("'TARGET_DEVICE_NOT_MATERIALIZED'");
    expect(source).toContain("'TARGET_DEVICE_AMBIGUOUS'");
    expect(source).toContain("'BLOCKED_BY_RACK'");
    expect(source).toContain("'EXISTING_EXACT_TARGET_DEVICE_EVIDENCE'");
    expect(source).toContain("'NOT_DECLARED_DO_NOT_INFER'");
  });

  it('preserves the no-topology/no-PowerPath mutation invariant', () => {
    expect(source).toContain("invariant: 'NO_TOPOLOGY_OR_POWERPATH_MUTATION'");
  });
});
