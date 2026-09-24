# ADR-012 — Spatial Boundary Ownership and Authoring

**Status:** Accepted  
**Date:** 2026-09-23

## Context

The legacy Site Mapper documentation stores Site, Structure and Room geometry as point lists and describes a future graphical drafting canvas. MK1 already preserved Room polygons and the 600 mm Blueprint grid, but Site and Structure boundaries were still represented only through schematic UI shapes.

The product requirement is that physical boundaries are not assumed to be rectangles.

## Decision

MK1 supports polygon boundary ownership on:

- Site;
- Structure;
- Room/Substructure.

Level remains non-spatial in persistence until a separate domain decision establishes otherwise.

All coordinates are millimetres in the local coordinate space of the owning physical context.

Room operational tiles remain a separate derived coordinate system with a fixed 600 mm tile.

Polygon validity is enforced in the Spatial domain. React may provide interaction feedback but is not authoritative.

## Consequences

Positive:

- irregular physical footprints become first-class data;
- the same domain geometry can serve read and edit modes;
- legacy point-based geometry is preserved without importing legacy architecture;
- Site/Structure/Room authoring can share one interaction model.

Constraints:

- child geometry must be interpreted in the coordinate space documented for its parent;
- when a Site boundary exists, a Structure footprint must remain fully contained by it;
- rectangular Structure dimensions are an authoring convenience only; the persisted polygon remains authoritative;
- no geospatial projection is implied;
- Level does not gain an invented polygon;
- self-intersecting polygons are rejected.
