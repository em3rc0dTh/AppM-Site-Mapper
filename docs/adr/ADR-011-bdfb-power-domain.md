# ADR-011 — BDFB and Power Domain

**Status:** Accepted  
**Gate:** G2

## BDFB decision

BDFB is a specialized Device capability/type.

Its internal physical/electrical hierarchy is owned by the Device aggregate:

```text
Device(BDFB)
→ Shelf
→ Frame
→ Panel
→ Breaker / Holder
```

## PowerPath decision

PowerPath is an explicit aggregate with stable identity and endpoint references.

It may connect supported Device/Equipment/internal electrical endpoints and may carry an A/B feed designation.

The UI visualizes PowerPath; it does not define it.

## Consequences

- BDFB construction is independent from CAS mounting.
- G9 implements internal-device editing and PowerPath validation.
- Persistence must preserve referential integrity between PowerPath endpoints and their owners.
