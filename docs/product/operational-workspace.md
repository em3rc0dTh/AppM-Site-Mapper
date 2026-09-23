# Operational Workspace

**Gate:** G11  
**Status:** Accepted

The workspace is the operational composition layer for Site Mapper MK1.

It does not own topology, CAS, power or telemetry truth. It projects those modules into a usable operations surface.

## Layout

- left: hierarchical topology navigation;
- center: operational launchers and BDFB summaries;
- right: pinned Device/Equipment and factual configuration notifications.

## Read / Edit

Read mode is always available to an authenticated user with `topology:read`.

Edit mode is exposed only when the authoritative server role contains `topology:write`. UI mode never grants permission; every mutation remains server-authorized.

## Pinned inventory

Device and Equipment can both be pinned because they are sibling inventory entities beneath Container/Rack.

Pin mutation requires `topology:write`.

## Notifications

G11 notifications are deterministic configuration findings, not inferred alarms.

The initial warning is emitted when an ACTIVE Device or Equipment has no serial number and therefore cannot resolve realtime telemetry.

Future operational alarms must originate from explicit domain/telemetry rules rather than UI heuristics.

## Context surfaces

Topology, Blueprint, Rack Elevation, BDFB/Power and Telemetry remain dedicated module surfaces reachable from the workspace and topology context.

## Visual operations contract

MK1 preserves the validated spatial interaction grammar of the legacy product without copying its visual design.

The canonical hierarchy remains navigable at every depth. As the operator enters deeper entities, a persistent context tree accumulates the active path and exposes the next contained level.

The center surface represents the selected physical concept rather than reducing every entity to a CRUD list:

- Site / Structure / Level: logical infrastructure canvases where surveyed geometry is unavailable;
- Room: physical Blueprint using the canonical 600 × 600 mm grid;
- Bay / Position: spatial containment views;
- Rack: full front elevation fitted to the operational viewport;
- BDFB: Shelf / Frame / Panel / Breaker-or-Holder chassis;
- Frame with `physicalFrameVisible: false`: canonical Frame remains in data, but Panels flatten visually under Shelf;
- PowerPath: explicit relationship rendered as a diagram, never inferred from presentation.

The application shell uses a bounded operational viewport. Document-level scrolling is avoided for primary infrastructure surfaces; when large datasets require scrolling, it is confined to the relevant tree, inspector, inventory, or configuration panel.

The technical Inspector remains a quick factual surface. It complements rather than replaces Blueprint, Rack Elevation, BDFB chassis, Panel/Breaker views, and PowerPath diagrams.
