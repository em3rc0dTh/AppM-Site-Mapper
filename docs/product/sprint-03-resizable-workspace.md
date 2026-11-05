# Sprint 03 — Resizable Operational Workspace

Branch: `feat/mk1-s03-resizable-workspace`

## Scope

HU-022/023: shared keyboard- and pointer-operable navigation/inspector separators.
HU-024: canvas remains mounted; resizing changes CSS viewport dimensions only and preserves domain coordinates, zoom state and selection.
HU-025: overflow containment and container-dependent responsive inspector treatment.
HU-026: versioned per-user local preference, reset.
HU-027: narrow viewports expose tree and inspector on demand while retaining the center stage.

## Constraints

No database migration, geometry change, MQTT/SNMP/Timescale change, or server deployment.
The shared shell is used in Topology/BDFB, Device, Blueprint, and Rack Focus.
Home has a separate expandable sidebar and is not changed to a three-pane editor.

## Manual acceptance required

- 1920 / 1440 / 1366 / 1024 / 768 / 390px widths.
- Resize tree and inspector with pointer and keyboard.
- Navigate between BDFBs, Blueprint and Rack Focus with selection intact.
- Zoom/pan before and after resize; no physical-coordinate or placement change.
- Confirm inspector panels, tables and long IDs do not overlap.
- Reload and reset saved widths; use different accounts.
- Confirm mobile tree/inspector toggles and no loss of operational controls.
- Complete CI, screenshot comparisons and browser acceptance before merge.

The work is not field-certified by a commit alone.
