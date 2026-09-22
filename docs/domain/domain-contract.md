# Site Mapper MK1 — Canonical Domain Contract

**Gate:** G2 — Canonical Domain Contract  
**Status:** DRAFT / PROPOSED  
**Authority:** Binding only after G2 is sealed and merged into `main`.

## 1. Purpose

This contract defines the canonical business/domain language and invariants for Site Mapper MK1.

It intentionally does **not** define MongoDB collections, indexes, embedding strategy, Prisma models, route-handler shapes, React components or MQTT transport. Those belong to later gates.

G2 exists to ensure that persistence and implementation serve one domain instead of creating it accidentally.

## 2. Evidence boundary

The following are confirmed legacy product concepts:

- hierarchical physical topology;
- physical Site, Structure and Level concepts;
- room/substructure context;
- grouped physical rack/container placement;
- positions/grid coordinates;
- rack/container equipment;
- devices with identity and category;
- rack capacity in U;
- CAS occupancy states;
- Blueprint spatial geometry;
- BDFB internal hierarchy;
- power-path relationships;
- realtime telemetry identity;
- user/role concepts.

Legacy persistence names, collection aliases and component boundaries are not domain authority.

## 3. Canonical topology — proposed

The proposed MK1 hierarchy is:

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room
                └── Zone
                    └── Position
                        └── Rack
                            └── Device
```

### Decision state

- `Network`: PROPOSED as topology root/context, not necessarily a persisted entity.
- `Site`: ACCEPT-CANDIDATE.
- `Structure`: ACCEPT-CANDIDATE.
- `Level`: ACCEPT-CANDIDATE.
- `Room`: PROPOSED canonical replacement for legacy Room/Substructure ambiguity.
- `Zone`: OPEN. Candidate replacement for legacy Cluster/ContainerCluster/Bay ambiguity.
- `Position`: ACCEPT-CANDIDATE.
- `Rack`: PROPOSED canonical replacement for operational legacy Container where the physical object is rack-like.
- `Device`: ACCEPT-CANDIDATE.

No OPEN or PROPOSED noun becomes permanent runtime vocabulary until ADR-001 is accepted.

## 4. Core aggregate candidates

### Site

Represents one managed physical site.

Candidate responsibilities:

- identity and human-readable name;
- physical/geographic metadata where required;
- structural children;
- lifecycle state.

Candidate invariant:

> A Structure belongs to exactly one Site.

### Structure

Represents a physical building or managed structure inside a Site.

Candidate invariant:

> A Structure belongs to exactly one Site.

### Level

Represents a physical floor/level inside a Structure.

Candidate invariant:

> A Level belongs to exactly one Structure.

### Room

Represents an enclosed or operational physical area inside a Level.

Confirmed behavior evidence includes polygon/spatial context.

Candidate invariants:

- Room belongs to exactly one Level.
- A Room may define a valid physical boundary/polygon.
- Spatial children must resolve inside the Room's accepted spatial model.

### Zone

Working term for a grouped physical region inside a Room.

This is deliberately **OPEN** because legacy evidence uses Cluster, ContainerCluster and Bay inconsistently.

Questions to resolve before acceptance:

- Is Zone required at all?
- Is Bay a distinct physical construct rather than a grouping?
- Can a Position belong directly to a Room?
- Is grouping optional?

### Position

Represents an addressable physical placement location in a spatial context.

Candidate responsibilities:

- coordinate/grid address;
- occupancy eligibility;
- association with Room or Zone.

Candidate invariants:

- a Position has one canonical parent spatial context;
- a Position cannot simultaneously host incompatible physical occupants;
- coordinates must obey the accepted Blueprint coordinate contract.

### Rack

Working canonical term for the rack-like physical container that owns U capacity.

Candidate responsibilities:

- physical dimensions;
- U capacity;
- placement;
- occupancy/CAS state;
- association to devices.

Candidate invariants:

- rack U capacity is positive;
- rack placement must be spatially valid;
- device occupancy cannot overlap;
- rack capacity cannot be exceeded.

### Device

Represents independently identifiable managed equipment.

Candidate responsibilities:

- stable identity;
- serial/category/specification data;
- placement association;
- operational status;
- telemetry identity mapping where applicable.

Strong proposed invariant:

> Device identity survives placement changes. Moving a Device does not create a new Device.

## 5. Rack occupancy / CAS domain

Confirmed legacy states:

```text
AVAILABLE
RESERVED
EQUIPPED
```

G2 treats CAS as a domain concept but does not yet decide whether CAS is:

- persisted authoritative state;
- a value object owned by Rack;
- derived occupancy state;
- a separate aggregate.

Required G7 invariants already known:

- U ranges must be valid;
- occupied ranges cannot overlap;
- capacity cannot be exceeded;
- clearance is explicit;
- mount/split/free are deterministic;
- physical size and reserved size are not silently conflated.

Persistence representation remains a G3/G7 decision.

## 6. Device internal structure / BDFB

Confirmed product hierarchy:

```text
Device
└── Shelf
    └── Frame
        └── Panel
            └── Holder / Breaker
