# ADR-003 — Persistence Strategy

**Status:** Accepted  
**Gate:** G3

## Decision

Site Mapper MK1 uses the official MongoDB Node.js driver as its production persistence technology.

Prisma is not part of the MK1 runtime.

The application accesses persistence only through explicit repository interfaces.

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
- MongoDB-specific details stay inside infrastructure modules.
