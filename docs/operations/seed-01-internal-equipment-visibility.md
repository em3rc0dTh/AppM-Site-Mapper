# Seed-01 internal industrial Equipment visibility

## Scope

The customer-facing Site Mapper operational UI must not list the following 18 seed-01 Equipment objects:

- Each of QDF-2, QDF-4 and QDF-5: `_CTRL-1`, `_GW-1`, `_METER-A2`, `_METER-A3`, `_METER-B2`, `_METER-B3`.

They remain **real persisted Equipment** because the industrial gateway, RS485 meters,
commissioning profiles, source identities, MQTT bindings and SNMP integration rely on them.

## Policy

`src/modules/topology/application/equipment-visibility.ts` is the single
customer-facing visibility predicate. It recognizes either:

1. `Equipment.attributes.visibility === 'INTERNAL'`; or
2. the strictly scoped existing `seed-01` naming/type convention for those 18 nodes.

The second rule is necessary for existing v8 databases already marked `APPLIED`:
they do not rerun the seed, and no destructive migration is performed.

This is a **presentation policy**, not authorization. Technical service queries and
commissioning still resolve the full database records. Direct Equipment detail pages
require `settings:read` for internal items. Normal operational navigation, global
search, customer inventory, spatial child lists and pins omit internal items.

Do not remove these Equipment from `src/seeds/seed-01.ts`, change their IDs, remap
bindings or erase Timescale history to achieve a visual requirement.

## Deployment and acceptance

- Existing deployments receive the visibility change upon application update; no DB reset.
- Fresh seed-01 v8 installations receive the same UI policy.
- Customer acceptance: none of the 18 items appears in either navigation tree,
  operational search, rack inventory or pins.
- Technical acceptance: `industrial_communication_profiles`, MQTT/SNMP bindings,
  telemetry ingestion and Modbus addresses remain unchanged.
- Verify with operator's real environment before client release; no tests/builds
  or deployment were run as part of this code-only change.
