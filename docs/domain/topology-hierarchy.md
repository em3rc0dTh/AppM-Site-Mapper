# Site Mapper MK1 — Accepted Topology Hierarchy

**Status:** ACCEPTED — AMENDED  
**Gate:** G2 — Canonical Domain Contract  
**Original decision:** 2026-09-22  
**Amendment:** 2026-10-01 — Device / Equipment composition

## Authoritative hierarchy

The Site Mapper MK1 topology is:

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room / Substructure
                └── ContainerCluster / Bay
                    └── Position
                        └── Container / Rack
                            └── Device
                                ├── Equipment
                                │   └── Equipment (...)
                                └── Shelf
                                    └── Frame
                                        └── Panel
                                            └── Breaker / Holder
```

This hierarchy remains a product/domain decision. The 2026-10-01 amendment changes only the Device/Equipment relationship; the prior rejection of `Zone` and the accepted physical levels remain unchanged.

## Slash notation

A slash does **not** introduce another hierarchy level.

The following pairs occupy one and the same hierarchical slot:

- `Room / Substructure`;
- `ContainerCluster / Bay`;
- `Container / Rack`;
- `Breaker / Holder`.

No extra intermediary level may be inserted merely to normalize these paired labels.

## Device and Equipment

`Device` is the rack-mounted inventory root.

A Rack/Container may mount Device identities. Rack CAS therefore references Device, not Equipment.

`Equipment` is a managed component beneath Device and may recurse:

```text
Container / Rack
└── Device
    └── Equipment
        └── Equipment (...)
```

This supports chassis/module/board/pluggable-component assemblies without introducing artificial topology kinds.

Equipment does not claim Rack CAS directly. Its rack location is inherited from the nearest mounted Device ancestor.

### Device internal structure

A Device may also own the specialized internal hierarchy:

```text
Device
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

This internal BDFB/power structure is distinct from recursive Equipment composition.

## Capability ports

Device and Equipment may expose explicit capability endpoints. Power consumers use:

```text
AccessPort
└── kind = POWER
    └── feed = A | B | unspecified
```

PowerPath terminates on the exact POWER AccessPort rather than on an undifferentiated entity.

## Persistence rule

Persistence must not:

- create new direct Rack → Equipment relationships;
- insert a Zone between Room/Substructure and ContainerCluster/Bay;
- flatten Position away;
- collapse Container/Rack into Position;
- promote Shelf, Frame, Panel or Breaker/Holder into normal topology ranks.

## Migration rule

Legacy direct Rack → Equipment records are retained as migration evidence.

MK1 must not invent a Device owner for an ambiguous record. New create/move operations use the canonical Device → Equipment relationship, while legacy records may remain readable until an explicit migration mapping is available.

## Change control

Changing this hierarchy requires an explicit G2/domain-contract amendment.

It must not change implicitly because of a database schema, route structure, UI component or legacy collection name.
