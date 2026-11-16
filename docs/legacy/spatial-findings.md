# Legacy Spatial Findings

Status: G1 evidence for the future Blueprint Engine contract.

## Confirmed implementation evidence

`components/room/room-dashboard.tsx` contains a constant:

`TILE_SIZE = 600`

with an inline comment identifying the unit as millimetres.

The same module contains logic or symbols for:

- point-in-polygon testing;
- polygon points;
- SVG coordinate conversion;
- room bounding boxes;
- grid generation;
- alphanumeric grid coordinates;
- snapping to grid;
- tile centres;
- rack width and height;
- empty-space/slot generation;
- zoom and drag interaction.

This confirms that the legacy Blueprint is more than a visual mock: spatial rules and rendering are co-located in one client component.

## MK1 preservation boundary

Preserve as ALGORITHM/DOMAIN candidates:

- physical 600 mm tile semantics;
- coordinate conversion;
- polygon containment;
- snapping;
- placement;
- occupied versus available spatial regions;
- physical rack footprint semantics.

Preserve as UX candidates:

- room map interaction;
- zoom/pan behavior;
- rack/slot visualization;
- editing controls where still required.

Reject as architecture:

- geometry embedded in a large React component;
- direct coupling between spatial calculations and CRUD/UI state;
- implicit coordinate rules that exist only as rendering math.

## G2/G6 questions still open

- canonical coordinate origin;
- row/column naming convention;
- whether all placement must snap to 600 mm cells;
- legal partial-cell footprints;
- collision rules for physical overhang/depth;
- polygon validity constraints;
- aisle semantics;
- unit conversion policy;
- persisted versus derived spatial state.

No answer is assumed here.
