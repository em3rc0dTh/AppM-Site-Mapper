# ADR-001 — Canonical Domain Terminology and Hierarchy

**Status:** Accepted  
**Gate:** G2 — Canonical Domain Contract  
**Decision date:** 2026-09-22

## Context

The legacy product uses paired terminology at several physical levels.

An earlier G2 draft proposed normalizing:

- Room / Substructure -> Room;
- ContainerCluster / Bay -> Zone;
- Container / Rack -> Rack.

That proposal is superseded by the explicit product decision to preserve the established hierarchy and paired vocabulary.

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
                            ├── Device
                            │   └── Shelf
                            │       └── Frame
                            │           └── Panel
                            │               └── Breaker / Holder
                            └── Equipment
```

## Accepted terminology semantics

The slash-pairs occupy one hierarchy level:

- `Room / Substructure`;
- `ContainerCluster / Bay`;
- `Container / Rack`;
- `Breaker / Holder`.

A slash does not represent parent/child nesting.

## Device and Equipment decision

`Device` and `Equipment` are hierarchical peers.

Both are direct children of `Container / Rack`.

Therefore:

```text
Container / Rack
├── Device
└── Equipment
```

is authoritative.

`Equipment` must not be modeled as a child of `Device`.

A Device may independently own:

```text
Shelf -> Frame -> Panel -> Breaker / Holder
```

without changing the equal topology rank of Device and Equipment.

## Zone decision

The proposed `Zone` abstraction is rejected.

No Zone layer exists between:

```text
Room / Substructure
and
ContainerCluster / Bay
```

## Technical naming consequence

G3 may select one internal technical identifier for an accepted paired concept when required by schema/code constraints.

That technical decision must:

- preserve the accepted hierarchy;
- preserve the product meaning;
- avoid creating an extra runtime hierarchy level;
- remain traceable to the paired domain vocabulary.

## Consequences

Persistence, routes, migrations and UI reconstruction must conform to this hierarchy.

Legacy records that differ must be normalized during migration rather than redefining MK1.

Any future change to this topology requires an explicit domain-contract amendment.
