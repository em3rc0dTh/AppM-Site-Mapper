# Equipment Composition Presentation Contract

**Product:** AppM Site Mapper  
**Scope:** Equipment recursive composition UI  
**Status:** APPROVED FOR IMPLEMENTATION  
**Contract version:** Presentation Contract v1.0  
**Domain dependency:** Domain Contract v1.2  
**Date:** 2026-10-09

---

## 1. Purpose

This document defines how Site Mapper must visually present recursive physical Equipment composition.

It does **not** redefine the physical domain model.

The canonical physical model remains:

```text
Device
└── Equipment
    ├── AccessPort*
    └── Equipment*
        ├── AccessPort*
        └── Equipment*
            └── ...
```

The purpose of this contract is to prevent a technically correct recursive hierarchy from becoming
visually unusable when an Equipment contains many children.

Examples include:

- a BDFB Chassis containing Frames;
- a Frame containing Panels;
- a Panel containing 24 Circuit Breaker positions;
- a network chassis containing boards and power supplies;
- a network board containing dozens of pluggable modules.

The renderer must preserve domain truth while controlling visual density.

---

## 2. Core separation

Site Mapper must keep these concerns independent:

```text
PHYSICAL COMPOSITION
Equipment.children[]
Equipment.childMode
Equipment.parentEquipmentId

PRESENTATION
direction
maxPerLine
childrenVisibility
responsive projection
drill-down policy
```

Therefore:

> Presentation metadata never changes physical parent/child relationships.

And:

> A UI layout decision must never create a second BDFB-specific or Switch-specific domain model.

---

## 3. Canonical presentation input

A reusable Equipment template may declare presentation metadata:

```json
{
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 2,
    "childrenVisibility": "AUTO"
  }
}
```

The same presentation metadata may be snapshotted into an Equipment instance when instantiated from
Warehouse.

### 3.1 direction

Allowed values:

```text
ROW
COLUMN
```

`ROW` means:

```text
1 2 3
4 5 6
```

when `maxPerLine = 3`.

`COLUMN` means:

```text
1 4
2 5
3 6
```

when `maxPerLine = 3`.

The user-facing UI should call this simply:

```text
Direction
- Row
- Column
```

Do not expose CSS terminology such as flex direction, grid-template-columns, row-major or
column-major to normal users.

---

## 4. maxPerLine

`maxPerLine` is a **presentation maximum**, not a physical-capacity field.

Examples:

```json
{
  "direction": "ROW",
  "maxPerLine": 2
}
```

means:

```text
A B
C D
```

for four visible children.

For a 24-position Panel:

```json
{
  "direction": "ROW",
  "maxPerLine": 12
}
```

may present:

```text
01 02 03 04 05 06 07 08 09 10 11 12
13 14 15 16 17 18 19 20 21 22 23 24
```

when sufficient viewport width exists.

### 4.1 AUTO

The client must be able to choose an automatic mode:

```json
{
  "maxPerLine": null
}
```

Meaning:

> Let Site Mapper choose the maximum visible items per line for the available viewport.

The UI should label this as:

```text
Max items per row: Auto
```

or:

```text
Max items per column: Auto
```

depending on `direction`.

### 4.2 maxPerLine is not rigid

A configured maximum does not override responsive constraints.

Example:

```text
Template maxPerLine = 12

Wide desktop  → up to 12
Laptop        → fewer if required
Tablet        → fewer if required
Mobile        → fewer if required
```

The configured value is an upper bound.

The renderer must not force overflow merely to satisfy the configured maximum.

---

## 5. Physical capacity remains independent

For POSITIONAL Equipment:

```text
children.length
=
physical child-position capacity
```

Example:

```json
{
  "childMode": "POSITIONAL",
  "childCapacity": 24,
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 12
  }
}
```

means:

```text
physical capacity = 24
visual maximum per row = 12
```

These values are not interchangeable.

Do not introduce independent `rows` and `columns` as competing sources of truth.

Derived row count is:

```text
ceil(visibleItemCount / effectiveMaxPerLine)
```

This avoids invalid combinations such as:

```text
capacity = 24
rows = 4
columns = 5
```

where the visual contract could only represent 20 positions.

---

## 6. childrenVisibility

Allowed values:

```text
AUTO
INLINE
SUMMARY
```

### AUTO

Site Mapper chooses the appropriate visual density.

This is the default.

### INLINE

The immediate children may be rendered directly in the focused Equipment composition view.

### SUMMARY

The Equipment appears as one visual unit with occupancy/capacity summary and an explicit action to
open its composition.

Example:

