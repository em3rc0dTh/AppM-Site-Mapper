# Site Mapper MK1 — Canonical Domain Contract

**Gate:** G2 — Canonical Domain Contract  
**Status:** DRAFT — TOPOLOGY HIERARCHY ACCEPTED  
**Authority:** Binding after G2 is sealed and merged into `main`.

## 1. Purpose

This contract defines the authoritative business/domain structure for Site Mapper MK1 before persistence is designed.

It intentionally does **not** define MongoDB collections, indexes, embedding strategy, Prisma models, route-handler shapes, React component boundaries or MQTT transport.

Persistence and implementation must serve this domain model, not redefine it.

## 2. Accepted topology hierarchy

The following hierarchy is now an explicit product decision:

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

The detailed authority for this hierarchy is recorded in:

`docs/domain/topology-hierarchy.md`

This decision supersedes the earlier G2 proposal that introduced a `Zone` concept.

There is **no Zone layer** in the accepted topology.

## 3. Hierarchy semantics

### Network

Root operational context for the Site Mapper topology.

Whether Network requires its own persisted document remains a G3 decision. Its hierarchical position is accepted.

### Site

Direct child of Network.

A Site represents one managed physical site.

### Structure

Direct child of Site.

A Structure represents a physical building or managed structure within a Site.

### Level

Direct child of Structure.

A Level represents one physical or operational level/floor.

### Room / Substructure

Direct child of Level.

`Room` and `Substructure` occupy the same hierarchy level and refer to the accepted Room/Substructure domain position.

A Room/Substructure may own polygon and spatial-boundary information used by the Blueprint Engine.

### ContainerCluster / Bay

Direct child of Room/Substructure.

`ContainerCluster` and `Bay` occupy the same hierarchy level.

No additional Zone abstraction exists between Room/Substructure and ContainerCluster/Bay.

### Position

Direct child of ContainerCluster/Bay.

Position is an addressable physical placement location and remains an explicit domain level.

### Container / Rack

Direct child of Position.

`Container` and `Rack` occupy the same hierarchy level.

This node owns the physical context in which Device and Equipment are placed.

Rack-specific behavior such as U capacity and CAS may apply where the Container/Rack instance supports that capability.

### Device

Direct child of Container/Rack.

Device is an independently identifiable managed object.

A Device may contain the internal physical/electrical structure:

```text
Shelf
└── Frame
    └── Panel
        └── Breaker / Holder
```

Device identity remains separate from placement identity.

Moving a Device does not create a new Device.

### Equipment

Direct child of Container/Rack.

**Equipment and Device have the same hierarchical rank.**

Equipment is not a child of Device.

This relationship is authoritative:

```text
Container / Rack
├── Device
└── Equipment
```

Any legacy structure that nests Equipment under Device must be treated as migration evidence rather than the MK1 topology contract.

### Shelf

Internal child of Device.

### Frame

Internal child of Shelf.

### Panel

Internal child of Frame.

### Breaker / Holder

Internal child of Panel.

`Breaker` and `Holder` occupy the same internal hierarchy level.

Their precise electrical semantics remain subject to the Power-domain gate.

## 4. Slash-pair rule

Slash notation identifies accepted paired product vocabulary at a single hierarchy level.

It does not mean parent/child.

Accepted pairs are:

- Room / Substructure;
- ContainerCluster / Bay;
- Container / Rack;
- Breaker / Holder.

G3 may choose a single technical schema identifier for storage and code where necessary, but that implementation decision must not alter the accepted product hierarchy or invent a new level.

## 5. Rack occupancy / CAS domain

Confirmed states remain:

```text
AVAILABLE
RESERVED
EQUIPPED
```

CAS applies within the Container/Rack context where rack capacity is supported.

G2 does not yet decide whether CAS is:

- persisted authoritative state;
- a value object owned by Container/Rack;
- derived occupancy state;
- a separate domain entity.

Required invariants remain:

- U ranges must be valid;
- occupied ranges cannot overlap;
- capacity cannot be exceeded;
- clearance is explicit;
- mount/split/free are deterministic;
- physical size and reserved size are not silently conflated.

## 6. Device internal structure / BDFB

The accepted structural path is:

