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
- instantiate template into a Rack;
- instance-level name/serial/category override;
- versioned template snapshot on instance;
- Rack inventory provenance;
- one-off fallback;
- MongoDB and memory repositories.

Not yet implemented:

- edit/version-bump UI for an existing template;
- template archive/restore UI;
- bulk instantiation;
- automatic CAS mount during Warehouse instantiation (intentionally separate; CAS remains explicit).

These remain explicit follow-up gaps and are not implied by this ADR.
