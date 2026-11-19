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

Seed-01 declares 74 physical breakers:

- QDF-2: 26 breakers / 13 A-B pairs
- QDF-4: 12 breakers / 6 A-B pairs
- QDF-5: 36 breakers / 18 A-B pairs

Each breaker declaration includes, where available:

- `qdf`
- `sourceRow`
- `pairId`
- `feed`
- `targetLabel`
- `targetFootprint`
- current breaker panel/position
- companion Feed A/B breaker
- documentary source/provenance

`targetLabel` is the primary identity hint. `targetFootprint` is context/provenance and is
never treated as a foreign key that authorizes creation of an Equipment.

## Resolution contract

For each declared breaker:

1. Resolve exactly one active external POWER OUTPUT on the existing breaker.
2. Resolve exactly one existing non-breaker Equipment by exact normalized `name` or `aliases`
   against `targetLabel`.
3. If more than one exact target exists, `targetFootprint` may only narrow candidates using already
   stored topology context. It cannot create or rename anything.
4. Resolve the target POWER INPUT:
   - prefer an explicit `attributes.feed=A|B` or an exact feed-like port name;
   - if the exact target has only one active external POWER INPUT, that sole port may be used.
5. Reconcile against active PowerPaths.

Results:

- `MATCH`: exact source port -> target port already exists.
- `CREATE`: topology and ports are unambiguous and both terminals are free.
- `CONFLICT`: ambiguous target/port, wrong feed or occupied source/target.
- `UNRESOLVED`: required existing topology/port cannot be found.

Only `CREATE` rows are eligible for APPLY.

## PLAN — default and read-only

Run on the MongoDB host with the URI provided privately by the runtime environment:

```bash
node scripts/operations/reconcile-field-power-paths.mjs \
  --database seed-01 \
  --expected-breakers 74 \
  > .runtime/field-powerpath-plan.json
```

The command refuses to continue when the declared QDF breaker inventory does not equal the expected
74 breakers.

## APPLY — PowerPath insertions only

Before APPLY, execute the approved MongoDB backup procedure.

Then run:

```bash
node scripts/operations/reconcile-field-power-paths.mjs \
  --database seed-01 \
  --expected-breakers 74 \
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