# Site Mapper MK1 — Architecture Overview

## Architecture style

Site Mapper MK1 is a **modular monolith**.

Dependency direction:

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓ interfaces
Infrastructure
```

React/Next.js render and transport application behavior. Domain rules do not depend on React, Next.js, MongoDB or MQTT.

## Modules

- **identity** — users, sessions, passwords, roles, authorization and rate limiting;
- **topology** — canonical physical hierarchy and lifecycle;
- **spatial** — Blueprint geometry, 600 mm grid, polygons, placement and collision;
- **rack** — CAS occupancy and Rack Elevation;
- **inventory** — Device/Equipment projections and pin state;
- **power** — BDFB internal structure and PowerPath;
- **telemetry** — external MQTT normalization, identity resolution and realtime fan-out;
- **workspace** — operational composition;
- **settings** — explicit administrative surfaces.

## Canonical topology

```text
Network
→ Site
→ Structure
→ Level
→ Room/Substructure
→ ContainerCluster/Bay
→ Position
→ Container/Rack
→ Device | Equipment
```

Device and Equipment are siblings.

Device may own:

```text
Shelf → Frame → Panel → Breaker/Holder
```

## Persistence

MongoDB is the production persistence strategy.

Canonical collections include:

- `topology_nodes`;
- `power_paths`;
- `users`;
- `sessions`;
- `auth_rate_limits`.

CAS is owned by Container/Rack persistence. BDFB structure is owned by Device persistence. PowerPath is a separate aggregate.

Memory repositories exist only for development/testing and are prohibited in production mode.

## Authentication boundary

The browser holds only an opaque HttpOnly session token.

Server-side flow:

```text
opaque cookie
→ token hash
→ session
→ user
→ authoritative role/lifecycle
→ permission
```

Browser state never grants authority.

## Telemetry boundary

```text
MQTT
→ server adapter
→ topic/payload validation
→ Device/Equipment resolution
→ latest-value hub
→ authenticated SSE
→ browser
```

MQTT credentials never reach the browser.

## Migration boundary

Legacy aliases and compatibility logic are restricted to `scripts/migrations/legacy/`.

Runtime modules know only MK1 contracts.

## Certification

The G14 golden path executes identity, topology, Blueprint, CAS, Rack Elevation, Device/Equipment inventory, BDFB, PowerPath, telemetry, workspace and session invalidation together.

See `docs/testing/system-certification.md`.
