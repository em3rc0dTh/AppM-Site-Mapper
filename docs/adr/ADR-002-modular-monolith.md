# ADR-002 — Modular Monolith

**Status:** Accepted

## Decision

MK1 begins as a modular monolith.

## Rationale

The product has multiple bounded domains but does not currently require distributed deployment boundaries. A modular monolith gives us explicit domain ownership, testable boundaries and a single operational unit without introducing network, consistency and deployment complexity prematurely.

## Consequences

- Modules own domain/application behavior.
- Infrastructure adapters remain replaceable.
- Cross-module access should use explicit application/domain contracts.
- No microservice extraction is planned until measured operational or organizational pressure justifies it.
- UI components are not domain modules.
