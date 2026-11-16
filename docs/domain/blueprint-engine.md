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
