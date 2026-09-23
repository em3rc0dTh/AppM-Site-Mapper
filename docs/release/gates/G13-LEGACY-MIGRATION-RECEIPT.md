# G13 — Legacy Data Migration Receipt

**Status:** READY FOR CI / REVIEW

## Delivered

- isolated legacy alias handling under `scripts/migrations/legacy/`;
- deterministic transformation when a persisted ID map is supplied;
- dry-run report with counts, warnings and rejected records;
- strict parent/hierarchy resolution;
- Device and Equipment sibling preservation;
- Position coordinate normalization;
- Container/Rack variant handling;
- CAS normalization for supported legacy shapes;
- apply mode guarded by zero rejections and explicit ID map;
- idempotent canonical upserts by stable ID;
- migration guide;
- sanitized migration tests.

## Truth boundary

This gate certifies migration tooling.

It does **not** claim that real production data has been migrated. No production dump, customer topology or credential is stored in this public repository.

## Gate verdict

Final PASS requires complete CI success on the final G13 head.
