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
- ContainerCluster/Bay physical extent is exactly the union of its authored 600 × 600 mm Position slots; Rack/Container footprints do not resize the cluster.
- an empty ContainerCluster/Bay remains visible as `UNPLACED`; no synthetic physical coordinates are invented.

## ContainerCluster / Bay run contract

A ContainerCluster/Bay is not an arbitrary freeform polygon.

Its physical footprint is a straight run of canonical 600 × 600 mm slots:

```text
HORIZONTAL: 600 mm high × (N × 600 mm) long
VERTICAL:   600 mm wide × (N × 600 mm) long
```

Authoring is start/end based:

1. create the ContainerCluster/Bay topology entity;
2. open its Room Blueprint;
3. click the first slot;
4. click the final slot;
5. Site Mapper locks the run to horizontal or vertical;
6. saving materializes every inclusive Position between both endpoints.

The generated Positions are the cluster slot list. Empty slots remain valid Positions and may later receive a Container/Rack or remain unused.

The persisted cluster run records:

- start grid coordinate;
- end grid coordinate;
- orientation (`HORIZONTAL | VERTICAL`).

Slot count and physical extent are derived from the inclusive Position run and the canonical 600 mm tile size.

Rules:

- every generated slot must fit fully inside the Room polygon;
- a cluster run cannot overlap Positions owned by another active ContainerCluster/Bay in the same Room;
- changing a run cannot remove a Position that already contains active infrastructure;
- the UI must not invent standalone cluster coordinates before a run exists.

## Persistence

Room/Substructure owns its polygon.

Position owns its alphanumeric grid coordinate. Positions under ContainerCluster/Bay are materialized from the authored linear run.

Container/Rack owns its physical dimensions.

Blueprint view state such as zoom or pan is not domain persistence.

## Rendering

The UI receives:

- room polygon;
- ContainerCluster/Bay placement state (`PLACED` only after an authored run, otherwise `UNPLACED`);
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
