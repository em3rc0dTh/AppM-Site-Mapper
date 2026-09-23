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

## Direct migration from the legacy MongoDB

When the legacy data already lives in MongoDB, no production dump needs to be copied into the
repository. The migration runner can read the source database directly and produce the same
reviewable migration plan.

Configure these variables locally only; never commit their values:

```dotenv
LEGACY_MONGODB_URI=mongodb://...
LEGACY_MONGODB_DB_NAME=site_mapper
LEGACY_NETWORK_ID=<stable canonical network id>
LEGACY_NETWORK_NAME=<real network name>

# Required only when applying the reviewed plan to MK1 staging:
MONGODB_URI=mongodb://...
MONGODB_DB_NAME=appm_site_mapper_mk1
```

The source and target may be different databases on the same MongoDB deployment, but `--apply`
refuses to run when the legacy source database and MK1 target database are identical.

Dry run directly from MongoDB:

```bash
npm run migration:legacy:mongo -- --output /secure/path/real-migration-report.json
```

The direct reader understands the legacy Site Mapper collections for sites, structures, levels,
rooms, clusters/bays, positions, containers/racks, devices/equipment and BDFB internals
(shelves, frames, panels and breakers). It preserves available Site/Structure/Room polygons,
Position grid coordinates, Container/Rack footprint dimensions and BDFB Frame visibility.
Level remains non-spatial in MK1.

Persist the generated `idMap` from the reviewed report outside Git. Then stage the exact same
logical source into the MK1 target:

```bash
npm run migration:legacy:mongo -- \
  --id-map /secure/path/id-map.json \
  --output /secure/path/staging-report.json \
  --apply
```

This writes only to `topology_nodes_migration_staging`. Promotion into
`topology_nodes` remains a separate controlled operation.

## Verify MongoDB staging before promotion

After a successful staging apply, validate the exact staged fingerprint before any promotion:

```bash
npm run migration:verify-staging -- \
  --fingerprint <sourceFingerprint> \
  --expected <staged-count>
```

The verifier checks staged count, unique canonical ids, the single Network root, canonical parent-kind
relationships, Position coordinates, Rack/CAS shape and CAS occupant references. A non-empty
`issues` array blocks promotion.

The command is read-only and only inspects `topology_nodes_migration_staging`.

## Promote verified staging to live topology

After staging verification returns `valid: true` with an empty `issues` array, promote the exact
fingerprint with an explicit confirmation:

```bash
npm run migration:promote-staging -- \
  --fingerprint <sourceFingerprint> \
  --expected <staged-count> \
  --confirm-fingerprint <sourceFingerprint>
```

The promotion command:

- refuses to run when the MK1 target database name matches the configured legacy source database;
- revalidates canonical ids and parent-kind relationships;
- builds a separate candidate collection and creates the production topology indexes there;
- preserves the staging collection;
- renames any existing live `topology_nodes` collection to a timestamped backup before swap;
- restores that backup if the candidate rename fails;
- verifies the final live document count.

Promotion only changes the MK1 target database. It does not delete or modify the legacy source database.
