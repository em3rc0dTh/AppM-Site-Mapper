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

Device is canonical rack inventory. Equipment has its own stable identity and may be nested under a Device or another Equipment. An Equipment does not automatically inherit the MQTT source identity of its parent.

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

CAS is owned by Container/Rack persistence. BDFB structures consist of canonical nested Equipment nodes and explicit child/position relationships; PowerPath is a separate aggregate. MQTT `TelemetryBinding` records map verified source + point + metric to canonical Equipment IDs.

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

## Independent telemetry runtimes

The server-side MQTT consumer validates source/topic/payload and explicit breaker bindings. Accepted metrics fan out to the authenticated LIVE/SSE UI, the separately deployed Site Mapper TimescaleDB history service, and the Site Mapper-owned private Modbus TCP sidecar. The sidecar answers FC03 from ephemeral Latest State **without querying MongoDB or TimescaleDB** on reads. The external BFDB emitter/broker/gateway is a distinct project. The local laboratory path and limitations are documented in `docs/operations/mqtt-modbus-lab.md`.

## Migration boundary

Legacy aliases and compatibility logic are restricted to `scripts/migrations/legacy/`.

Runtime modules know only MK1 contracts.

## Certification

The G14 golden path executes identity, topology, Blueprint, CAS, Rack Elevation, Device/Equipment inventory, BDFB, PowerPath, telemetry, workspace and session invalidation together.

See `docs/testing/system-certification.md`.
