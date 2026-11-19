# FIELD powered-target materialization PLAN — QDF-2 / QDF-4 / QDF-5

## Purpose

Measure the gap between seed-01 v14 declared power identity and persisted physical topology **without creating inventory**.

The planner consumes the 76 breaker declarations already stored in
`attributes.declaredPower` and groups them into the 19 canonical powered targets declared by the
19.11.2026 workbook identity contract.

It is intentionally separate from PowerPath reconciliation.

## Safety contract

This tool is PLAN-only.

It MUST NOT create, rename, move, archive or delete:

- Device
- Equipment
- Rack / CAS placement
- AccessPort
- PowerPath
- telemetry binding
- historian records

Passing `--apply` is rejected.

The planner also refuses to infer:

- parent Device
- Rack U / CAS occupancy
- Equipment type beyond the declared EQUIPMENT/PDU logical kind
- physical placement not present in canonical topology

## Expected v14 cardinality

- QDF-2: 26 breakers
- QDF-4: 14 breakers
- QDF-5: 36 breakers
- total: 76 breakers

These declarations group into 19 canonical remote targets.

PDU identities are rack-scoped. For example:

- `RACK::010202.10::PDU01`
- `RACK::010208.13::PDU01`
- `RACK::010208.14::PDU01`

A repeated local name such as `PDU 01` is never treated as globally unique.

## Resolution model

For each canonical target:

1. Group breaker declarations by canonical target identity.
2. Resolve an existing non-breaker Equipment by exact normalized `name` / `aliases` against:
   - `targetCanonicalEntityName`
   - `targetEntityName`
3. When multiple candidates exist, use `targetRackAid` / `targetFootprint` only as
   disambiguation against already persisted topology context.
4. For an existing target entity, resolve each declared POWER INPUT endpoint by:
   - `targetAid`
   - `targetLocalAid`
   - compatible AccessPort AID identity attributes.
5. Report the required next action.

## Target states

Entity states:

- `ENTITY_MATCH`
- `ENTITY_NOT_MATERIALIZED`
- `ENTITY_AMBIGUOUS`

Endpoint states:

- `ENDPOINT_MATCH`
- `ENDPOINT_NOT_MATERIALIZED`
- `ENDPOINT_AMBIGUOUS`
- `ENDPOINT_FEED_CONFLICT`
- `BLOCKED_BY_ENTITY`

Required actions:

- `NONE`
- `MATERIALIZE_ENTITY_AND_ENDPOINTS`
- `MATERIALIZE_ENDPOINTS`
- `REVIEW_ENTITY_AMBIGUITY`
- `REVIEW_ENDPOINT_CONFLICT`

These are planning classifications only. They do not authorize writes.

## Run

Use the same private Mongo runtime selected for Site Mapper:

```bash
MONGODB_URI='mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true' \
MONGODB_DB_NAME='seed-01' \
node scripts/operations/plan-field-power-target-materialization.mjs \
  --expected-breakers 76 \
  --expected-targets 19 \
  > "$HOME/site-mapper-plans/field-power-target-materialization-plan.json"
```

## Acceptance before any materialization implementation

Review:

- exact 76 breaker baseline
- exact 19 canonical targets
- number of existing entity matches
- number of missing entities
- declared endpoint count
- endpoint matches / gaps / conflicts
- every target's RackAID and AID set
- any ambiguity before a write path is designed

No materialization APPLY should be implemented until the PLAN result proves where the canonical
parent Device / Rack context already exists and where it is genuinely absent.

## Relationship to PowerPath reconciliation

The sequence is:

```text
Workbook / seed-01 v14 declaration
        ↓
Powered-target materialization PLAN
        ↓
approved inventory materialization (separate operation)
        ↓
PowerPath PLAN
        ↓
MATCH / CREATE / CONFLICT / UNRESOLVED
        ↓
PowerPath APPLY (only explicit CREATE rows)
```

The PowerPath reconciler must never invent the inventory that this planner reports as absent.
