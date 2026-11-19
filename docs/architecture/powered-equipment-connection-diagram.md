# Powered Equipment & Connection Diagram — Additive Power Projection

**Status:** Implemented as additive read-only projection  
**Date:** 2026-11-19  
**Scope:** Power / declared field targets / connection diagram

## Purpose

Site Mapper already stores declared electrical destinations on circuit breakers. Those
destinations currently appear independently in global search as `POWER_TARGET` results, for
example:

```text
GRTLuren3 PSU0 A0
GRTLuren3 PSU0 A1
GRTLuren3 PSU0 B0
GRTLuren3 PSU0 B1
```

Field clarification established that these strings can describe multiple electrical
endpoints of one powered telecom equipment instead of independent equipment identities.

The implementation therefore adds a read-only `PoweredEquipment` projection without
changing the existing breaker, topology, PowerPath or telemetry persistence contracts.

## Non-breaking rule

The existing data remains authoritative and untouched:

```text
CIRCUIT_BREAKER
  aliases[]                 ← unchanged
  attributes.declaredPower  ← unchanged
  AccessPorts               ← unchanged
  PowerPaths                ← unchanged
```

The new layer is derived:

```text
Breaker declaration
      │
      ▼
Declared target / POWER_TARGET
      │
      ├── AID projection (endpoint)
      │
      ▼
PoweredEquipment projection
      │
      ▼
Connection Diagram
```

No new MongoDB collection is introduced in this phase. No topology node is created,
renamed, moved or deleted.

## Identity

A declared target such as:

```text
GRTLuren3 PSU0 A0
```

is interpreted as:

```text
powered equipment: GRTLuren3
module:            PSU0
endpoint:          A0
AID:               GRTLuren3::NoShelf::PSU0::A0
```

The AID identifies the declared electrical endpoint. It is **not** promoted to the
canonical identity of a physical Site Mapper Device or Equipment.

The powered-equipment projection key is deterministic and local to this projection.
It can later be replaced by a persisted canonical ID without changing existing
`POWER_TARGET` or PowerPath identities.

## Supported parsing patterns

The projection recognizes the field patterns already observed in the QDF reconciliation
dataset, including:

- `GRTLuren3 PSU0 A0`
- `DTX-LUR-FP2-01 SH15 PEM A1.1`
- `BB-LUR-04 SH2 A1`
- `PL-LUR-FPN3-1 SH20 FEED A`
- `GXLUR02 SH01 PEM1`
- `WS-LUR-01 PSU1`

Shelf labels normalize leading zeroes for AID comparison, for example `SH01 → SH1`,
while the original declared target label remains unchanged.

### PDU hold

Any target containing a PDU token is excluded from this grouping phase. Examples:

```text
Rack CDN PDU-1A
010208.14 PDU1-A
```

This is intentional. PDU semantics remain unresolved and the implementation must not
guess whether those tokens identify equipment, modules or distribution stages.

## Global search

Ctrl/Cmd+K remains backward compatible.

Searching `GRTLuren3` now returns:

1. a new `POWERED_EQUIPMENT` result that opens the complete connection diagram;
2. the existing individual `POWER_TARGET` results.

No existing search result type is removed.

Searching a specific endpoint such as `GRTLuren3 PSU0 A0` also matches the grouped
powered equipment because endpoint labels and AIDs are part of the projection search
surface.

## Connection diagram

The detached route is:

```text
/workbench/powered-equipment?key={projection-key}
```

and also accepts an existing declared target:

```text
/workbench/powered-equipment?target={declared-target}
```

The second form allows the existing Power Path workbench to open the complete powered
equipment diagram without changing its current route contract.

The window groups connections as:

```text
QDF / BDFB
├── Feed A
│   ├── Breaker → endpoint/AID
│   └── ...
└── Feed B
    ├── Breaker → endpoint/AID
    └── ...
                         Powered Equipment
                         ├── Part A endpoints
                         └── Part B endpoints
```

Multiple QDF/BDFB source groups are supported by the projection even though the current
field assumption is commonly one QDF per powered equipment.

## Telemetry

The connection diagram reads existing breaker telemetry. It does not create another
telemetry binding model.

Per breaker it may show:

- voltage,
- current,
- power,
- energy counter.

Missing readings are shown as unavailable; missing values are never coerced to zero.

Power totals are sums of available breaker power readings and are marked partial when
coverage is incomplete.

Energy is shown explicitly as a sum of reported counters. The UI does **not** call that
value “24 h energy” because the existing live metric can be a cumulative counter rather
than a validated period delta.

Voltage and current remain per-breaker values; the diagram does not invent aggregate
voltage or current semantics.

## Entry points

Primary:

```text
Ctrl/Cmd+K
  → POWERED EQUIPMENT
  → Connection Diagram
```

Contextual:

```text
Power Path
  → declared destination
  → VIEW ALL CONNECTIONS
  → Connection Diagram
```

Both entry points open the same detached workbench.

## Future evolution

If the customer later inventories a powered telecom asset physically, the projection may
be linked to a canonical Device/Equipment ID. That future association must be additive:

```text
PoweredEquipment projection
        │
        └── physicalInventoryId? → Device / Equipment
```

It must not require rewriting historical breaker declarations, AIDs or PowerPaths.
