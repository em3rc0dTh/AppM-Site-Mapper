# G13 — Legacy Data Migration Receipt

**Status:** PASS

## Delivered

- legacy aliases isolated under `scripts/migrations/legacy/`;
- source-snapshot fingerprinting;
- deterministic transformation with persisted ID map;
- explicit counts, warnings and rejections;
- strict parent/hierarchy resolution;
- Device/Equipment sibling preservation;
- Position coordinate normalization;
- Container/Rack and CAS normalization;
- apply blocked by any rejected record;
- staging-first MongoDB apply;
- exact staged-count verification;
- no automatic write to live `topology_nodes`;
- migration runbook;
- sanitized migration tests.

## Certification

The final G13 head passed:

- typecheck;
- lint;
- format check;
- unit tests;
- integration tests;
- production build;
- production dependency audit.

The sanitized migration suite verifies deterministic reruns, strict parent resolution and the accepted Device/Equipment sibling hierarchy.

## Truth boundary

G13 certifies the migration engine and controlled staging workflow.

It does **not** claim that a real production database has been migrated. No production dump, customer topology, production ID map or credential is stored in this public repository.

A real production migration remains an external operational execution using this certified engine and the documented promotion/rollback procedure.

## Gate verdict

**PASS — G14 System Certification is authorized after this PR is integrated into `main`.**
