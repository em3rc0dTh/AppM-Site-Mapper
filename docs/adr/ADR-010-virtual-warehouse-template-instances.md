# ADR-010 — Virtual Warehouse templates and physical instances

## Status

Accepted for MK1 clean-room inventory flow.

## Context

Repeated Device and Equipment models must not be re-entered for every Rack. Site Mapper needs a reusable catalog while preserving the identity and history of each physical asset.

## Decision

Virtual Warehouse is a catalog separate from topology and CAS.

### Template

A Warehouse template describes reusable defaults:

- kind: DEVICE or EQUIPMENT;
- template name;
- manufacturer;
- model;
- category;
- nominal rack size in U;
- physical width/depth;
- notes.

Templates are stored in `warehouse_templates`.

### Physical instance

Selecting a template from a Rack creates a new topology inventory instance. The instance owns its unique operational identity, including:

- name;
- serial number;
- optional instance category override;
- Rack parent;
- lifecycle;
- pinned state.

The instance persists a template snapshot containing `templateId`, `templateVersion` and the reusable attributes that were active when the instance was created.

A later template change must not silently rewrite historical or installed instances.

### CAS

A template never occupies rack units.

A newly instantiated item is `UNMOUNTED` until CAS explicitly allocates and equips it. CAS continues to own physical U occupancy.

The flow is:

```text
Virtual Warehouse Template
        ↓ instantiate
Physical DEVICE / EQUIPMENT
        ↓ UNMOUNTED
CAS reservation
        ↓ equip
MOUNTED physical inventory
```

## UX

The main Rack action is `MOUNT FROM WAREHOUSE`.

`CREATE ONE-OFF` remains available for exceptional assets that do not justify a reusable template.

Virtual Warehouse is available as a first-class top-level application surface.

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
- atomic instantiate + CAS mount in one transaction.

These remain explicit follow-up gaps and are not implied by this ADR.