```

G2 candidate interpretation:

- `Device` is the externally identifiable aggregate root.
- Shelf, Frame, Panel and Holder/Breaker are internal physical/electrical structures unless later evidence requires independent identity/lifecycle.
- BDFB is a specialized Device capability/type, not a separate topology root.

This remains PROPOSED until G9 requirements are reconciled.

## 7. Power domain

Confirmed product concepts:

- source device;
- panel;
- breaker;
- target equipment/device;
- A/B provisioning;
- source-to-target Power Path.

G2 establishes the principle:

> Electrical topology is a domain relationship and must not be inferred solely from UI state.

Still OPEN for G9:

- exact endpoint entity types;
- A/B semantics;
- redundancy rules;
- path lifecycle;
- whether PowerPath is aggregate/entity/value object;
- persistence versus derivation.

## 8. Telemetry identity

Telemetry is operational state, not the canonical identity of a Device.

Proposed rule:

```text
DeviceIdentity
    ↕ mapping
TelemetryIdentity
    ↕
external topic / serial / source identifier
```

A telemetry-source identifier may change without changing the domain Device identity unless an explicit business rule says otherwise.

Transport details remain G10.

## 9. Identity and roles

Confirmed legacy role vocabulary:

- Superadmin;
- Admin;
- Standard.

G2 does not accept their permissions.

G4 owns:

- authoritative session;
- permission model;
- password policy;
- lifecycle;
- audit;
- rate limiting.

Role names are evidence until ADR-007 is accepted.

## 10. Lifecycle principles — proposed

Unless a later accepted rule overrides them:

1. Identity and placement are separate concepts.
2. Moving an entity does not recreate its identity.
3. Parent-child deletion must never silently destroy operational descendants.
4. Archival is preferred over destructive deletion for entities with history or references.
5. Hard delete is reserved for explicitly safe cases.
6. All domain mutations must be representable as explicit use cases, not generic collection CRUD.

Exact archive/delete policy remains OPEN until persistence and operational requirements are known.

## 11. Identifier principles — proposed

Canonical domain IDs should:

- be opaque to presentation code;
- remain stable across movement/renaming;
- not encode hierarchy;
- not rely on legacy Mongo collection names;
- allow legacy IDs to be retained as migration metadata when required.

The concrete ID format belongs to ADR-005.

## 12. Domain boundary principles

### Topology

Owns hierarchy and placement context.

### Spatial

Owns coordinates, dimensions, geometry, polygons, snapping and collision rules.

### Inventory / Device

Owns equipment identity and specifications.

### Rack

Owns rack capacity and occupancy behavior.

### Power

Owns electrical topology and provisioning relationships.

### Telemetry

Owns normalization and association of external realtime state with domain identities.

### Identity

Owns users, sessions, roles and authorization concepts.

These are module boundaries inside one modular monolith, not microservices.

## 13. Explicitly rejected legacy domain leakage

The following are prohibited from becoming canonical domain concepts:

- duplicate PascalCase/lowercase collection names;
- caller-provided collection names;
- `any` payloads as business contracts;
- cookie-derived authority;
- UI component shape as persistence shape;
- Prisma schema being treated as truth merely because it exists;
- `Container` surviving only because a legacy route used that word;
- `Substructure` surviving only because a collection used that word.

## 14. Open Decision Register

G2 cannot be sealed until these are resolved or explicitly deferred with a safe boundary:

1. Room vs Substructure.
2. Cluster vs ContainerCluster vs Bay vs a new canonical Zone term.
3. Container vs Rack.
4. Whether grouping between Room and Position is mandatory.
5. Position parent rules.
6. Device identity uniqueness scope.
7. Entity archive/delete behavior.
8. Rack movement semantics.
9. Device movement semantics.
10. CAS authority/ownership model.
11. BDFB aggregate interpretation.
12. PowerPath entity semantics.
13. identifier format/strategy.

## 15. G2 exit criteria

G2 passes only when:

- ADR-001 canonical terminology is accepted;
- every canonical topology noun has one meaning;
- every legacy ambiguous noun maps to canonical/deprecated/removed;
- entity parent/child cardinalities are documented;
- core lifecycle/movement invariants are explicit;
- aggregate candidates are clear enough for G3 to design persistence;
- no persistence implementation is used to resolve a domain ambiguity;
- open external inputs are explicitly tracked rather than guessed.

Until then, this document is a controlled draft and **does not authorize persistence implementation**.
