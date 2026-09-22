# ADR-001 — Canonical Domain Terminology

**Status:** Proposed  
**Gate:** G2 — Canonical Domain Contract

## Context

The legacy system contains overlapping terminology:

- Room / Substructure;
- Cluster / ContainerCluster / Bay;
- Container / Rack.

Permanent runtime aliases are prohibited by the MK1 contract.

## Proposed mapping

### Stable terms

- Site -> `Site`
- Structure -> `Structure`
- Level -> `Level`
- Position -> `Position`
- Device -> `Device`

### Room / Substructure

**Proposed canonical term:** `Room`

Rationale:

- it represents a physical/operational area inside a Level;
- room-bound polygon/spatial behavior is already confirmed;
- `Substructure` is less precise and appears partly as legacy persistence vocabulary.

Proposed mapping:

- Room -> `Room`
- Substructure -> deprecated legacy alias -> `Room`

### Container / Rack

**Proposed canonical term:** `Rack` where the entity owns physical U capacity and rack elevation.

Rationale:

- operational behavior is rack-specific;
- CAS and U capacity belong naturally to Rack;
- `Container` is too generic for the confirmed behavior.

Proposed mapping:

- Rack -> `Rack`
- legacy Container -> `Rack` only when evidence proves rack semantics.

If legacy data contains non-rack containers, those must be classified separately during G13 rather than forced into Rack.

### Cluster / ContainerCluster / Bay

**Status:** OPEN

Recommended working term: `Zone`.

Reason for not accepting yet:

- current evidence proves grouped spatial placement but does not prove that Cluster, ContainerCluster and Bay are semantically identical;
- `Bay` may have a specific physical meaning that must not be erased;
- using a neutral working term prevents legacy naming from silently becoming architecture.

No runtime `Zone` implementation is authorized until this decision is accepted.

## Proposed canonical hierarchy

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room
                └── Zone?        # unresolved / potentially optional
                    └── Position
                        └── Rack
                            └── Device
```

## Consequences

Until this ADR becomes Accepted:

- no canonical persistence schema is frozen;
- routes may not be redesigned around unresolved nouns;
- legacy terms remain confined to evidence/migration context;
- implementation may use only already accepted/stable concepts or isolated prototypes.

## Acceptance requirements

Before changing status to Accepted:

1. resolve the grouped-space concept;
2. confirm whether Zone/Bay/Cluster is mandatory or optional;
3. confirm whether any legacy Container is not a Rack;
4. map every ambiguous legacy term to canonical, deprecated or removed.
