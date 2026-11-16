# ADR-010 — CAS Domain Ownership

**Status:** Accepted  
**Gate:** G2

## Decision

CAS is rack-occupancy state owned by the `Container / Rack` aggregate when U-space capability is present.

CAS is not an independent topology node or separately navigable aggregate.

## States

```text
AVAILABLE
RESERVED
EQUIPPED
```

## Consequences

- G3 may persist CAS inside the Container/Rack document or through an infrastructure representation that preserves aggregate atomicity.
- G7 owns the complete CAS transition algorithm and tests.
- Device moves that consume U-space must update occupancy atomically with placement.
- Equipment without U-space consumption is not forced into CAS.
