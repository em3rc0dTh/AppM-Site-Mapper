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
canonical identity of a physical Site Mapper Device or Equipment. Rack AID is a
documentary physical association and does not imply rack-U materialization.

The powered-equipment projection key is deterministic and local to this projection.
For ordinary equipment it remains equipment-name based for backward compatibility.
For PDU it is rack-scoped because the local PDU name may repeat. The projection key can
later be replaced by a persisted canonical ID without changing existing `POWER_TARGET`
or PowerPath identities.

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

## Rack AID and PDU identity

The final workbook `Lista de Equipos QDF mop v2 AID + RackAID.xlsx` closes the
previous PDU ambiguity.

Workbook rules:

- `HUELLA` identifies the physical destination rack.
- Rack identity is `RACK::<HUELLA>`.
- `PDU 01` is a **local rack name** and may repeat in different racks.
- Feed A and Feed B are two feeds of the **same PDU**, not two independent PDUs.
- `POS-N` entries are editable documentary remarks; they do not create individual
  telemetry endpoints.

Therefore PDU identity is rack-scoped:

```text
RACK::010208.14::PDU01
├── RACK::010208.14::PDU01::A
└── RACK::010208.14::PDU01::B
```

The workbook's local endpoint AID is retained as supporting identity:

```text
PDU01::NoShelf::NoSlot::A
PDU01::NoShelf::NoSlot::B
```

For ordinary powered equipment the endpoint AID remains equipment-scoped, while the
rack association is carried separately:

```text
GRTLuren3::NoShelf::PSU0::A0
rack: RACK::010202.09
```

This avoids changing the endpoint identity that was already accepted while making the
physical rack association explicit.

The workbook also contains `Orion` at `RACK::010205.16` without a corresponding
breaker row. Site Mapper records that association as documentary source truth but does
**not** invent a power connection or telemetry endpoint for Orion.

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
field assumption is commonly one QDF per powered equipment. The header also exposes the
documentary Rack AID(s). PDU rows expose canonical rack-scoped feed AIDs and their local
AID for field cross-checking.

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


## Seed-01 v13 documentary enrichment

The workbook identity facts are seeded additively into each existing breaker declaration:

```text
declaredPower.contractVersion = 2
declaredPower.identitySourceDocument
declaredPower.targetEntityName
declaredPower.targetKind
declaredPower.targetAid
declaredPower.targetLocalAid
declaredPower.targetRackAid
declaredPower.targetBaseAid?       # PDU only
declaredPower.remarksSemantics
declaredPower.targetPlacement = RACK_ASSOCIATED_U_UNKNOWN
```

Existing operator-corrected declarations remain authoritative. Seed v13 fills missing
identity fields and only upgrades `targetPlacement: UNKNOWN` to the newly confirmed
rack-associated state. It still does not create remote Equipment, PDU, AccessPorts or
PowerPaths.
