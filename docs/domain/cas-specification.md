# CAS Specification

**Gate:** G7  
**Status:** Accepted

CAS is authoritative U-space occupancy owned by a Rack.

## Coordinate convention

- U1 is the lowest rack unit.
- U numbers increase upward.
- `mountStartU` is the lowest physical U occupied by the mounted object.
- `physicalSizeU` is the object's physical height.
- bottom clearance extends toward lower U numbers;
- top clearance extends toward higher U numbers.

## States

- `AVAILABLE` — unallocated capacity.
- `RESERVED` — space reserved but not yet bound to an occupant.
- `EQUIPPED` — reservation bound to a Device or Equipment sibling inside the same Rack.

## Coverage invariant

The CAS segments of a Rack form one ordered, gap-free, non-overlapping partition of `1..totalU`.

## Transitions

```text
AVAILABLE
  └─ reserve → RESERVED
                 ├─ equip → EQUIPPED
                 └─ free  → AVAILABLE
EQUIPPED
  └─ free → AVAILABLE
```

Freeing capacity merges adjacent AVAILABLE ranges.

## Safety

- no allocation may exceed rack bounds;
- no allocation may overlap non-available capacity;
- equipment binding must reference an ACTIVE Device or Equipment whose parent is the same Rack;
- a generic topology move must not bypass an existing equipped allocation.
