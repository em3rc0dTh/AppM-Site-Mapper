# Sprint 01 — Acceptance validation report

**Date:** 2026-11-05
**Repository:** `em3rc0dTh/AppM-Site-Mapper`
**PR:** [#155](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/155)
**Branch:** `feat/mk1-s01-breaker-ratings-thresholds`
**Gate decision:** **NOT ACCEPTED — DO NOT START S02 / DO NOT MERGE OR DEPLOY.**

## Evidence and constraints

- Reviewed source in the PR for breaker physical positions, contextual menu/editor, domain input validation, protected API routes, transactional service, alarm policy projection, audit events, persistence indexes, and proposed unit tests.
- Confirmed the `power:write` permission on PATCH and `power:read` on GET, origin/CSRF guard, exact topology identity, optimistic revision precondition and MQTT current binding check by static inspection.
- A proper focus cycle (Tab/Shift-Tab, Escape and focus restore) has been added to the breaker editor. **Not yet browser-verified.**
- No actual changes were made to TFARM04 or its databases.
- Attempted an isolated checkout in the available execution container; HTTPS access to `github.com` failed at DNS resolution (`Could not resolve host: github.com`). Local source test/build execution was therefore unavailable.
- Latest inspected GitHub Actions for PR #155 head `640d29107066133ef57ad0c622188451332d4aa5`:
  - CI run `42053596980`: completed / **failure**, job `127335890233` with `logs_url: null`.
  - MK1 HTTP & MongoDB operational acceptance run `42053596610`: completed / **failure**, job `127335889826` with `logs_url: null`.
- Previous attempts to retrieve job logs returned `404 BlobNotFound`. S00 PR #154 also had failed Actions jobs with unavailable steps. This does **not** prove S01 code is correct and does **not** establish the root cause of the Actions failures.

## Story-by-story gate

| Story | Source review | Acceptance |
|---|---|---|
| HU-009 Panel and breaker position | Existing canonical positions P01.. and Equipment links inspected | PENDING physical-view navigation check |
| HU-010 Right-click / accessible alternate action | Context menu, edit shortcut and focus containment inspected | PENDING browser interaction/accessibility check |
| HU-011 Nominal rating / alert thresholds | Input validation and editor inspected | PENDING persisted end-to-end edit |
| HU-012 Evidence and provenance | Verified source requires reference + explicit confirmation; downgrade guards inspected | PENDING legacy-field reconciliation against real DB |
| HU-013 Scoped persistence / alarm policy | CAS, server permission check and transactional service inspected | PENDING Mongo replica-set commit, rollback and concurrent-edit check |
| HU-014 Append-only audit | Indexes and before/after audit inserts inspected | PENDING durable history and failure-atomicity check |

## Mandatory acceptance scenarios

1. **Equipment identity:** QDF-2, QDF-4 and QDF-5 breaker selection yields the correct physical panel/position and canonical Equipment ID, including after refresh.
2. **Standard read-only:** a STANDARD user can view settings/history but cannot mutate by UI or direct PATCH; ADMIN with `power:write` can write.
3. **Config edit:** changing ONE commissioned breaker setting persists `ratedCurrentA`, `assertAboveA`, `clearBelowA` after reload and only changes that breaker's OVERCURRENT alarm policy.
4. **No collateral write:** neighbouring breakers and incoming SNMP shunt rating/certification are unchanged.
5. **Provisional versus verified:** 20 A provisional remains not verified; verified source requires evidence/confirmation and cannot be silently downgraded; malformed legacy ratings block writes.
6. **Hysteresis:** zero/negative/NaN/infinite input and `clearBelowA >= assertAboveA` are rejected; source point binding ambiguity is rejected.
7. **Concurrency:** stale expected revision returns conflict without changing the policy or producing a successful audit event.
8. **Transactional failure:** simulate audit insertion failure within a real Mongo replica-set transaction and confirm Equipment/policy remain unchanged.
9. **Audit:** event includes actor, timestamp, previous and new breaker settings, previous and new overcurrent policy thresholds, and remains readable after refresh.
10. **Alarm behavior:** accepted MQTT current observations at/above the configured threshold activate the expected breaker alarm after debounce; observations at/below clear threshold resolve it after recovery. The event history is preserved. Existing disabled policy remains disabled.
11. **Usability:** right-click, fallback button, Escape, keyboard Tab/Shift-Tab, mobile/narrow viewport, dialog focus return.
12. **CI:** TypeScript, lint, format, focused unit, Mongo integration, Next build and repository CI must complete successfully, with inspectable logs or equivalent trustworthy local execution evidence.

## Decision and release control

No story has been promoted to **ACCEPTED** solely from source inspection. Until actual CI/integration/browser results exist, keep #155 **Draft** and begin neither S02 nor any TFARM04 deployment.

### How to unblock validation safely

- Resolve GitHub Actions runner/job log access or use a clean isolated checkout with the exact PR head.
- Run `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test:unit`, `npm run test:integration`, `npm run build` and required Mongo HTTP acceptance; record true results.
- On a disposable Mongo replica set, exercise the transactional and authorization scenarios without using the customer's TFARM04 database.
- Complete the browser-based gate and collect operator approval before transitioning to Sprint 02.
