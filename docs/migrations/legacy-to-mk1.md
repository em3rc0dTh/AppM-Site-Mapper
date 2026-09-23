# Legacy → MK1 Data Migration

**Gate:** G13

This tooling transforms legacy topology exports into the accepted MK1 hierarchy without placing legacy aliases in runtime code.

## Safety model

The repository is public. Never commit:

- production dumps;
- customer topology;
- credentials;
- MongoDB URIs;
- MQTT secrets;
- generated migration reports containing real customer data.

Use migration inputs and reports outside Git or with sanitized fixtures only.

## Input contract

The migration input is JSON with:

```json
{
  "network": { "id": "<existing canonical network UUID>", "name": "Network" },
  "collections": {
    "Site": [],
    "Structure": [],
    "Level": [],
    "Substructure": [],
    "ContainerCluster": [],
    "Position": [],
    "Container": [],
    "Device": [],
    "Equipment": []
  }
}
```

Known lowercase aliases are accepted only inside this migration layer.

## Device / Equipment rule

Device and Equipment are always migrated as siblings under Container/Rack.

Embedded Equipment found inside a Device is **not** silently nested in MK1. It produces a warning and must be promoted explicitly as an Equipment record with the Container/Rack parent reference.

## Workflow

First run a dry-run:

```bash
node --experimental-strip-types scripts/migrations/legacy/migrate.ts \
  --input /secure/path/legacy.json \
  --output /secure/path/report.json
```

Review:

- counts;
- transformed nodes;
- warnings;
- rejected records;
- generated `idMap`.

Persist the `idMap` outside Git. Apply is permitted only after review and with the same stable ID map:

```bash
node --experimental-strip-types scripts/migrations/legacy/migrate.ts \
  --input /secure/path/legacy.json \
  --id-map /secure/path/id-map.json \
  --output /secure/path/apply-report.json \
  --apply
```

`--apply` requires `MONGODB_URI`. It upserts by canonical domain `id`, making reruns idempotent when the same source and ID map are used.

## Rejection policy

Apply is blocked when any record is rejected.

Examples:

- missing legacy ID;
- missing name;
- unresolved parent;
- invalid Position coordinate;
- Rack without valid U capacity.

The migration never guesses a missing parent or hierarchy level.

## Rollback / restore

Before a production apply:

1. create and verify a target-database backup;
2. retain the exact migration input checksum, ID map and report in a secure operational store;
3. run dry-run against the exact source snapshot;
4. apply only to the approved target;
5. verify canonical counts and hierarchy;
6. on failure, restore the target backup rather than hand-editing migrated records.

## Current certification boundary

G13 certifies the migration **engine and rules** against sanitized fixtures.

It does not claim that a real production database has been migrated, because no authorized production dump/connection is stored in this public repository.
