# FIELD PowerPath reconciliation — QDF-2 / QDF-4 / QDF-5

## Purpose

Close the missing electrical relationship layer without creating inventory.

The reconciler consumes the already persisted breaker declaration (`attributes.declaredPower`),
the current canonical topology, existing AccessPorts and active PowerPaths.

It may create **PowerPath records only**.

It MUST NOT create, rename, move, archive or delete:

- Device
- Equipment
- Shelf / Frame / Panel
- Circuit Breaker
- AccessPort
- telemetry bindings
- historian records

## Source facts already present

Seed-01 v14 declares 76 physical breakers:

- QDF-2: 26 breakers / 13 A-B pairs
- QDF-4: 14 breakers / 7 A-B pairs (including Orion A3-07 / B3-07)
- QDF-5: 36 breakers / 18 A-B pairs

Each breaker declaration includes, where available:

- `qdf`
- `sourceRow`
- `pairId`
- `feed`
- `targetLabel` (source/display evidence)
- `targetEntityName`
- `targetCanonicalEntityName`
- `targetKind`
- `targetAid`
- `targetLocalAid`
- `targetBaseAid`
- `targetRackAid`
- `targetMaterialization`
- `targetFootprint`
- current breaker panel/position
- companion Feed A/B breaker
- documentary source/provenance

For contract v3 declarations, entity identity is resolved from
`targetCanonicalEntityName` / `targetEntityName`; `targetLabel` remains source/display evidence.
Endpoint identity is resolved from the declared canonical/local AID. RackAID and footprint are
disambiguation context only and never authorize inventory creation.

## Resolution contract

For each declared breaker:

1. Resolve exactly one active external POWER OUTPUT on the existing breaker.
2. Resolve exactly one existing non-breaker Equipment by exact normalized `name` or `aliases`
   against `targetCanonicalEntityName` / `targetEntityName`. Legacy declarations without those
   fields may fall back to `targetLabel`.
3. If more than one exact target exists, `targetRackAid` and `targetFootprint` may only narrow
   candidates using already stored topology context. They cannot create or rename anything.
4. Resolve the target POWER INPUT:
   - when `targetAid` / `targetLocalAid` exists, require an exact endpoint identity match against
     the POWER INPUT name or its AID identity attributes;
   - only legacy declarations without AID identity may fall back to explicit `feed=A|B` or a sole
     active external POWER INPUT.
5. Reconcile against active PowerPaths.

Results:

- `MATCH`: exact source port -> target port already exists.
- `CREATE`: topology and ports are unambiguous and both terminals are free.
- `CONFLICT`: ambiguous target/port, wrong feed or occupied source/target.
- `UNRESOLVED`: required existing topology/port cannot be found.
  - `TARGET_ENTITY_NOT_MATERIALIZED`: the declared logical target is intentionally not present as
    canonical Equipment yet.
  - `TARGET_ENDPOINT_NOT_MATERIALIZED`: the Equipment exists, but the declared AID endpoint does
    not exist as a POWER INPUT yet.
  - `TARGET_ENTITY_NOT_FOUND` / `TARGET_PORT_MISSING`: legacy or unexpected missing inventory.

Only `CREATE` rows are eligible for APPLY.

## PLAN — default and read-only

Run on the MongoDB host with `MONGODB_URI` and `MONGODB_DB_NAME` loaded from the private
FIELD runtime environment. The explicit `--database` flag remains available for controlled
overrides:

```bash
node scripts/operations/reconcile-field-power-paths.mjs \
  --expected-breakers 76 \
  > .runtime/field-powerpath-plan.json
```

Database resolution order is `--database`, then `MONGODB_DB_NAME`, then the legacy
`SITEMAPPER_DATABASE` fallback, and finally `seed-01` for the existing office profile.

The command refuses to continue when the declared QDF breaker inventory does not equal the expected
76 breakers. The JSON report also exposes `unresolvedByReason` so materialization gaps are visible
without collapsing them into a generic target-not-found result.

## APPLY — PowerPath insertions only

Before APPLY, execute the approved MongoDB backup procedure.

Then run:

```bash
node scripts/operations/reconcile-field-power-paths.mjs \
  --expected-breakers 76 \
  --apply \
  --ack RECONCILE_FIELD_POWER_PATHS \
  --backup .runtime/field-powerpaths-before-apply.json
```

Safety properties:

- creates only the precomputed `CREATE` PowerPaths;
- uses a MongoDB transaction;
- rechecks that source and target ports still exist;
- rechecks that neither terminal became occupied;
- deterministic PowerPath IDs make the operation idempotent;
- existing exact routes are preserved;
- conflicts and unresolved destinations are never mutated;
- no topology write is issued.

## Acceptance

After APPLY:

1. rerun PLAN;
2. expected CREATE count becomes zero for every successfully resolved route;
3. no new duplicate source/target PowerPath exists;
4. every `MATCH` retains the expected A/B feed;
5. Power Trace for the **destination Equipment** displays the registered breaker leg;
6. unresolved targets remain explicit instead of being materialized automatically.

### Important breaker-view boundary

The existing Power Trace service is primarily destination-oriented: it finds PowerPaths whose
target AccessPort belongs to the selected Device/Equipment family.

A QDF `CIRCUIT_BREAKER` is normally the **source** of the downstream path. Therefore opening
Power Trace directly on breaker `A3-01` is not, by itself, proof that no downstream PowerPath
exists. Breaker-origin trace semantics must be handled separately from reconciliation data.

This reconciler fixes persisted electrical relationships. It does not falsify an inbound A/B
contract on a breaker that only exposes a POWER OUTPUT.

## Materialization boundary

The reconciler deliberately does **not** convert documentary PoweredEquipment/PDU projections into
physical inventory. A current v14 PLAN may therefore report
`TARGET_ENTITY_NOT_MATERIALIZED` for declared targets whose AID/RackAID is known but whose
Equipment/POWER INPUT has not yet been created.

That condition is not eligible for APPLY. Materializing Equipment/PDU and their POWER INPUT
endpoints is a separate, auditable operation and must complete before PowerPath reconciliation can
legitimately produce `CREATE` rows.
