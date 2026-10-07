# G9 — BDFB / Power Receipt

**Status:** SUPERSEDED — historical receipt, not current-head certification  
**Original gate:** G9  
**Current authority:** Canonical Domain Contract v1.2

## Historical note

The original G9 implementation was certified with an earlier BDFB-specific structure
model. That implementation included concepts such as mandatory/implicit Frame handling,
Holder terminology and a dedicated BDFB configuration service.

Those concepts are no longer authoritative.

## Current v1.2 acceptance criteria

The current implementation must certify:

- BDFB is a Device specialization only;
- physical hierarchy is canonical recursive Equipment;
- `parentEquipmentId` and `children[]` remain mutually consistent;
- POSITIONAL slots are `EquipmentId | null`;
- no Holder runtime entity exists;
- Shelf/Frame exist only when physically real;
- BDFB UI is a projection, not a write model;
- no BDFB-specific structure materialization API/service exists;
- Circuit Breaker is Equipment with a POWER OUTPUT AccessPort;
- PowerPath connects AccessPort → AccessPort;
- Rack CAS remains independent from internal Equipment composition;
- mutations respect RBAC, strict request validation and atomic persistence;
- unit, integration, certification, build and dependency audit gates pass on the
  implementation head being certified.

## Certification state

A prior historical CI result does not certify later implementation heads. This receipt
must only be marked PASS for a concrete current SHA after the full CI gate succeeds.
