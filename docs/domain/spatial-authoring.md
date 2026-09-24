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

- create the topology node first and draw an irregular footprint in the Structure workspace;
- optionally seed a rectangular footprint using width, depth, X and Y values.

The rectangle is an authoring convenience, not a domain assumption. After creation, the persisted polygon remains the spatial authority and may be edited into any valid irregular shape.

When the parent Site already has a persisted boundary, a Structure footprint must remain fully contained by that Site boundary. The same pure Spatial-domain containment rule drives UI feedback and server-side persistence validation.

Physical size is derived from polygon geometry:

- area;
- perimeter;
- bounding span (width × depth);
- individual segment lengths while editing.

No second authoritative Structure width/depth record is introduced, avoiding divergence between scalar dimensions and polygon geometry.

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

This keeps the model aligned with the canonical topology while preserving the modular boundary:

```text
UI
→ spatial API
→ SpatialService
→ TopologyRepository
```

## Non-goals for v0.1

This slice does not claim:

- CAD-grade constraints;
- arbitrary Bézier curves;
- geodetic/survey coordinate transformation;
- multi-user collaborative editing;
- automatic room boolean operations;
- Level polygon ownership.

Those require explicit follow-up decisions rather than silent expansion of the domain.
