# Legacy → MK1 Data Migration

**Gate:** G13

This tooling transforms legacy topology exports into the accepted MK1 hierarchy without placing legacy aliases in runtime code.

## Safety model

The repository is public. Never commit production dumps, customer topology, credentials, MongoDB URIs, MQTT secrets, generated production migration reports or production ID maps.

## Input contract

The migration input is JSON with a canonical Network plus legacy collections.

Known PascalCase/lowercase aliases are accepted **only** inside `scripts/migrations/legacy/`.

## Deployed legacy Site Mapper shape

The migration adapter also accepts the deployed legacy MongoDB shape observed in the original Site Mapper database. Compatibility remains isolated to `scripts/migrations/legacy/`.

Supported evidence-backed translations include:

- a legacy `Container` linked directly to a cluster through `parentId` + `parentType: "cluster"` may materialize the required MK1 `Position` when a valid `grid_coordinate` such as `["C-6"]` is present;
- rack U capacity may be recovered from explicit capacity fields or the highest evidenced CAS/mounting end position;
- legacy CAS fields such as `casStatus`, nested `mounting.startPosition/endPosition`, clearance and embedded `device.id` are normalized into the MK1 CAS contract;
- a legacy object declared Rack/Cabinet without evidence of U capacity is retained as canonical `CONTAINER` with a migration warning rather than inventing rack capacity;
- embedded BDFB `shelves → frames → panels → breakers/holders` are materialized into `Device.bdfb`;
- a slot whose legacy label begins with `Holder` remains `HOLDER`; a named installed slot such as `CB-EATON-01` becomes `BREAKER`. Telemetry never promotes a holder into a breaker.

### Explicit BDFB telemetry binding

Legacy `panel.telemetryPrefix` is used as a fallback. When the current provider mapping is known outside the legacy document, the migration input may supply evidence-backed panel prefixes, and those explicit bindings take precedence:

```json
{
  "bfdbPanelTelemetryPrefixes": {
    "<legacy-device-id>": {
      "Panel A1": "0_1_",
      "Panel A2": "0_2_",
      "Panel B1": "0_3_",
      "Panel B2": "0_4_"
    }
  }
}
```

This produces explicit breaker bindings such as `0_1_1` without flattening or reordering the physical A/B panel hierarchy. Panels without an evidenced provider mapping remain physically present and unbound.

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
4. run the promotion dry-run against the exact staging fingerprint;
5. verify per-kind and staged counts;
6. validate the accepted hierarchy;
7. run application smoke tests against staging or a staging clone;
8. schedule the approved migration window;
9. promote with the controlled promotion command;
10. run post-promotion verification and retain rollback evidence.

Dry-run:

```bash
npm run migration:promote -- \
  --fingerprint <reviewed-source-fingerprint> \
  --expected <canonical-node-count>
```

Apply only after the dry-run passes:

```bash
npm run migration:promote -- \
  --fingerprint <reviewed-source-fingerprint> \
  --expected <canonical-node-count> \
  --apply
```

The promotion command validates the exact staging fingerprint, count, unique IDs, one canonical Network root, every parent reference and every canonical parent kind. Apply builds a fully indexed candidate collection before swapping it into `topology_nodes`.

If a live `topology_nodes` collection already exists, it is renamed to a timestamped `topology_nodes_backup_...` collection before the candidate becomes live. The backup collection is retained intentionally.

## Rollback

Production still requires a verified database-level restore point.

For a failed local/staging promotion, the retained `topology_nodes_backup_...` collection provides an additional operational rollback artifact. The promotion tool automatically restores the renamed live collection when the final candidate rename itself fails. It does not silently roll back after a post-promotion verification failure; that condition is surfaced explicitly for operator review.

The migration tooling never deletes the legacy source collections.

## Certification boundary

G13 certifies the migration engine, deterministic mapping, hierarchy enforcement and staging behavior.

It does not claim that a production database has been migrated because no production dump or target credential is stored in this public repository.
