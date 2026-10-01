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
                            └── Device
                                ├── Equipment
                                │   └── Equipment (...)
                                └── Shelf
                                    └── Frame
                                        └── Panel
                                            └── Breaker / Holder
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

This node owns the physical context in which Device is placed.

Rack-specific behavior such as U capacity and CAS applies to mounted Device identities. Equipment is not a direct rack/CAS occupant in the canonical model.

### Device

Direct child of Container/Rack.

Device is an independently identifiable managed object.

A Device may contain recursive managed Equipment and may also expose specialized internal physical/electrical structure:

```text
Device
├── Equipment
│   └── Equipment (...)
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

Device identity remains separate from placement identity.

Moving a Device does not create a new Device.

### Equipment

Direct child of a Device or another Equipment node.

Equipment is a managed component of a Device assembly and may recurse to represent chassis/module/board/pluggable-component relationships without inventing additional topology kinds.

Canonical relationship:

```text
Container / Rack
└── Device
    └── Equipment
        └── Equipment (...)
```

Equipment does **not** occupy Rack CAS directly. Its physical rack position is inherited through its mounted Device ancestor.

Legacy records where Equipment is a direct child of Container/Rack are preserved as migration evidence and must be reported as ambiguous; runtime code must not invent a Device owner for them.

Equipment may expose explicit AccessPorts, including `POWER` ports, and may participate in telemetry and PowerPath according to its declared capabilities.

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

The canonical electrical relationship is explicit and port-addressed:

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

Rules:

- a new PowerPath source must resolve to a concrete `BREAKER`;
- a new PowerPath target must resolve to a concrete `AccessPort` whose kind is `POWER`;
- Feed A and Feed B are independent traces and may originate from the same BDFB or different BDFBs;
- a target POWER port may declare its feed identity; a conflicting PowerPath feed is invalid;
- breaker telemetry remains associated with the source circuit/raw telemetry point, not copied onto the target;
- redundancy is not inferred from the existence of two paths. It is evaluated only when the target declares an explicit policy such as `A_B_REQUIRED`;
- entity-only legacy targets remain readable for migration/diagnostics and are marked ambiguous rather than assigned an invented port;
- one breaker may have multiple explicitly modeled downstream loads when the physical model requires it.

Domain principle:

> Electrical topology is an explicit domain relationship and must not be inferred solely from UI state.

The Full Power Trace is a projection over these domain facts. It reports topology validity, telemetry availability and redundancy-policy satisfaction as separate concerns.
