# S01 — Breaker ratings, thresholds and physical-view editing

**Status:** IN PROGRESS — contract and branch initialized; NOT ACCEPTED.
**Base:** `main`, after Sprint 00 merge `1c84fbdb097ff4c1ec4368a0bba824616a265e9d`.
**Branch:** `feat/mk1-s01-breaker-ratings-thresholds`.
**Scope:** HU-009 to HU-014. No physical field commissioning, no MK2 KPIs, no production database mutation.

## Observed baseline

- `src/components/power/bdfb-chassis.tsx` already renders the canonical panel positions as `P01..` and the installed breaker label with link to the Equipment/Device detail. HU-009 is partially implemented, but must be accepted through real panel/position inventory.
- BDFB Physical View is presently a **read-only** projection. The Equipment Composition editor remains the inventory editor of record.
- `src/shared/infrastructure/mongodb/bootstrap.ts` already creates `alarm_policies`, `alarm_occurrences` and `alarm_transitions` indexes.
- Sprint 00 merged QDF-2 seed-01 v8 and related commissioning changes. Do not reset or overwrite field-verified ratings on seed reruns.
- The 20 A standard is **provisional** and must not masquerade as physical certification.

## User stories and acceptance

### HU-009 — Identify a breaker
- Present panel identity (for example `A3`), physical position (`P04`), breaker identifier and existing label in the BDFB Physical View.
- The stable breaker identity comes from the canonical installed Equipment tree, never derived from display coordinates alone.
- Empty positions have no writable breaker target; panel and position remain visible.
- **AC:** operator can unambiguously find the same breaker from the physical view and its detailed view, including after reload.

### HU-010 — Context menu
- Right-click an installed breaker opens a focused menu anchored to that breaker with `Configure breaker limits` and `View breaker`; `Escape` and outside click close it.
- Keyboard/focus and accessible alternative must be available; do not make right-click the sole path.
- Only authorized roles can invoke editing; unauthorized users may view values but cannot mutate through browser or direct API.
- Context action must never reassign a breaker or affect adjacent positions.
- **AC:** selecting an installed breaker opens exactly its configuration; clicking an empty slot does not open a writable configuration.

### HU-011 — Ratings and limits
- Show `ratedCurrentA`, `assertAboveA`, `clearBelowA`, source/provenance and verification status.
- Units always A; values must be finite and positive where applicable. `clearBelowA < assertAboveA` is mandatory. Hysteresis and equality semantics follow the existing alarm policy contract and must be documented, not guessed.
- Distinguish rating (device nameplate/commissioned fact) from policy thresholds (editable operational settings).
- No automatic assumption that 20 A is a certified rating. If defaulted to 20 A, explicitly mark `PROVISIONAL_STANDARD` and `verified: false`.
- **AC:** authorized operator can save a valid threshold pair and retrieve exactly the saved values; invalid input fails without partial writes.

### HU-012 — Provenance
- Persist the rating's source and verification state. An operator-provided verified rating requires an evidence reference and explicit authorized confirmation.
- Existing verified field/manufacturer/customer-document values win over seeds or provisional values.
- Changing thresholds must not silently change provenance or certify hardware.
- **AC:** restart and seed reconciliation preserve verified ratings and their evidence.

### HU-013 — Safe persistence and alarm policy
- The write is server-side authorized and targeted by canonical breaker ID; validate ownership, breaker type, expected revision and all numeric constraints.
- Update the threshold policy consistently with the accepted alarm-domain model, without changing other breakers, MQTT bindings, shunt ratings or Modbus mappings.
- Reject stale edits with an explicit conflict rather than losing a concurrent operator's changes.
- **AC:** after reload, only the selected breaker and its intended alarm policy show the new limits; another breaker's policy remains unchanged.

### HU-014 — Audit trail
- Capture breaker ID, panel/path context, actor, timestamp, before/after rating and threshold values, provenance change, result and a safe correlation/request ID.
- Never log credentials, raw secrets or unrestricted telemetry payloads.
- Audit must survive UI reload and preserve historical changes. Failed validation must not produce a successful mutation audit.
- **AC:** successful edits appear in the audit history with exact before/after values; rejected attempts can be distinguished from successful mutations.

## Engineering invariants

1. Breaker `ratedCurrentA` is distinct from **BDFB incoming shunt** nominal ratings; changing one must not modify the other.
2. MQTT Equipment/breaker measurements remain separate from SNMP A/B shunt measurements.
3. A/B/QDF totals, aggregate KPIs, physical certification and MK2 analysis are outside S01.
4. No `docker compose down -v`, data reset, telemetry-store schema destruction, or mutation of the live TFARM04 database as part of routine code delivery.
5. Each API mutation must enforce RBAC independently of a hidden/disabled frontend control.
6. Keep Device and Equipment on their canonical peer hierarchy; do not add a new Equipment nesting level.

## Implementation order

1. Inspect existing canonical Equipment fields, policy CRUD/use cases, RBAC permissions, mutation conventions and audit store.
2. Implement domain validation, versioned persistence and policy update with migration safety, then exercise focused integration/authorization cases.
3. Integrate edit dialog and context-menu action into `BdfbChassis`; add non-mouse accessible route.
4. Add tests for invalid thresholds, protected verified ratings, duplicate/idempotent edits, concurrent edits, unauthorized users and isolation from other breakers.
5. Record evidence against each story, run required CI, open PR, and request operator acceptance before merge or deployment.

## Sprint gate

The sprint is **not accepted** until a user can right-click one physical breaker, change its authorized limit, see a persistent policy after reload, and inspect an audit record with before/after values — while adjacent breakers and certified values are unchanged.

## Evidence checklist

- [ ] HU-009 accepted
- [ ] HU-010 accepted
- [ ] HU-011 accepted
- [ ] HU-012 accepted
- [ ] HU-013 accepted
- [ ] HU-014 accepted
- [ ] Tests and CI passed
- [ ] User acceptance
- [ ] PR integrated to `main`
