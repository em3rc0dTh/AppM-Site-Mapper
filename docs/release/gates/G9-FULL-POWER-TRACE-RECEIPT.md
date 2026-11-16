# G9 — Full Power Trace Execution Receipt

**Branch:** `feat/full-power-trace-access-ports`  
**Base:** `feat/mk1-raw-build`  
**PR:** #42  
**Status:** Draft verification receipt

## Implemented domain contract

Canonical rack inventory is now:

```text
Rack
└── Device
    └── Equipment
        └── Equipment (...)
```

Rack CAS mounts Device identities only. Equipment inherits the rack position of its mounted Device ancestor.

Device and Equipment may expose explicit capability ports. Electrical loads use:

```text
AccessPort
kind = POWER
feed = A | B | unspecified
```

A target may declare `A_B_REQUIRED`. The existence of two arbitrary PowerPaths is not enough to claim redundancy.

## Canonical PowerPath

New connections are validated as:

```text
BDFB Device
→ Shelf
→ Frame
→ Panel
→ Breaker
→ PowerPath
→ Device / Equipment
→ AccessPort(POWER)
```

A source that is not a Breaker is rejected. A target without a POWER AccessPort is rejected. A PowerPath feed that conflicts with a feed-constrained target port is rejected.

Active PowerPaths protect their referenced AccessPorts from deletion or incompatible feed reassignment.

## Full Power Trace projection

The authenticated trace endpoint resolves the selected Device/Equipment plus recursively nested Equipment.

Feed A and Feed B are returned independently. They may originate from the same BDFB or different BDFBs.

For each leg the projection reports separately:

- topology validity;
- physical BDFB/Shelf/Frame/Panel/Breaker source;
- target hierarchy and exact POWER AccessPort;
- breaker telemetry mapping;
- latest breaker Voltage / Current / Power / Energy when available;
- declared redundancy-policy state.

Telemetry is never copied from the target. It is resolved from the exact source breaker and its mapped raw point.

## Legacy compatibility

Legacy PowerPaths whose target identifies only a Device/Equipment entity remain readable.

They are reported as:

`LEGACY_TARGET_WITHOUT_PORT`

No AccessPort or Equipment owner is invented.

Legacy Equipment found directly under a Rack is likewise migration evidence. New create/move operations use the canonical Device → Equipment hierarchy.

## UI

Device/Equipment exposes:

- **FULL POWER TRACE** — clear white modal with independent A/B columns;
- **POWER PORTS** — explicit port/policy editor for users with `power:write`.

BDFB breaker inspection lists all connected loads instead of collapsing multiple paths to one.

## Demonstration fixture

The local demo configures `SERVER-01` with:

- `PSU A` / Feed A;
- `PSU B` / Feed B;
- explicit `A_B_REQUIRED` policy.

Feed A originates from `BDFB-A`; Feed B originates from `BDFB-B`.

This proves that A/B source identity is independent and not constrained to one BDFB.

## Automated evidence

Added/updated coverage includes:

- strict Rack → Device → Equipment → Equipment hierarchy;
- breaker → POWER AccessPort validation;
- recursive Full Power Trace;
- A/B paths from separate BDFBs;
- exact breaker telemetry/raw-point association;
- explicit redundancy policy satisfaction;
- preservation and labeling of legacy entity-only targets;
- certification golden path using the canonical model.

CI is authoritative for typecheck, lint, formatting, unit/integration/certification tests, build and production dependency audit.

## Manual visual evidence

The white Full Power Trace / POWER PORTS dialogs still require browser capture/review before this draft PR is ready to merge.

No production migration is executed by this branch.
