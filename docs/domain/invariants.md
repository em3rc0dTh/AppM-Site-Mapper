# Site Mapper MK1 — Domain Invariants

**Status:** ACCEPTED  
**Gate:** G2

These invariants are authoritative inputs for persistence and application design.

## Identity

- Every persisted domain entity has an opaque stable ID.
- IDs do not encode hierarchy, names or physical coordinates.
- Renaming or moving an entity does not change its ID.
- Legacy identifiers may be retained only as migration metadata.

## Lifecycle

Canonical lifecycle states are:

```text
ACTIVE
ARCHIVED
```

Hard delete is not a normal product operation.

Rules:

- archiving preserves identity and historical references;
- an entity with active descendants cannot be archived by a non-cascade operation;
- subtree archival must be an explicit use case;
- restore must validate that required parents are active;
- hard delete is restricted to migration/test/administrative cleanup where no protected references remain.

## Topology parentage

The accepted topology is strict:

```text
Network
→ Site
→ Structure
→ Level
→ Room / Substructure
→ ContainerCluster / Bay
→ Position
→ Container / Rack
→ Device | Equipment
```

Internal Device structure is:

```text
Device
→ Shelf
→ Frame
→ Panel
→ Breaker / Holder
```

No entity may silently skip a required hierarchy level.

## Slash-pair variants

Slash pairs occupy one hierarchy level but preserve product distinction as a variant:

- Room variant: `ROOM | SUBSTRUCTURE`
- ContainerCluster variant: `CONTAINER_CLUSTER | BAY`
- Container variant: `CONTAINER | RACK`
- Panel endpoint variant: `BREAKER | HOLDER`

The variant does not change parent/child rank.

## Movement

Movement preserves identity.

### Container / Rack

A Container/Rack may move from one Position to another only when:

- target Position exists and is ACTIVE;
- target Position is not already occupied by an incompatible Container/Rack;
- spatial placement is valid;
- the move does not violate accepted Blueprint collision rules.

### Container / Rack physical footprint

ContainerCluster/Bay Positions are 600 × 600 mm placement slots.

For a Container/Rack anchored to a Position:

- the Position is the stable topology parent and physical anchor;
- footprint `width` is aligned with the ContainerCluster/Bay run;
- width consumes `ceil(width / 600 mm)` consecutive Positions from the anchor toward the run end;
- width may not extend beyond the remaining Positions in that run;
- any Position touched by that along-run width is unavailable to another Container/Rack;
- footprint `depth` projects perpendicular to the run and is not capped at 600 mm;
- depth may exceed one slot (for example 600 × 900, 900 × 900 or 900 × 1200 mm) only while the full footprint remains inside the Room/Substructure polygon;
- Container/Rack footprints may not overlap;
- for a vertical run the footprint rotates with the run: width remains the along-run dimension and depth remains perpendicular;
- optional physical `height` is independent of the 2D Blueprint footprint and does not consume additional Positions.

Occupancy beyond the anchor Position is derived spatial occupancy; it does not create extra topology parents for the Container/Rack.

### Device and Equipment

Device and Equipment are siblings.

Either may move between compatible Container/Rack parents while preserving identity.

For a Device using U-space:

- destination capacity must be valid;
- destination occupancy must not overlap;
- CAS transition must succeed atomically with the move.

Equipment that does not consume U-space is not forced into CAS semantics.

## CAS ownership

CAS is authoritative rack-occupancy state owned by the `Container / Rack` aggregate when the variant/capabilities support rack U-space.

CAS is not an independent topology node.

States remain:

```text
AVAILABLE
RESERVED
EQUIPPED
```

A CAS range records the rack U interval and optional clearance/occupant references.

CAS operations must be deterministic and invariant-safe.

## Device and Equipment

- Device and Equipment have equal topology rank.
- Equipment is never implicitly nested under Device.
- Device may expose richer internal chassis/electrical structure.
- Equipment may still participate in telemetry and PowerPath where its capabilities permit.

## BDFB

BDFB is a specialized `Device` type/capability.

Its internal structure is owned by the Device aggregate:

```text
Device(BDFB)
→ Shelf
→ Frame
→ Panel
→ Breaker / Holder
```

Creating or editing BDFB internals must not be coupled to rack-placement persistence.

## PowerPath

PowerPath is an explicit aggregate representing an electrical relationship.

It has:

- stable ID;
- source endpoint;
- target endpoint;
- feed designation where applicable;
- lifecycle state.

Endpoints reference accepted Device/Equipment/internal electrical identities.

PowerPath is not derived solely from UI labels.

## Telemetry identity

Device/Equipment domain identity is distinct from telemetry-source identity.

A domain entity may have zero or more telemetry bindings.

Changing a telemetry topic/source identifier does not change the domain entity ID.

## Mutation rule

Every mutation must be an explicit application use case.

Generic runtime operations such as `saveEntity(type, any)` or caller-selected collection writes are prohibited.
