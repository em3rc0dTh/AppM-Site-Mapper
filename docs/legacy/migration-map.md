# Legacy Migration Map

Every legacy artifact is classified before implementation is moved.

## Classification

- **CONCEPT** — preserve the validated idea.
- **ALGORITHM** — isolate, understand, test and port intentionally.
- **UX** — reproduce validated behavior using MK1 contracts.
- **LEGACY** — do not migrate into runtime code.
- **EVIDENCE** — useful for decisions, but not executable truth.

## Hierarchical navigation

- **Classification:** CONCEPT + UX
- **Action:** Reconstruct from canonical topology.
- **Gate:** G5

## Breadcrumbs and deep links

- **Classification:** CONCEPT + UX
- **Action:** Preserve deterministic context.
- **Gate:** G5

## Blueprint geometry

- **Classification:** ALGORITHM
- **Action:** Isolate rules and create pure tests before port.
- **Gate:** G6

## `room-dashboard.tsx` orchestration

- **Classification:** UX + LEGACY
- **Action:** Reconstruct renderer/editor and reject the monolithic boundary.
- **Gate:** G6 / G11

## Rack elevation

- **Classification:** UX + DOMAIN evidence
- **Action:** Rebuild over canonical rack/CAS state.
- **Gate:** G7 / G8

## CAS operations

- **Classification:** ALGORITHM + DOMAIN
- **Action:** Specify invariants, then port behavior through tests.
- **Gate:** G7

## `mountDeviceInCAS` orchestration

- **Classification:** DOMAIN evidence + LEGACY coupling
- **Action:** Split rack allocation, device construction, persistence and authorization.
- **Gate:** G7 / G8 / G9

## Device popup

- **Classification:** UX + DOMAIN evidence
- **Action:** Decompose around application contracts.
- **Gate:** G8 / G11

## BDFB hierarchy

- **Classification:** CONCEPT + DOMAIN
- **Action:** Formalize the device/power aggregate.
- **Gate:** G9

## Panel / breaker behavior

- **Classification:** DOMAIN + UX
- **Action:** Implement explicit use cases and validated mutations.
- **Gate:** G9

## Power Path overlay

- **Classification:** CONCEPT + UX
- **Action:** Formalize graph/path semantics before building the renderer.
- **Gate:** G9

## MQTT -> SSE -> EventSource concept

- **Classification:** CONCEPT
- **Action:** Preserve the server-side fan-out idea, not the legacy endpoint.
- **Gate:** G10

## MQTT credentials committed in code

- **Classification:** LEGACY
- **Action:** Reject and rotate legacy credentials outside this repository.
- **Gate:** G10 / Security

## Public telemetry stream

- **Classification:** LEGACY
- **Action:** Reject; enforce authoritative session and authorization.
- **Gate:** G10

## Pinned devices

- **Classification:** UX
- **Action:** Reconstruct from canonical device queries.
- **Gate:** G11

## Notifications

- **Classification:** CONCEPT + UX
- **Action:** Define event and notification contracts.
- **Gate:** G11

## Settings monolith

- **Classification:** UX + LEGACY structure
- **Action:** Split by responsibility.
- **Gate:** G12

## Role names

- **Classification:** CONCEPT evidence
- **Action:** Evaluate Superadmin, Admin and Standard in the RBAC contract.
- **Gate:** G4

## Cookie-derived session and RBAC

- **Classification:** LEGACY
- **Action:** Reject.
- **Gate:** G4

## Plaintext password compatibility

- **Classification:** LEGACY
- **Action:** Reject.
- **Gate:** G4

## Broad user records

- **Classification:** LEGACY
- **Action:** Minimize outputs and authorize every use case.
- **Gate:** G4 / G12

## Generic `saveEntity(type, any)` CRUD

- **Classification:** LEGACY
- **Action:** Replace with explicit commands and use cases.
- **Gate:** G3 onward

## PascalCase / lowercase collection aliases

- **Classification:** LEGACY
- **Action:** Allow only inside migration tooling.
- **Gate:** G13

## Prisma schema

- **Classification:** EVIDENCE
- **Action:** Mine fields and relationships without treating it as authority.
- **Gate:** G2 / G3

## Legacy data-service parent crawls

- **Classification:** EVIDENCE + LEGACY implementation
- **Action:** Preserve query requirements; redesign repositories and query model.
- **Gate:** G3 / G5

## Wireframes and mockups

- **Classification:** UX + EVIDENCE
- **Action:** Reconcile against validated product behavior.
- **Gate:** G11

## Historical security QA

- **Classification:** EVIDENCE
- **Action:** Retain findings and reverify against frozen code.
- **Gate:** G1 / G4 / G10

## Lint and temporary QA artifacts

- **Classification:** LEGACY
- **Action:** Do not migrate.
- **Gate:** None

## Runtime prohibition

No MK1 runtime module may contain permanent compatibility logic that asks whether an entity exists under multiple legacy collection names.

## Porting rule

ALGORITHM does not mean copy/paste. The required sequence is:

```text
identify behavior
→ define invariant
→ write MK1 tests
→ implement minimal pure logic
→ compare against accepted behavior
→ integrate through application contracts
```