```text
Device
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

BDFB remains a Device specialization/capability candidate rather than a new topology root.

G9 will formalize its electrical and provisioning rules.

## 7. Power domain

Confirmed concepts include:

- source Device or Equipment as applicable;
- Panel;
- Breaker/Holder;
- target Device or Equipment;
- A/B provisioning;
- source-to-target Power Path.

Domain principle:

> Electrical topology is an explicit domain relationship and must not be inferred solely from UI state.

Still open for G9:

- exact endpoint type rules;
- A/B semantics;
- redundancy;
- path lifecycle;
- PowerPath aggregate/value semantics;
- persistence versus derivation.

## 8. Telemetry identity

Telemetry state does not define topology identity.

A Device or Equipment identity may map to an external telemetry identity without making topic/serial naming the primary domain ID.

Transport details remain G10.

## 9. Identity and roles

Legacy role vocabulary remains evidence:

- Superadmin;
- Admin;
- Standard.

G4 owns their final permissions, sessions, password policy, lifecycle and audit semantics.

## 10. Lifecycle principles

Current domain principles:

1. Identity and placement are separate.
2. Moving a Device or Equipment does not recreate its identity.
3. Parent-child deletion must never silently destroy operational descendants.
4. Archival is preferred where an entity has operational history or references.
5. Hard deletion requires an explicitly safe use case.
6. Domain mutations are explicit use cases, not generic collection CRUD.

Exact archive/delete policy remains open for later G2/G3 decisions.

## 11. Identifier principles

Canonical domain identifiers must:

- remain stable across movement and renaming;
- be opaque to presentation code;
- not encode the hierarchy;
- not depend on legacy collection names;
- permit legacy identifiers as migration metadata where required.

The concrete identifier strategy belongs to ADR-005.

## 12. Module boundaries

### Topology

Owns the accepted hierarchy and parent/child relationships.

### Spatial

Owns coordinates, geometry, polygons, snapping and collision.

### Inventory

Owns Device and Equipment identity/specification concerns.

### Rack

Owns Container/Rack capacity and occupancy behavior.

### Power

Owns Shelf/Frame/Panel/Breaker/Holder electrical relationships and Power Path.

### Telemetry

Owns normalization and association of realtime state to Device/Equipment identities.

### Identity

Owns users, sessions, roles and authorization.

These are modular-monolith boundaries, not microservices.

## 13. Rejected domain drift

The following are prohibited:

- introducing Zone into the accepted topology;
- nesting Equipment below Device;
- removing Position as a domain level without explicit amendment;
- treating persistence collection names as domain nouns;
- caller-provided collection/entity names as business contracts;
- UI shape becoming persistence shape;
- a Prisma schema being treated as domain authority merely because it exists;
- browser/client role state becoming authorization authority.

## 14. Remaining G2 open decisions

Topology order is no longer open.

Remaining decisions include:

1. exact meaning/behavioral distinction, if any, inside each accepted slash pair;
2. whether Network is persisted or contextual only;
3. Device and Equipment uniqueness scopes;
4. entity archive/delete behavior;
5. Container/Rack movement semantics;
6. Device movement semantics;
7. Equipment movement semantics;
8. CAS authority/ownership model;
9. BDFB aggregate interpretation;
10. PowerPath entity semantics;
11. identifier format/strategy;
12. exact parent deletion restrictions and lifecycle rules.

## 15. G2 exit criteria

G2 passes only when:

- ADR-001 reflects the accepted hierarchy;
- parent/child cardinalities are documented;
- Device and Equipment sibling semantics are preserved;
- lifecycle/movement invariants are explicit enough for persistence design;
- aggregate candidates are clear enough for G3;
- no persistence implementation is used to resolve a domain ambiguity;
- remaining external inputs are explicit rather than guessed.

Until then, **G3 persistence implementation is not authorized**.

## 16. Accepted G2 closure decisions

The following decisions are accepted and remove the remaining architecture-blocking ambiguity:

- lifecycle is `ACTIVE | ARCHIVED`; hard delete is exceptional;
- new domain identifiers use stable opaque UUIDv4 values;
- movement preserves identity;
- Container/Rack movement requires a valid unconflicted Position;
- Device and Equipment may move between compatible Container/Rack parents while preserving identity;
- Device and Equipment remain siblings;
- CAS is rack-owned authoritative occupancy state, not a topology node;
- BDFB is a specialized Device capability/type;
- PowerPath is an explicit aggregate;
- telemetry identity is a binding to Device/Equipment identity, not the identity itself;
- slash-pair concepts preserve variant semantics at one hierarchy level.

Detailed invariants are defined in `docs/domain/invariants.md`.

With these decisions, G3 may design persistence without using database structure to resolve domain ambiguity.
