# G13 — Legacy Data Migration Receipt

**Status:** READY FOR CI / REVIEW

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

## Truth boundary

This gate certifies migration tooling.

It does not claim real production data has already been migrated. No production dump, customer topology or credential is stored in this public repository.

## Gate verdict

Final PASS requires full CI success on the final G13 head.
