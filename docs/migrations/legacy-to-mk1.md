# Legacy → MK1 Data Migration

**Gate:** G13

This tooling transforms legacy topology exports into the accepted MK1 hierarchy without placing legacy aliases in runtime code.

## Safety model

The repository is public. Never commit production dumps, customer topology, credentials, MongoDB URIs, MQTT secrets, generated production migration reports or production ID maps.

## Input contract

The migration input is JSON with a canonical Network plus legacy collections.

Known PascalCase/lowercase aliases are accepted **only** inside `scripts/migrations/legacy/`.

## Device / Equipment rule

Device and Equipment are always migrated as siblings under Container/Rack.

Embedded Equipment found inside Device is not silently nested in MK1. It produces a warning and must be promoted explicitly as a Container/Rack sibling.

## Dry run

```bash
npm run migration:legacy -- \
  --input /secure/path/legacy.json \
  --output /secure/path/report.json
```

Review the source fingerprint, counts, transformed nodes, warnings, rejected records and generated `idMap`.

Persist the `idMap` outside Git.

## Deterministic rerun

Apply is permitted only with the reviewed ID map:

```bash
npm run migration:legacy -- \
  --input /secure/path/legacy.json \
  --id-map /secure/path/id-map.json \
  --output /secure/path/staging-report.json \
  --apply
```

The same legacy IDs reuse the same canonical IDs when the same ID map is supplied.

## Source fingerprint

Every plan carries a SHA-256 fingerprint calculated from the Network and source collections.

The fingerprint identifies the exact logical source snapshot used by that migration plan.

## Staging-first apply

`--apply` never writes directly to the live `topology_nodes` collection.

It writes only to:

`topology_nodes_migration_staging`

and attaches the source fingerprint to every staged record.

The command verifies that the staged count exactly matches the canonical plan count.

Apply is blocked when any record is rejected.

## Rejection policy

Examples include missing legacy ID, missing name, unresolved parent, invalid Position coordinates and Rack records without valid U capacity.

The migration never invents a missing parent or hierarchy level.

## Promotion procedure

Promotion from staging to live canonical data is a separate operational decision.

Before promotion:

1. create and verify a target-database backup;
2. retain the exact source export, fingerprint, ID map and report in a secure operational store;
3. confirm rejected count is zero;
4. verify per-kind and staged counts;
5. validate the accepted hierarchy;
6. run application smoke tests against staging or a staging clone;
7. schedule the approved migration window;
8. promote through the environment-specific controlled database operation;
9. run post-promotion verification;
10. retain rollback evidence.

## Rollback

Rollback is restore-based.

The migration tooling never deletes the legacy database, and production promotion requires a verified restore point.

## Certification boundary

G13 certifies the migration engine, deterministic mapping, hierarchy enforcement and staging behavior.

It does not claim that a production database has been migrated because no production dump or target credential is stored in this public repository.
