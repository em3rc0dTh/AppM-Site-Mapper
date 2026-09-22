# Legacy CAS Findings

Status: G1 evidence for the future rack/CAS domain contract.

## Confirmed states and operations

The legacy CAS implementation uses the states:

- `AVAILABLE`;
- `RESERVED`;
- `EQUIPPED`.

Observed operations include:

- list CAS blocks by container;
- add;
- update;
- delete;
- split;
- free;
- mount device.

Observed CAS-related fields include:

- `startPosition`;
- `endPosition`;
- `physicalSize`;
- `totalReservedSpace`;
- clearance;
- associated device state.

## Important behavior coupling

`mountDeviceInCAS` does more than rack occupancy. The same legacy action also participates in creating device/BDFB internal structure, including shelves, frames, panels and breaker/holder-related data.

That coupling is product evidence, but it is not an MK1 module boundary.

## MK1 decomposition requirement

The future implementation must separate:

1. rack-space allocation;
2. device placement;
3. device/BDFB construction;
4. persistence;
5. authorization;
6. UI rendering.

## Invariants to formalize before porting

G7 must explicitly define and test:

- valid U range;
- orientation and U numbering direction;
- overlap prohibition;
- physical-size versus reserved-size semantics;
- top/bottom clearance;
- split behavior;
- free behavior;
- mount preconditions;
- remainder-block behavior;
- rack capacity limits;
- behavior when moving or removing an equipped device.

Until those invariants are accepted, the legacy algorithm is evidence rather than executable MK1 domain code.
