# Modules

MK1 is a modular monolith.

Planned bounded areas:

- identity
- topology
- spatial
- inventory
- rack
- power
- telemetry
- notifications
- settings

Directories are created when their gate begins. Empty architecture is not treated as implementation.

Each module should separate domain, application, infrastructure and UI concerns where those layers are needed. Domain logic must not import React, Next.js, MongoDB or MQTT adapters.
