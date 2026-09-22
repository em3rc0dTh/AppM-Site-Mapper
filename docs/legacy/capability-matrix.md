# Legacy Capability Matrix

Status: initial mining pass. This is evidence, not a canonical domain contract.

## Hierarchical topology

- **Legacy state:** Implemented
- **MK1 treatment:** CONCEPT + UX
- **Initial acceptance intent:** Navigate Network -> Site -> Structure -> Level -> Room -> Rack -> Device with stable deep links.

## Blueprint / room map

- **Legacy state:** Implemented
- **MK1 treatment:** ALGORITHM + UX
- **Initial acceptance intent:** Preserve 600 mm grid semantics, geometry, placement and collision behavior through a pure spatial engine.

## Rack elevation

- **Legacy state:** Implemented
- **MK1 treatment:** UX + DOMAIN
- **Initial acceptance intent:** Render canonical occupancy from rack/domain state.

## CAS

- **Legacy state:** Implemented
- **MK1 treatment:** ALGORITHM + DOMAIN
- **Initial acceptance intent:** Preserve AVAILABLE / RESERVED / EQUIPPED semantics after G2 validation.

## BDFB hierarchy

- **Legacy state:** Implemented
- **MK1 treatment:** CONCEPT + DOMAIN
- **Initial acceptance intent:** Model Shelf -> Frame -> Panel -> Holder/Breaker independently from popup UI.

## Power path

- **Legacy state:** Implemented
- **MK1 treatment:** CONCEPT + DOMAIN
- **Initial acceptance intent:** Make source/destination/feed relationships explicit and testable.

## Pinned devices

- **Legacy state:** Implemented
- **MK1 treatment:** UX
- **Initial acceptance intent:** Reconstruct against application contracts.

## Global navigation tree

- **Legacy state:** Implemented
- **MK1 treatment:** CONCEPT + UX
- **Initial acceptance intent:** Preserve topology navigation without coupling to legacy collections.

## Breadcrumbs / deep links

- **Legacy state:** Implemented
- **MK1 treatment:** CONCEPT + UX
- **Initial acceptance intent:** Preserve deterministic hierarchy navigation.

## MQTT telemetry

- **Legacy state:** Implemented with security debt
- **MK1 treatment:** CONCEPT; transport reimplemented
- **Initial acceptance intent:** Authenticated, validated and normalized realtime delivery.

## User roles

- **Legacy state:** Implemented with unsafe trust boundary
- **MK1 treatment:** CONCEPT; implementation rejected
- **Initial acceptance intent:** Server-authoritative identity and RBAC.

## Settings / administration

- **Legacy state:** Implemented as monolith
- **MK1 treatment:** UX + selected capabilities
- **Initial acceptance intent:** Split by profile, security, users, import/drafting and dangerous operations.

## Legacy Mongo aliases

- **Legacy state:** Implemented
- **MK1 treatment:** LEGACY
- **Initial acceptance intent:** Migration-only compatibility; never runtime architecture.

## Prisma reference schema

- **Legacy state:** Present but not runtime authority
- **MK1 treatment:** EVIDENCE
- **Initial acceptance intent:** Reassess during persistence ADR; do not carry both models forward.

This matrix will expand during G1 as code, documentation and runtime behavior are reconciled.
