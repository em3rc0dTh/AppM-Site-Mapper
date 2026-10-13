# Focused Equipment physical presentation — implementation receipt

**Contract:** [Equipment Composition Presentation Contract v1.0](./equipment-composition-presentation-contract-v1.0.md)  
**Canonical domain:** Device → Equipment*; each Equipment owns its own AccessPort*  
**Implementation:** `src/components/equipment/physical-equipment-diagram.tsx`  
**Projection:** `src/modules/topology/application/equipment-composition-projection.ts`

## Source of truth

The renderer reads `Equipment.children[]`, `childMode`, `presentation` and
`accessPorts[]`. It neither creates Equipment nor derives Access Port identities
from model names, advertised port counts or template display settings.

- `POSITIONAL` indexes are physical identities (zero-based internal, one-based UI).
- `DYNAMIC` items are child Equipment without fabricated empty positions.
- `presentation.maxPerLine` is a maximum, never a physical capacity.
- `presentation.direction` changes ordering without reordering `children[]`.
- `AUTO` normally summarizes more than four dynamic children. Focused positional
  Equipment up to 96 positions may expose its slots; extremely large sets summarize.
- `SUMMARY` collapses; `INLINE` expands with incremental display for large arrays.

## Focus depth

The focused Equipment is the only node whose direct children become the editable
position / composition view. Each immediate child becomes a navigable Equipment box.
A child preview may show names for at most four grandchildren, but a child with
more than four physical positions remains a summary. It never renders 24/48
descendant positions in the parent view. Drill-down changes focus by navigating to
the actual `/device/{equipmentId}` page.

## Access Ports

The `PHYSICAL TERMINALS` faceplate contains only ACTIVE Access Ports recorded on
the focused Equipment. `POWER`, `NETWORK`, `DATA`, `CONTROL`, `GROUND` and
`CUSTOM` all use the same terminal component. Connector/protocol are presented
only if recorded. The terminal is selectable and exposes its recorded data.

Port editing is handled by the generic Equipment Access Port editor in the inspector.
The separate Power Contract editor continues to manage the A/B input contract.
Clicking a terminal does not create a Power Path or a network link.

## Representative acceptance cases

| Focus                                        | Expected presentation                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| BDFB Chassis (2 Frames)                      | Two navigable Frame boxes; small Panel previews, no exploded breakers    |
| BDFB Frame (2 Panels)                        | Two Panel boxes with capacity summaries                                  |
| BDFB Panel (24 positions)                    | Focused numbered positional grid; occupied slots link to their Equipment |
| BDFB Circuit Breaker                         | Leaf faceplate with only its recorded Access Ports                       |
| Network Switch Chassis (0 children, 2 ports) | Recorded DATA and POWER terminals; no invented 48 RJ45 ports             |
| Network Board (48 positions)                 | Focused grid; a parent sees only its board summary                       |
| 1000-position Equipment                      | Summary first, incremental display when explicitly expanded              |

## Limitations

No physical front-panel dimensions or port XY coordinates have been contracted,
so this is an **abstract but faithful front-facing arrangement**, not a
manufacturer-specific 1:1 product faceplate. Cabling/network-link creation,
rear-face geometry, and assembly auto-generation remain distinct concerns.

## Verification

Unit coverage: `tests/unit/equipment-physical-composition.test.tsx`, with
repository CI used for typecheck, lint, formatting, tests and production build.
Browser-device visual acceptance must still be confirmed against a running
customer instance, because repository CI does not prove actual viewport rendering.
