# FIELD Rack/Parent Authorization PLAN — powered targets

## Purpose

Measure the placement/ownership gap that remains after the powered-target materialization PLAN.

Seed-01 v14 currently declares:

- 76 QDF breakers
- 19 canonical powered targets
- 13 distinct destination RackAIDs

The target materialization PLAN can prove that Equipment/PDU is absent, but creating a canonical
Equipment still requires an existing Rack context and a valid Device owner. This planner inspects
those prerequisites without writing topology.

## Safety contract

This tool is PLAN-only.

It MUST NOT create, rename, move, archive, reparent or delete:

- Rack
- Device
- Equipment
- Rack U / CAS placement
- AccessPort
- PowerPath
- telemetry or historian state

Passing `--apply` is rejected.

Exact topology evidence may be reported, but a Device owner is never inferred from proximity alone.

## Expected v14 cardinality

- QDF-2: 26 breakers
- QDF-4: 14 breakers
- QDF-5: 36 breakers
- total breakers: 76
- canonical powered targets: 19
- distinct destination RackAIDs: 13

## Rack resolution

For each declared `targetRackAid`:

1. Prefer exact RackAID evidence already persisted on an active `CONTAINER_RACK`.
2. If none exists, use the documented footprint only as existing-topology context.
3. Never create a Rack from `targetRackAid` or `targetFootprint`.
4. Report:
   - `RACK_MATCH`
   - `RACK_NOT_MATERIALIZED`
   - `RACK_AMBIGUOUS`

Rack U remains unknown. The workbook confirms rack identity, not CAS/U occupancy.

## Device owner evidence

For a uniquely resolved Rack, inspect only direct active Device children.

For each canonical powered target, an exact Device-name identity match may be reported as
`TARGET_DEVICE_MATCH`. This is evidence, not permission to reparent or create Equipment.

Other states:

- `TARGET_DEVICE_NOT_MATERIALIZED`
- `TARGET_DEVICE_AMBIGUOUS`
- `BLOCKED_BY_RACK`

Ownership remains `NOT_DECLARED_DO_NOT_INFER` unless exact existing target-Device evidence is
present.

## Run

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' \
MONGODB_DB_NAME='seed-01' \
node scripts/operations/plan-field-power-rack-parent-authorization.mjs \
  --expected-breakers 76 \
  --expected-targets 19 \
  --expected-racks 13 \
  > "$HOME/site-mapper-plans/power-rack-parent-authorization.json"
```

## Decision sequence

```text
seed-01 v14 declaredPower
        ↓
Powered Target Materialization PLAN
        ↓
Rack / Parent Authorization PLAN
        ↓
review Rack + Device evidence
        ↓
approved topology materialization design
        ↓
Equipment/PDU + POWER INPUT materialization
        ↓
PowerPath PLAN
        ↓
PowerPath APPLY only for explicit CREATE rows
```

No later stage may infer Rack U or ownership from this PLAN alone.