```text
┌────────────────────┐
│ PANEL A1           │
│                    │
│ 24 positions       │
│ 8 occupied         │
│ 16 available       │
│                    │
│ OPEN →             │
└────────────────────┘
```

`SUMMARY` does not hide or remove domain children.

It only controls visual expansion.

---

## 7. Default automatic visual-density policy

The initial renderer policy is:

```text
0 children
→ leaf presentation

1–4 immediate children
→ inline presentation is allowed

more than 4 immediate children
→ summary/drill-down presentation by default
```

This value is a renderer policy, not a physical domain invariant.

A future product-level setting may alter the threshold without migrating Equipment data.

---

## 8. Focus-depth rule

Site Mapper must not recursively expand the entire Equipment tree in one screen.

Canonical rule:

> The focused Equipment may show its immediate composition. Descendants shown as previews do not
> recursively expand all of their own children.

Example BDFB:

```text
BDFB-01

┌──────────────────── CHASSIS ────────────────────┐
│                                                 │
│ ┌──────── FRAME A ────────┐ ┌──── FRAME B ───┐ │
│ │ PANEL A1    PANEL A2    │ │ B1         B2  │ │
│ │ 24 slots    24 slots    │ │ 24         24  │ │
│ └─────────────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────┘
```

The Chassis view must not expand all 96 Circuit Breaker positions.

When the user opens `Panel A1`, the Panel becomes the focus and its 24 positions may then be
rendered.

This produces progressive navigation:

```text
DEVICE
  ↓
CHASSIS
  ↓
FRAME
  ↓
PANEL
  ↓
CIRCUIT_BREAKER
  ↓
ACCESS_PORT
```

without changing the underlying recursive Equipment graph.

---

## 9. BDFB example

### Chassis

```json
{
  "kind": "EQUIPMENT",
  "equipmentType": "CHASSIS",
  "childMode": "POSITIONAL",
  "childCapacity": 2,
  "allowedChildTypes": ["FRAME", "PANEL"],
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 2,
    "childrenVisibility": "AUTO"
  }
}
```

Expected focused presentation:

```text
┌──────────────┬──────────────┐
│ FRAME A      │ FRAME B      │
└──────────────┴──────────────┘
```

### Frame

Where the represented hardware has exactly two Panel positions:

```json
{
  "kind": "EQUIPMENT",
  "equipmentType": "FRAME",
  "childMode": "POSITIONAL",
  "childCapacity": 2,
  "allowedChildTypes": ["PANEL"],
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 2,
    "childrenVisibility": "AUTO"
  }
}
```

Expected focused presentation:

```text
┌──────────────┬──────────────┐
│ PANEL A1     │ PANEL A2     │
└──────────────┴──────────────┘
```

### Panel

```json
{
  "kind": "EQUIPMENT",
  "equipmentType": "PANEL",
  "childMode": "POSITIONAL",
  "childCapacity": 24,
  "allowedChildTypes": ["CIRCUIT_BREAKER"],
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 12,
    "childrenVisibility": "AUTO"
  }
}
```

In a parent preview, the Panel remains summarized.

When Panel is the focused Equipment, the renderer may show all 24 positions.

---

## 10. Network Element example

The same renderer must support:

```text
DEVICE(NETWORK_ELEMENT)
└── EQUIPMENT(CHASSIS)
    ├── EQUIPMENT(POWER_SUPPLY)
    ├── EQUIPMENT(POWER_SUPPLY)
    ├── EQUIPMENT(CONTROLLER_BOARD)
    └── EQUIPMENT(NETWORK_BOARD)
        ├── EQUIPMENT(PLUGGABLE_MODULE)
        ├── ...
        └── EQUIPMENT(PLUGGABLE_MODULE)
```

A Chassis with four immediate children may show all four inline.

A Network Board with 48 module positions should normally render as a summary when viewed from the
Chassis.

When the Network Board becomes the focus, its module positions may be rendered according to its own
presentation settings.

No network-specific composition renderer is required.

---

## 11. Generic renderer requirement

The implementation must use one generic recursive Equipment composition renderer.

Do not introduce presentation-domain entities such as:

```text
BdfbLayout
FrameLayout
PanelLayout
BreakerGrid
SwitchLayout
NetworkBoardLayout
```

as competing composition models.

The renderer input is:

```text
Equipment
+
immediate children
+
presentation metadata
+
viewport constraints
```

Equipment type may influence labels/icons, but not create a second physical hierarchy.

---

## 12. Warehouse responsibility

Warehouse may define reusable presentation defaults together with Equipment defaults.

Conceptually:

