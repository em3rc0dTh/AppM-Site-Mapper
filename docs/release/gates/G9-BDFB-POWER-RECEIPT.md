# G9 — BDFB / Power Receipt

**Status:** PASS  
**Gate:** G9  
**Current authority:** Canonical Domain Contract v1.2  
**Certified implementation SHA:** `3dfeebb7822d3d3404d911352470721cb5b859a9`  
**Certification workflow:** CI run #1039  
**Workflow run ID:** `37961416613`

## Canonical v1.2 acceptance criteria

The certified implementation verifies that:

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
- Equipment archive/restore is separated from physical topology mutation;
- recursive Equipment / Warehouse / Topology HTTP write boundaries enforce
  bounded JSON, strict fields and same-origin protections;
- production browser security includes nonce-based CSP;
- dependency audit is part of the certification gate.

## Executed certification gate

The following steps completed successfully on CI run #1039:

- Typecheck;
- Lint;
- Format check;
- Unit tests;
- Integration tests;
- System certification;
- Production build;
- Production dependency audit.

This receipt supersedes the earlier historical G9 interpretation that used a parallel
BDFB structure model, Holder terminology or a dedicated BDFB materialization service.

## Certification rule

A later code or contract change must not inherit this PASS implicitly. It must pass the
same CI gate again before being called certified.
