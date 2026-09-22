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
