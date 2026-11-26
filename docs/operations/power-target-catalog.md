# Power Target Catalog — declared electrical destinations

## Purpose

The Power Target Catalog closes the operational gap between workbook-derived breaker destinations
and fully materialized topology Equipment.

A declared target is **not** a physical PowerPath. It is an electrical destination identity that can
be reused by one or many breakers without forcing the remote load to exist as Equipment + AccessPort.

## Identity

The canonical catalog identity is:

```text
Rack AID + Local AID
```

Example:

```text
Rack AID:  RACK::010208.20
Local AID: UAT-SWITCH-01::NoShelf::NoSlot::NoPort
```

Display labels are never identity. Two targets may share a human name when their rack/AID context
differs.

## Sources

The catalog merges:

1. targets already declared on commissioned breakers (workbook/field evidence);
2. targets created by authorized SiteMapper users.

Workbook-derived data remains documentary and is not silently materialized as topology Equipment.

## User-created targets

Minimum required fields:

- Equipment name/key source;
- footprint (used to build Rack AID).

Optional hierarchy:

- Shelf;
- Module / Slot;
- Endpoint / Port;
- display label.

Missing optional hierarchy is represented explicitly as `NoShelf`, `NoSlot`, and `NoPort`.

## Assignment

Assigning a catalog target to a breaker writes `attributes.declaredPower` on the breaker and does
not modify `aliases[]`.

The same target identity can be referenced by multiple breakers. Feed A/B belongs to the breaker
association. When the catalog endpoint itself is feed-specific, a mismatched association is rejected.

## Physical PowerPath remains separate

A physical PowerPath still requires:

```text
POWER OUTPUT -> POWER INPUT
```

on real active Equipment endpoints. Catalog assignment never fabricates AccessPorts or physical
topology.