```json
{
  "kind": "EQUIPMENT",
  "equipmentType": "PANEL",
  "childMode": "POSITIONAL",
  "childCapacity": 24,
  "presentation": {
    "direction": "ROW",
    "maxPerLine": 12,
    "childrenVisibility": "AUTO"
  }
}
```

When instantiated, the Equipment may retain a versioned snapshot of those presentation defaults.

A later template update must not silently rewrite already-instantiated physical Equipment.

---

## 13. Assembly generation is a separate concern

This contract does not imply that a Chassis template automatically creates Frames, Panels or
Breakers.

Keep these concepts separate:

```text
allowedChildTypes
= which Equipment types MAY be installed

presentation
= how immediate children are displayed

future defaultChildren / assembly recipe
= which Equipment instances SHOULD be generated automatically
```

Automatic recursive assembly generation requires its own explicit contract.

It must not be smuggled into `allowedChildTypes` or presentation metadata.

---

## 14. Rack presentation remains separate

Internal Equipment composition does not control Rack CAS.

```text
RackPlacement
= physical Rack occupation

Equipment presentation
= internal composition visualization
```

Nested Equipment must not consume additional Rack U merely because it is displayed inside a
Chassis.

Template `sizeU` may be used as a recommended mounting value, but actual CAS occupation remains an
explicit Rack placement operation.

---

## 15. Telemetry remains separate

Presentation metadata must not contain MQTT identities.

Do not encode:

```text
EMU-BFDB-01
0_1_8
```

inside presentation fields.

Telemetry remains:

```text
MQTT
  ↓
TelemetryBinding
  ↓
Device / Equipment / AccessPort
```

Equipment serial numbers remain physical inventory metadata and must not be overloaded as an MQTT
binding mechanism.

---

## 16. Responsive behavior

The renderer must preserve:

1. hierarchy clarity;
2. readable labels;
3. interaction targets;
4. no horizontal overflow caused solely by `maxPerLine`;
5. deterministic ordering;
6. slot identity for POSITIONAL Equipment.

If viewport constraints reduce the effective number of items per line, physical slot numbering and
order must remain unchanged.

Example:

```text
configured maxPerLine = 12

desktop:
01 02 03 04 05 06 07 08 09 10 11 12
13 14 15 16 17 18 19 20 21 22 23 24

mobile:
01 02
03 04
05 06
...
23 24
```

The data remains the same 24-position Equipment.

---

## 17. Client-facing configuration

Normal users should see a compact configuration:

```text
Layout direction
[ Row ▼ ]

Max items per row
[ Auto ▼ ]

Child display
[ Auto ▼ ]
```

When Direction = Column:

```text
Max items per column
[ Auto ▼ ]
```

Avoid exposing implementation terminology.

---

## 18. Acceptance scenarios

### Scenario A — BDFB Chassis

Given:

```text
2 Frame children
direction = ROW
maxPerLine = 2
```

Then:

- both Frames are visible inline;
- no Panel breaker positions are recursively exploded;
- each Frame remains openable.

### Scenario B — Frame with two Panels

Given:

```text
2 Panel positions
direction = ROW
maxPerLine = 2
```

Then:

- both Panels are visible side by side where viewport allows;
- each Panel shows capacity/occupancy summary;
- opening a Panel changes focus.

### Scenario C — Panel with 24 positions

Given:

```text
childCapacity = 24
direction = ROW
maxPerLine = 12
```

Then:

- parent previews do not render 24 Breaker cards;
- focused Panel view may render all 24 positions;
- desktop uses at most 12 items per row;
- narrower viewports may reduce the effective number;
- position numbering remains stable.

### Scenario D — Network Board with 48 positions

Then:

- Chassis view shows the board as summary;
- opening Network Board reveals the position view;
- no special Network Board renderer is required.

### Scenario E — 100 or 1000 immediate children

Then:

- the parent view remains usable;
- AUTO defaults to summary/drill-down rather than recursively expanding the full set;
- domain children remain intact and queryable.

---

## 19. Non-goals

This contract does not define:

- recursive template materialization;
- multi-position child occupancy;
- BDFB-specific domain entities;
- MQTT binding creation;
- AccessPort CRUD;
- rack CAS generation;
- pagination/virtualization implementation details.

Those concerns remain separate.

---

## 20. Final rule

> Site Mapper stores physical composition as generic recursive Equipment. Presentation controls only
> how the focused Equipment exposes its immediate children. Direction and maximum items per line are
> simple client-facing hints; responsive layout remains authoritative. Large child sets collapse to
> summaries and are explored through drill-down rather than recursively exploding the entire
> physical tree in one view.
