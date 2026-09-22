# Legacy Migration Map

Every legacy artifact is classified before implementation is moved.

## Classification

- **CONCEPT** — preserve the validated idea.
- **ALGORITHM** — isolate, understand, test and port intentionally.
- **UX** — reproduce validated behavior using MK1 contracts.
- **LEGACY** — do not migrate into runtime code.
- **EVIDENCE** — useful for decisions, but not executable truth.

| Legacy artifact / behavior | Classification | MK1 action | Destination / gate |
| --- | --- | --- | --- |
| Hierarchical navigation | CONCEPT + UX | reconstruct from canonical topology | G5 |
| Breadcrumb/deep links | CONCEPT + UX | preserve deterministic context | G5 |
| Blueprint geometry | ALGORITHM | isolate rules and create pure tests before port | G6 |
| `room-dashboard.tsx` orchestration | UX + LEGACY | reconstruct renderer/editor; reject monolith | G6/G11 |
| Rack elevation | UX + DOMAIN evidence | rebuild over canonical rack/CAS state | G7/G8 |
| CAS operations | ALGORITHM + DOMAIN | specify invariants, then port through tests | G7 |
| `mountDeviceInCAS` orchestration | DOMAIN evidence + LEGACY coupling | split rack allocation/device construction/persistence | G7/G8/G9 |
| Device popup | UX + DOMAIN evidence | decompose around application contracts | G8/G11 |
| BDFB hierarchy | CONCEPT + DOMAIN | formalize device/power aggregate | G9 |
| Panel/breaker behavior | DOMAIN + UX | explicit use cases and validated mutation | G9 |
| Power path overlay | CONCEPT + UX | formalize graph/path before renderer | G9 |
| MQTT -> SSE -> EventSource concept | CONCEPT | preserve server fan-out idea | G10 |
| MQTT credentials in code | LEGACY | reject; rotate legacy credentials | G10/security |
| Public telemetry stream | LEGACY | reject; enforce session/authorization | G10 |
| Pinned devices | UX | reconstruct from canonical device queries | G11 |
| Notifications | CONCEPT + UX | define event/notification contract | G11 |
| Settings monolith | UX + LEGACY structure | split by responsibility | G12 |
| Role names | CONCEPT evidence | evaluate in RBAC contract | G4 |
| Cookie-derived session/RBAC | LEGACY | reject | G4 |
| Plaintext password compatibility | LEGACY | reject | G4 |
| Broad user records | LEGACY | minimize outputs and authorize | G4/G12 |
| Generic `saveEntity(type, any)` CRUD | LEGACY | explicit commands/use cases | G3+ |
| PascalCase/lowercase collection aliases | LEGACY | migration scripts only | G13 |
| Prisma schema | EVIDENCE | mine fields/relationships, do not treat as authority | G2/G3 |
| Legacy data-service parent crawls | EVIDENCE + LEGACY implementation | use query needs as evidence; redesign repository/query model | G3/G5 |
| Wireframes/mockups | UX + EVIDENCE | reconcile with validated product behavior | G11 |
| Historical security QA | EVIDENCE | retain findings, reverify against frozen code | G1/G4/G10 |
| Lint/temporary QA artifacts | LEGACY | do not migrate | none |

## Runtime prohibition

No MK1 runtime module may contain permanent compatibility logic that asks whether an entity exists under multiple legacy collection names.

## Porting rule

ALGORITHM does not mean copy/paste. The sequence is:

```text
identify behavior
→ define invariant
→ write MK1 tests
→ implement minimal pure logic
→ compare against accepted behavior
→ integrate through application contracts
```
