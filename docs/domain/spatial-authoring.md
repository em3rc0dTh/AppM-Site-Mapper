# Spatial Authoring Engine MK1

**Status:** IMPLEMENTED IN FEATURE BRANCH  
**Scope:** Site, Structure and Room/Substructure boundary authoring

## Source-derived product intent

Legacy evidence defines polygons as relative spatial geometry and explicitly anticipates a graphical canvas for vectorizing rooms instead of typing coordinates manually. MK1 preserves that product intent while keeping geometry rules outside React.

## Boundary ownership

Persisted boundary geometry is supported for:

```text
Site
Structure
Room / Substructure
```

A Level remains part of the canonical hierarchy but does not receive a persisted polygon merely for UI convenience.

## Coordinate spaces

Two coordinate systems remain distinct.

### Boundary geometry

```text
polygon: [{ x, y }, ...]
```

Coordinates are millimetres relative to the owning physical context.

### Operational room grid

```text
A-1, A-2, B-1, ...
tile = 600 mm × 600 mm
```

The room grid is derived over the Room polygon. It is not the polygon itself.

## Authoring interaction contract

Read mode is the default.

Edit mode supports:

- drag vertex;
- insert a vertex from an edge midpoint;
- delete a selected vertex while preserving a minimum of three vertices;
- reset/cancel draft changes;
- save through an authenticated topology-write boundary;
- optional snapping to 600 mm for Room;
- pan and zoom without persisting viewport state.

Draw mode supports building a new boundary point-by-point, then closing it into an editable polygon.

Unsaved editing state warns before browser navigation or page unload.

## Structure authoring contract

A Structure remains a direct child of Site and owns a polygon footprint in Site-local millimetre coordinates.

Structure creation supports two equivalent entry paths:

- create the topology node first and, when no footprint exists, enter the Structure workspace directly in Draw mode to place the footprint vertices;
- optionally seed a rectangular footprint using width, depth, X and Y values, in which case the Structure opens with that persisted polygon already defined.

The rectangle is an authoring convenience, not a domain assumption. After creation, the persisted polygon remains the spatial authority and may be edited into any valid irregular shape.

When the parent Site already has a persisted boundary, a Structure footprint must remain fully contained by that Site boundary. The same pure Spatial-domain containment rule drives UI feedback and server-side persistence validation.

Physical size is derived from polygon geometry:

- area;
- perimeter;
- bounding span (width × depth);
- individual segment lengths while editing.

No second authoritative Structure width/depth record is introduced, avoiding divergence between scalar dimensions and polygon geometry.

## Progressive physical-authoring flow

Creation continues into the newly created child workspace rather than stopping at the parent CRUD panel.

The physical authoring sequence is:

```text
Network
→ Site                draw Site boundary when empty
→ Structure           draw Structure footprint when empty
→ Level               hierarchy / floor context only; no persisted polygon
→ Room/Substructure   draw Room boundary when empty, with optional 600 mm snapping
→ Bay/Cluster         mark first + last 600 mm slot; run locks horizontal/vertical
→ Position            inclusive slot list auto-materialized from the Bay/Cluster run
→ Container/Rack      physical width/depth + rack capacity where applicable
→ Device | Equipment  inventory identity mounted in the Container/Rack context
```

An empty Site, Structure or Room/Substructure with write permission enters Draw mode on first physical entry. Existing persisted boundaries always open in read mode and require an explicit Edit boundary action.

### ContainerCluster / Bay

ContainerCluster/Bay authoring is linear, not polygonal. The user marks a start slot and an end slot on the Room Blueprint. The run is constrained to one grid axis and every inclusive 600 × 600 mm slot becomes a persisted Position child.

A run may therefore contain empty Positions. Those are intentional capacity slots for future Container/Rack placement, not missing data.

To populate the run, select an available slot in the ContainerCluster/Bay workspace and create a Rack or Container directly in that Position. The Position remains the physical ownership boundary for the placed asset.

## Domain validation

A polygon is valid only when:

- it has at least three finite vertices;
- it has at least three unique vertices;
- adjacent vertices are not duplicates;
- its area is greater than zero;
- it does not self-intersect.

The server-side SpatialService is authoritative for persistence validation.

## Persistence

The topology repository stores the polygon on the owning topology node. No extra geometry collection is introduced in v0.1.

This keeps the model aligned with the canonical topology while preserving the modular boundary.

Boundary edits use:

```text
UI
→ spatial boundary API
→ SpatialService
→ TopologyRepository
```

Structure creation with an optional initial footprint uses the explicit authoring use case:

```text
UI
→ spatial Structure API
→ StructureAuthoringService
→ TopologyService + SpatialService
→ TopologyRepository
```

The generic topology POST does not own or validate polygon geometry.

## Non-goals for v0.1

This slice does not claim:

- CAD-grade constraints;
- arbitrary Bézier curves;
- geodetic/survey coordinate transformation;
- multi-user collaborative editing;
- automatic room boolean operations;
- Level polygon ownership.

Those require explicit follow-up decisions rather than silent expansion of the domain.
