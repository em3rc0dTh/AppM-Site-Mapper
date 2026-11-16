# ADR-003 — Persistence Strategy

**Status:** Accepted  
**Gate:** G3

## Decision

Site Mapper MK1 uses the official MongoDB Node.js driver for canonical application/domain aggregates such as topology, inventory, identity and configuration.

High-volume historical telemetry is a separate persistence concern and uses TimescaleDB under the telemetry module as defined by ADR-016.

Prisma is not part of the MK1 runtime.

The application accesses either persistence technology only through explicit infrastructure/application contracts.

## Testing adapter

An in-memory repository adapter may be used in tests and local development. It implements the same application contract and is not a second production persistence model.

Production explicitly rejects the in-memory mode.

## Rationale

The legacy product already operates with MongoDB-shaped data and several aggregates are naturally document-oriented. The reconstruction removes legacy aliases and competing schemas while retaining the database technology where it still fits the domain.

## Consequences

- no direct MongoDB calls from React/presentation code;
- no caller-selected collection names;
- no permanent legacy collection aliases;
- migrations translate legacy records into the canonical model;
- MongoDB-specific details stay inside infrastructure modules;
- telemetry history does not inflate MongoDB documents or compete with canonical domain persistence;
- TimescaleDB is owned by Site Mapper rather than by any replaceable field emulator/provider.
