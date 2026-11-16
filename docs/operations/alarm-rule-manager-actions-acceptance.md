# Site Mapper MK1 — GitHub Actions acceptance for Alarm Rule Manager

**Status:** repeatable acceptance plan for feature branch `feat/alarm-rule-manager-dc48v-mk1`; no production or client-field certification.

**GitHub Actions:** `.github/workflows/alarm-rule-manager-acceptance.yml`  
**Pull request:** [#224](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/224)  
**Target:** isolated GitHub-hosted Ubuntu runner, Node.js 22, MongoDB 7 replica set and disposable in-memory application.

## Principles

1. Run on every relevant push to the feature branch; allow manual `workflow_dispatch` once the workflow is available to GitHub Actions.
2. Use `contents: read` only; no deploy, release, merge, migrations to user databases, client credentials or industrial networks.
3. The Mongo test uses a new random database in an **isolated runner** and drops **only that database** as test teardown.
4. HTTP and browser acceptance use `APP_PERSISTENCE=memory` and synthetic admin credentials. API mutations only write temporary in-memory data.
5. Capture success/failure in Actions logs; save HTTP/browser receipts and screenshots as an artifact.
6. CI general `.github/workflows/ci.yml` must also be green at the **same feature-branch SHA**. It runs the full unit/integration suite, linter, typecheck, formatter, security/dependency audit and Next.js build.
7. A CI pass **does not** establish electrical commissioning, persistence of evaluator's runtime counters across restart, hardware accuracy, Metasys interoperability, or OWASP certification.

## Matrix and explicit acceptance criteria

| ID    | Job / command                                                                                                                                                                                                                  | What it proves                                                                                                                                                 | Pass condition                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| AR-01 | `npm run typecheck`                                                                                                                                                                                                            | Managed policy shapes and Next.js contracts compile                                                                                                            | Exit 0                                                                  |
| AR-02 | `npm run lint` and `npm run format:check`                                                                                                                                                                                      | Code quality, UI lint, formatting                                                                                                                              | Exit 0                                                                  |
| AR-03 | `npx vitest run tests/unit/alarm-rule-manager.test.ts tests/unit/telemetry-alarm-evaluator.test.ts tests/unit/automatic-telemetry-watch-alarm.test.ts tests/unit/breaker-protection.test.ts tests/unit/i18n-static-ui.test.ts` | Default DC values are references; draft validation; inheritance; load-loss debounce and recovery; replay; breaker protection; independent events; bilingual UI | All targeted tests pass, none silently skipped                          |
| AR-04 | `CI_ALARM_RULE_MANAGER=true APP_ENV=test MONGODB_URI=... npx vitest run tests/integration/alarm-rule-manager-mongo.test.ts`                                                                                                    | Real Mongo CAS: draft publication, immutable published snapshot during draft edits, concurrent publish/disable, audit retention, legacy collections untouched  | 3 tests pass against disposable replica set                             |
| AR-05 | `CI_ALARM_ACCEPTANCE=true npx vitest run tests/integration/s02-alarm-acceptance-mongo.test.ts tests/integration/automatic-operational-commissioning-mongo.test.ts tests/integration/alarm-redteam-mongo.test.ts`               | Regression of real Mongo alarm lifecycle, concurrent updates, acknowledgement, operational watch                                                               | All enabled cases pass                                                  |
| AR-06 | `node scripts/ci/alarm-rule-manager-http-smoke.mjs`                                                                                                                                                                            | Session authentication, RBAC on endpoints, origin protection, Rule Manager page/Alarm Center render, default DC profile and new codes                          | Every scripted HTTP assertion passes                                    |
| AR-07 | Same HTTP smoke                                                                                                                                                                                                                | `SAVE_DRAFT` → `PUBLISH` → draft edit → stale revision 409 → `DISABLE` audit                                                                                   | Correct revisions and preserved snapshots, no implicit publication      |
| AR-08 | `NODE_PATH="$(npm root --global)" node scripts/ci/alarm-rule-manager-browser.cjs`                                                                                                                                              | Real Chromium rendering of catalog, DC profile, assignments, history, Alarm Center and navigation                                                              | All visible UI assertions pass; no uncaught browser errors              |
| AR-09 | Artifact upload                                                                                                                                                                                                                | Evidence is inspectable from GitHub Actions                                                                                                                    | `alarm-rule-manager-acceptance-<sha>` contains receipts and screenshots |
| AR-10 | Existing workflow `CI`                                                                                                                                                                                                         | Broad system unit/integration/certification regressions and production Next.js build                                                                           | Green at the same commit                                                |

### Boundaries of these tests

- `Rule Manager` is a policy configuration surface. The tests do **not** publish electrical rules to site equipment.
- `LOAD_LOSS` requires expected load, valid measurements and debounce. The test deliberately checks a previously loaded circuit and duplicate timestamp rejection.
- `Telemetry Loss` is not equivalent to a reading of 0 A or 0 V. The existing electrical and operational watch suites protect this separation.
- The visual smoke screenshots show synthetic, initialized UI. They do not demonstrate a physical rectifier, live SNMPv3, or field MQTT.
- Browser screenshot artifacts may show synthetic system metadata; do not include customer secrets, cookies or real data.
- No assertions of OWASP/ASVS compliance may be made solely from this workflow. The commercial declaration requires a versioned ASVS matrix and specific security evidence.

## How to run

On the feature branch, every push touching this workflow, the acceptance scripts/tests, alarms modules or documentation automatically triggers the run.

To manually trigger when available: **GitHub → Actions → Alarm Rule Manager MK1 acceptance → Run workflow → choose `feat/alarm-rule-manager-dc48v-mk1`**.

Read **Actions → Run summary** for pass/fail of the `focused-contracts`, `mongo-acceptance` and `http-browser` jobs. Download the `alarm-rule-manager-acceptance-...` artifact to inspect:

- `http-acceptance.json`: authentication, API, audit and publication assertions.
- `browser-acceptance.json`: UI checks.
- `rule-manager-catalog.png`: default catalog layout at 1440 × 900.
- `dc-48v-profile.png`: rectifier profile reference.
- `alarm-center.png`: linked alarm center.

Check the existing `CI` run **for the same commit SHA** as well.

## Failure rules

- Any red test means **NO GO**: leave PR #224 as Draft, read failing logs, correct the defect on the feature branch, rerun and record SHA + evidence.
- A skipped acceptance due to absent environment flags is **NOT PASS**. The dedicated workflow sets flags explicitly and requires enabled tests.
- An API response 200 without the expected JSON state is **NOT PASS**.
- A browser screenshot without DOM/assertion success is **NOT PASS**.
- A green Actions run is a controlled software acceptance, **not approval of actual voltage/current/power/energy thresholds**.

## Local reproduction in an isolated environment

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npx vitest run tests/unit/alarm-rule-manager.test.ts tests/unit/telemetry-alarm-evaluator.test.ts tests/unit/automatic-telemetry-watch-alarm.test.ts tests/unit/breaker-protection.test.ts tests/unit/i18n-static-ui.test.ts
```

The real-Mongo tests are intentionally guarded by `APP_ENV=test`, `CI_ALARM_RULE_MANAGER=true` and a **loopback** Mongo URI. Do not point them to an existing customer database. Use only the disposable GitHub runner as supplied in the workflow.
