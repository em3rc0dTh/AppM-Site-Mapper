# Blueprint Engine MK1

## Physical rules

- millimetres are canonical;
- tile size is 600 × 600 mm;
- A-1 is the logical grid origin;
- coordinates convert deterministically to millimetres;
- placement can snap to tile origins;
- room boundaries are polygons;
- rack footprints cannot collide;
- candidate placement must be within the room polygon;
- empty assignable tiles are derived, not persisted.

## Persistence

Room/Substructure owns its polygon.

Position owns its alphanumeric grid coordinate.

Container/Rack owns its physical dimensions.

Blueprint view state such as zoom or pan is not domain persistence.

## Rendering

The UI receives:

- room polygon;
- rack placement rectangles;
- derived assignable slots.

The UI does not perform authoritative collision or geometry calculations.

## Spatial authoring

MK1 preserves the legacy drafting intent without treating the legacy UI as architecture.

Boundary ownership is explicit:

- Site may own a polygon expressed in millimetres relative to its own drafting space.
- Structure may own a polygon expressed in millimetres relative to its Site.
- Room/Substructure owns a polygon expressed in millimetres relative to its Level/physical plan.
- Level remains a canonical hierarchy level and does not acquire a persisted polygon implicitly.

Authoring rules:

- polygon vertices are user-editable points, not derived width/height fields;
- polygons may be non-rectangular;
- self-intersecting polygons are invalid;
- duplicate consecutive vertices are invalid;
- read mode is the default;
- a newly created Room/Substructure with no polygon enters Draw mode on first writable entry;
- edit/draw mode is explicit and ends in Save or Cancel;
- Room editing can snap vertices to the canonical 600 mm grid;
- Site/Structure boundaries are not forced onto the Room tile grid;
- UI validation is advisory; the Spatial domain remains authoritative.
