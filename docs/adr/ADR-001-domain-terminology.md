# ADR-001 — Canonical Domain Terminology and Hierarchy

**Status:** Accepted — Amended  
**Gate:** G2 — Canonical Domain Contract  
**Original decision:** 2026-09-22  
**Amendment:** 2026-10-01

## Context

The legacy product uses paired terminology at several physical levels. The original ADR also treated Device and Equipment as peers under Rack.

The Full Power Trace / physical-composition directive clarified that this peer model is incorrect for MK1: Rack mounts a Device, while Equipment represents recursively composable parts of that Device.

## Decision

The accepted hierarchy is:

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

## Accepted terminology semantics

The slash-pairs occupy one hierarchy level:

- `Room / Substructure`;
- `ContainerCluster / Bay`;
- `Container / Rack`;
- `Breaker / Holder`.

A slash does not represent parent/child nesting.

## Device and Equipment decision

The original peer decision is superseded.

Canonical composition is:

```text
Container / Rack
└── Device
    └── Equipment
        └── Equipment (...)
```

Consequences:

- Rack CAS mounts Device identities only;
- Equipment may be nested recursively beneath Device/Equipment;
- Equipment inherits rack placement from its mounted Device ancestor;
- legacy Rack → Equipment records are preserved as migration evidence and are not silently reparented.

A Device may independently own the specialized internal BDFB structure:

```text
Shelf -> Frame -> Panel -> Breaker / Holder
```

Device/Equipment may also expose explicit capability ports such as `AccessPort(POWER)`.

## Zone decision

The proposed `Zone` abstraction remains rejected.

No Zone layer exists between:

```text
Room / Substructure
and
ContainerCluster / Bay
```

## Technical naming consequence

Implementation naming must preserve the accepted hierarchy and product meaning without creating extra runtime levels.

## Consequences

Persistence, routes, migrations, rack elevation, power tracing and UI reconstruction must conform to the amended hierarchy.

New PowerPaths terminate on explicit capability endpoints where the domain requires them; for electrical loads that endpoint is `AccessPort(POWER)`.

Any future change to this topology requires an explicit domain-contract amendment.
