# ADR-010 — Virtual Warehouse templates and physical instances

## Status

Accepted for MK1 clean-room inventory flow.

## Context

Repeated physical Equipment models must not be re-entered for every Rack. Site Mapper needs a reusable physical catalog while Device remains the operational identity owned by Topology.

## Decision

Virtual Warehouse is a catalog separate from topology and CAS.

### Template

A Warehouse template describes reusable defaults:

- kind: EQUIPMENT only;
- template name;
- manufacturer;
- model;
- category;
- nominal rack size in U;
- physical width/depth;
- Equipment type;
- child mode: DYNAMIC or POSITIONAL;
- child capacity for POSITIONAL Equipment;
- optional allowed child Equipment types;
- notes.

Templates are stored in `warehouse_templates`.

### Physical instance

Selecting an Equipment template from a Rack creates a new Device identity in Topology and one root Equipment instance from the selected template. The Device owns the operational identity while the Equipment owns physical composition and rack occupancy. The workflow captures:

- name;
- serial number;
- optional instance category override;
- Device name and serial number;
- Device operational type;
- Rack context on the Device;
- Equipment template snapshot;
- lifecycle and pinned state.

The instance persists a template snapshot containing `templateId`, `templateVersion` and the reusable attributes that were active when the instance was created.

A later template change must not silently rewrite historical or installed instances.

### Recursive Equipment composition

Equipment is recursively composable. Every nested Equipment carries its immediate
`parentEquipmentId`; the parent carries the inverse relationship in `children`.

For `POSITIONAL` Equipment, the array length is the physical child capacity and each
array index is a slot. A free slot is represented by `null`; Site Mapper does not create
a runtime Holder entity.

Example:

```text
DEVICE BDFB-01
└── CHASSIS      children[0] = Shelf-01
    └── SHELF    children = [Frame-A, Frame-B]
        └── FRAME children = [Panel-A1, Panel-A2, null]
            └── PANEL children[0..23] = EquipmentId | null
```

Creation and movement of nested Equipment update both sides of the parent-child
relationship atomically. Archive is intentionally separate from physical composition:
a nested Equipment must first be detached or moved to the Device root, and Rack CAS
must be released when applicable. Restore reactivates that root Equipment and never
guesses a former parent or slot. No lifecycle placement metadata is hidden in generic
attributes.

A template may supply composition defaults, but it does not hardcode a product-specific
hierarchy into the topology domain.

### CAS

A template never occupies rack units.

A newly instantiated item is `UNMOUNTED` until CAS explicitly allocates and equips it. CAS continues to own physical U occupancy.

The flow is:

```text
Virtual Warehouse Equipment Template
        ↓ instantiate
RACK → DEVICE identity → root EQUIPMENT
                           ↓ UNMOUNTED
CAS reservation
        ↓ equip root Equipment
MOUNTED physical inventory
```

## UX

The main Rack action is `MOUNT FROM WAREHOUSE`.

`CREATE ONE-OFF` remains available for exceptional assets that do not justify a reusable template.

Virtual Warehouse is available as a first-class top-level application surface.

Template creation supports both the structured Form and raw JSON import. JSON import accepts
one template object or an array of up to 100 templates and routes every item through the
same Warehouse domain validation used by the Form. Dimensions may be supplied as
`dimensionsMm: { width, depth }` or the flat `widthMm/depthMm` fields.

## Current scope

Implemented:

- create template;
- list active templates;
- instantiate a root Equipment template into a Rack through a Device identity;
- recursively instantiate Equipment templates into explicit parent slots;
- positional child capacity represented by `children: (EquipmentId | null)[]`;
- atomic parent/child placement and movement;
- template defaults for Equipment type, child mode, capacity and allowed child types;
- instance-level name/serial/category/composition overrides;
- versioned template snapshot on instance;
- Rack inventory provenance;
- one-off recursive Equipment creation;
- MongoDB and memory repositories.

Not yet implemented:

- edit/version-bump UI for an existing template;
- template archive/restore UI;
- bulk instantiation;
- automatic CAS mount during Warehouse instantiation (intentionally separate; CAS remains explicit).

These are explicit product-scope exclusions for this milestone, not alternate domain
models or deferred integrity/security work. The implemented flows above are the only
authoritative runtime paths for Equipment composition.
