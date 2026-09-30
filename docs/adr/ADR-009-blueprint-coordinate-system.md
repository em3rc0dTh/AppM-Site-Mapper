# ADR-009 — Blueprint Coordinate System

**Status:** Accepted  
**Gate:** G6

## Decision

Blueprint uses millimetres as its physical unit.

The canonical grid tile is exactly:

```text
600 mm × 600 mm
```

`A-1` maps to physical origin `x=0, y=0`.

Columns increase along X. Alphabetic rows increase along Y.

## Domain/UI separation

Polygon containment, coordinate conversion, snapping, collision detection and slot generation are pure domain functions.

React/SVG only renders the resulting spatial model.

## Rack footprint

Container/Rack width and depth are data-driven when declared. A 600 mm tile footprint is used only as a rendering/layout fallback when dimensions are absent; it is not persisted as invented physical data.

## Canvas authoring — 2026-09-30

Site, Room and Bay/Cluster boundaries are authored by pointer interaction on an SVG
canvas. The persisted schema remains `PhysicalPoint[]` / `PointMm[]` with `{x, y}`
in millimetres. There is no GeoJSON, lat/lon input or invented geographic anchor.
A blank editor's view envelope and grid are presentation only; they never become
an entity polygon. New spatial entities require a completed, valid boundary.

Pointer conversion uses the inverse SVG screen CTM, including the viewBox,
preserveAspectRatio letterboxing, viewport resizing, zoom and pan. View controls
change presentation state only. Existing vertices are loaded without snapping or
normalization; optional 600 mm snapping affects only explicitly drawn/moved points.
Clicking an edge inserts a point on that edge. Finish closes the draft without
repeating the first vertex. Clear, Undo and Cancel operate on local draft state.

One domain validator rejects malformed/non-finite points, duplicate vertices,
self-intersections, overlapping/backtracking edges and zero-area polygons.
Bounds are 3–256 vertices and ±1,000,000 mm per coordinate, consistent with the
existing layout payload limit. Whole-edge containment checks include concave
boundary contacts, not only vertex containment. Area is always polygon area
in mm² divided by 1,000,000 for m²; manual area is not authoritative.

Site/Room creation stores metadata and the drawn polygon in one insert.
`PUT /api/spatial/sites/:id/boundary` accepts `{polygon, version}` and performs
an atomic version-filtered replacement of an active Site. A stale version returns 409. Read remains `GET /api/topology/:id`.

Room/Bay edits, positions and rack footprints remain part of the existing atomic,
versioned Room layout transaction. The older Room polygon PUT now also requires
`version` and uses that same transaction and full layout validation, so it cannot
shrink the Room around existing inventory. Bay/Cluster variants are retained.
The generic Bay-create path checks containment and increments the Room version
in the same layout transaction to invalidate stale drafts.

Empty Position anchors and explicit Position moves are picked on the canvas and converted
to the canonical A-1 grid. New Rack anchors are assigned automatically from the Bay
top edge, left-to-right, using that same grid. Width/depth remain independent physical
dimensions, including multi-cell footprints. No operator coordinate text entry is
required. Existing positive grid coordinates remain the supported anchor range;
negative plane coordinates can describe boundaries but do not create negative-row
Position references.

Implementation recorded without running tests, typecheck, lint, browser checks or
build at the user's explicit request. This addendum does not certify acceptance.

## Bay frontage and rack depth — 2026-09-30

Rack placement is directional.

For a Bay, the surveyed polygon defines the rack **frontage capacity on X** and the
top reference edge. A rack is anchored to the Bay's top edge and new racks are
assigned from left to right on the canonical 600 mm grid.

The rack's declared width consumes Bay frontage. Therefore a 1200 mm-wide Bay may
contain two 600 mm racks, while two 900 mm racks cannot fit. Width is never allowed
to cross the Bay's X envelope.

Rack depth extends in positive Y from the Bay top edge and is not required to remain
inside the Bay polygon. This represents cabinets that are deeper than one 600 mm
Bay/grid row. The complete rack rectangle must still remain inside the Room boundary.

Depth beyond the Bay footprint consumes physical clearance below the Bay. It is
valid only while that projected rack footprint does not overlap another Bay/Cluster.
For example, a 900 mm or 1200 mm deep rack may use available aisle space below a
600 mm-deep Bay, whereas a 1500 mm rack is rejected when the next Bay begins before
that depth can clear.

This rule is intentionally asymmetric:

- X controls Bay capacity.
- Y controls downstream physical clearance.
- racks start at the Bay top edge;
- new racks are packed left-to-right;
- arbitrary rack Y placement is not a supported operation;
- rack depth never changes the persisted Bay polygon.

The Room boundary, other Bay polygons and existing rack footprints remain hard
collision constraints.
