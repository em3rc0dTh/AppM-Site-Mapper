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
