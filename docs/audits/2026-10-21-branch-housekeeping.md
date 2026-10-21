# MK1 branch inventory and integration housekeeping — 2026-10-21

**Repository:** `em3rc0dTh/AppM-Site-Mapper`  
**Scope:** all 74 branches returned by the GitHub branches API at review time, plus pull request state and selected commit comparisons.

## Integration decision

- `feat/home-bdfb-system-overview` is the consolidated implementation branch and PR #70. It contains the full SNMP feature branch by a two-parent merge commit `133943b0ef2a`, resolving the BDFB inspector conflict by preserving the Home v2 descendant metric view alongside the independent SNMP input-feed measurement view.
- Original SNMP PR #71 must be closed as superseded **after** PR #70 merges and combined CI passes.
- Merge PR #70 to `main` only after its combined build and tests succeed. Do not force the protected path or bypass CI.
- Do not delete historical branches merely because an associated PR was merged. A merged PR reference is evidence of historical integration, not certification that its tip remains byte-identical to `main`.

## Open work not silently included

- **#29 Spatial Operations Studio:** ~13k added lines (historical PR diff), extensive domain and visual rewrites; requires separate product review/rebase.
- **#30 G16 identity, durability and telemetry hardening:** ~15k added lines; broad persistence, outbox, auth, telemetry overlap. Requires independent architecture/security review.
- **#36 Room/Rack/BDFB ZIP visual fidelity:** overlaps today's BDFB chassis and Home UI; do not merge until visually compared with current implementation.
- **Six branches without associated PR** include operator-manual drafts, runtime security variants, serial/power-path E2E and adversarial test scenarios; preserve until owners classify them.
- **Nine branches from closed unmerged PRs**, including eight recursion certification attempts and one old G8 rack-elevation path; preserve as recoverable history pending archive policy.

## Classification definitions

- `MAIN`: default branch.
- `INTEGRATION`: consolidated active PR #70.
- `INCLUDED_SOURCE`: original SNMP source head incorporated by merge parent into PR #70.
- `OPEN_PR`: branch with another open PR requiring separate decision.
- `MERGED_PR_REFERENCE`: branch associated with at least one previously merged PR (not a recommendation to remerge).
- `CLOSED_UNMERGED`: branch associated exclusively with PRs closed without merge.
- `NO_PR`: no PR linked by the current API listing (may be an experiment, historical fork or incomplete work).

## Inventory (all branches)

| Branch                                                  | HEAD (12)      | Classification        | PR history                                     |
| ------------------------------------------------------- | -------------- | --------------------- | ---------------------------------------------- |
| `cert/equipment-recursion-hardening-20261007`           | `985f1f765c7f` | `CLOSED_UNMERGED`     | #48:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r2`        | `f1309214463f` | `CLOSED_UNMERGED`     | #49:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r3`        | `c90cdb05e2f1` | `CLOSED_UNMERGED`     | #50:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r4`        | `b152deb85adf` | `CLOSED_UNMERGED`     | #51:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r5`        | `9f1dcc631051` | `CLOSED_UNMERGED`     | #52:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r6`        | `79c95c870d38` | `CLOSED_UNMERGED`     | #53:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r7`        | `28e8a51eff60` | `CLOSED_UNMERGED`     | #54:closed                                     |
| `cert/equipment-recursion-hardening-20261009-r8`        | `0931fa859553` | `CLOSED_UNMERGED`     | #55:closed                                     |
| `docs/first-login-user-onboarding-20261019`             | `11d7c1ef0f06` | `MERGED_PR_REFERENCE` | #68:merged                                     |
| `docs/manual-maestro-operacion-modelo-20261019`         | `0dd29b3ee46b` | `MERGED_PR_REFERENCE` | #69:merged                                     |
| `docs/mvp-stable-candidate-20261016`                    | `4289e7dd5eb5` | `MERGED_PR_REFERENCE` | #64:merged                                     |
| `docs/operator-manual-mk1-20261019`                     | `12ce9fad1ac5` | `NO_PR`               | —                                              |
| `docs/operator-mk1-onboarding-20261019`                 | `63e62792e03c` | `MERGED_PR_REFERENCE` | #67:merged                                     |
| `docs/v1-telxius-product-telemetry-contract`            | `fd3b5ac7d3f8` | `OPEN_PR`             | #30:open                                       |
| `feat/bdfb-device-hierarchy-overview`                   | `597b757afdb2` | `MERGED_PR_REFERENCE` | #39:merged                                     |
| `feat/bfdb-mqtt-appm-integration`                       | `67d51fe90c4d` | `MERGED_PR_REFERENCE` | #31:merged                                     |
| `feat/dev-demo-topology-seed`                           | `6c3d82b03b7f` | `MERGED_PR_REFERENCE` | #21:merged                                     |
| `feat/domain-v1-2-runtime-migration`                    | `93206ce614d4` | `MERGED_PR_REFERENCE` | #43:merged                                     |
| `feat/full-power-trace-access-ports`                    | `6e4526b202fa` | `MERGED_PR_REFERENCE` | #57:merged, #56:closed, #47:merged, #42:closed |
| `feat/home-bdfb-system-overview`                        | `623acf8ddd29` | `INTEGRATION`         | #70:open                                       |
| `feat/legacy-bdfb-materialization`                      | `5dc2444af03a` | `MERGED_PR_REFERENCE` | #33:merged, #32:merged                         |
| `feat/mk1-g0-bootstrap`                                 | `f6ccd1f2d45d` | `MERGED_PR_REFERENCE` | #1:merged                                      |
| `feat/mk1-g1-legacy-mining`                             | `cf5e67b917e1` | `MERGED_PR_REFERENCE` | #2:merged                                      |
| `feat/mk1-g2-domain-contract`                           | `b18e02f74e4e` | `MERGED_PR_REFERENCE` | #3:merged                                      |
| `feat/mk1-g3-persistence`                               | `24537308ea41` | `MERGED_PR_REFERENCE` | #4:merged                                      |
| `feat/mk1-g4-identity-rbac`                             | `9a768d703d9a` | `MERGED_PR_REFERENCE` | #5:merged                                      |
| `feat/mk1-g5-topology-core`                             | `22aeada2f11b` | `MERGED_PR_REFERENCE` | #6:merged                                      |
| `feat/mk1-g6-blueprint-engine`                          | `71f6bf333cac` | `MERGED_PR_REFERENCE` | #7:merged                                      |
| `feat/mk1-g7-cas-engine`                                | `89bb123c751b` | `MERGED_PR_REFERENCE` | #8:merged                                      |
| `feat/mk1-g8-inventory-elevation`                       | `5085b3983ea3` | `MERGED_PR_REFERENCE` | #9:merged                                      |
| `feat/mk1-g8-inventory-rack-elevation`                  | `07f73c3fd3cc` | `CLOSED_UNMERGED`     | #10:closed                                     |
| `feat/mk1-g9-bdfb-power`                                | `b5f257358462` | `MERGED_PR_REFERENCE` | #11:merged                                     |
| `feat/mk1-g10-telemetry`                                | `bd7f22304456` | `MERGED_PR_REFERENCE` | #12:merged                                     |
| `feat/mk1-g11-workspace`                                | `ff80077df6a0` | `MERGED_PR_REFERENCE` | #13:merged                                     |
| `feat/mk1-g12-settings-admin`                           | `94e87a77b4c3` | `MERGED_PR_REFERENCE` | #14:merged                                     |
| `feat/mk1-g13-legacy-migration`                         | `ae4efcc59da4` | `MERGED_PR_REFERENCE` | #15:merged                                     |
| `feat/mk1-g14-system-certification`                     | `f257d5741a67` | `MERGED_PR_REFERENCE` | #16:merged                                     |
| `feat/mk1-g15-release-documentation`                    | `f861daf5ada6` | `MERGED_PR_REFERENCE` | #17:merged                                     |
| `feat/mk1-raw-build`                                    | `154b6e7fa3b4` | `MERGED_PR_REFERENCE` | #41:merged                                     |
| `feat/mk1-security-closure`                             | `cb2c5f51d487` | `NO_PR`               | —                                              |
| `feat/mk1-ui-ux-hardening`                              | `49f58098ee0b` | `MERGED_PR_REFERENCE` | #18:merged                                     |
| `feat/modbus-tcp-site-mapper-sidecar`                   | `3a684cab3a90` | `MERGED_PR_REFERENCE` | #61:merged                                     |
| `feat/operational-console-mk0-mk1`                      | `0589b0d9245b` | `MERGED_PR_REFERENCE` | #62:merged                                     |
| `feat/snmp-feed-ingestion-foundation`                   | `1e62ba3a8413` | `INCLUDED_SOURCE`     | #71:open                                       |
| `feat/spatial-authoring-engine-v0.1`                    | `7752a90f3444` | `OPEN_PR`             | #29:open                                       |
| `feat/telxius-ui-reconstruction`                        | `9eadb42bb5b2` | `MERGED_PR_REFERENCE` | #34:merged                                     |
| `feat/visual-harmony-pass`                              | `1bffe1842934` | `MERGED_PR_REFERENCE` | #35:merged                                     |
| `feat/visual-operations-surface-v0.1`                   | `89c515fce119` | `MERGED_PR_REFERENCE` | #23:merged                                     |
| `feat/zip-faithful-room-bdfb`                           | `3fcd47a10ef0` | `OPEN_PR`             | #36:open                                       |
| `feat/zip-faithful-room-to-bdfb`                        | `5ccb8388fa82` | `MERGED_PR_REFERENCE` | #37:merged                                     |
| `fix/bdfb-room-context-tree`                            | `613658455187` | `MERGED_PR_REFERENCE` | #40:merged                                     |
| `fix/canonical-context-tree-deep-links`                 | `01b625c66bff` | `MERGED_PR_REFERENCE` | #38:merged                                     |
| `fix/commissioning-concurrent-duplicate-key`            | `9a6ee13e1ca0` | `MERGED_PR_REFERENCE` | #59:merged                                     |
| `fix/dev-runtime-process-registry`                      | `4aef1e3f2778` | `MERGED_PR_REFERENCE` | #20:merged                                     |
| `fix/entity-inspector-template-keys`                    | `898094d3c6ef` | `MERGED_PR_REFERENCE` | #22:merged                                     |
| `fix/immersive-grid-regression-v0.3.1`                  | `46c3a106c979` | `MERGED_PR_REFERENCE` | #26:merged                                     |
| `fix/legacy-ui-fidelity-v0.2`                           | `2fac37a8e17f` | `MERGED_PR_REFERENCE` | #24:merged                                     |
| `fix/legacy-ui-scale-v0.3`                              | `9e7fe54dce2f` | `MERGED_PR_REFERENCE` | #25:merged                                     |
| `fix/legacy-workflow-fidelity-v0.4`                     | `695245e761bb` | `MERGED_PR_REFERENCE` | #27:merged                                     |
| `fix/memory-runtime-process-singletons`                 | `463f64ecf352` | `MERGED_PR_REFERENCE` | #19:merged                                     |
| `fix/mk1-serial-identity-and-powerpath-e2e`             | `bc81bfdcb923` | `NO_PR`               | —                                              |
| `fix/mk1-unique-mqtt-serial-and-cross-device-powerpath` | `8377b881dd1c` | `MERGED_PR_REFERENCE` | #60:merged                                     |
| `fix/power-connect-responsive-scroll-20261019`          | `97d7e847a861` | `MERGED_PR_REFERENCE` | #66:merged                                     |
| `fix/power-ports-one-to-one-20261019`                   | `5514d73d3f1e` | `MERGED_PR_REFERENCE` | #65:merged                                     |
| `fix/restore-approved-light-ui-v1-2`                    | `b2aed37d58b3` | `MERGED_PR_REFERENCE` | #45:merged                                     |
| `fix/restore-site-mapper-telemetry-infra-v1-2`          | `0dcbc06e23f8` | `MERGED_PR_REFERENCE` | #44:merged                                     |
| `fix/source-driven-visual-fidelity-v0.5`                | `4f3ad32982c1` | `MERGED_PR_REFERENCE` | #28:merged                                     |
| `integrate/mk1-main-stabilization-20261015`             | `285dda8865f6` | `MERGED_PR_REFERENCE` | #63:merged                                     |
| `integrate/v1-2-onto-full-power-ui`                     | `a7904c19806c` | `NO_PR`               | —                                              |
| `integrate/v1-2-onto-full-power-ui-v2`                  | `8897f8eded8b` | `MERGED_PR_REFERENCE` | #46:merged                                     |
| `integration/mk1-stable-main-20261013`                  | `72f3eebfabb6` | `MERGED_PR_REFERENCE` | #58:merged                                     |
| `main`                                                  | `2d652a92c7c6` | `MAIN`                | —                                              |
| `test/adversarial-g10-cross-target-20261013`            | `9759832344eb` | `NO_PR`               | —                                              |
| `test/adversarial-main-20261013`                        | `5b727e30af5a` | `NO_PR`               | —                                              |

## Next decisions

1. Reconcile #29/#30/#36 with the canonical 2026-10-21 implementation separately; no bulk integration.
2. Review the five `docs/user-guide/*` files on `docs/operator-manual-mk1-20261019` for screen compatibility with Home v2 before migrating; previously merged operator documentation already exists on main.
3. Determine whether `feat/mk1-security-closure`, `fix/mk1-serial-identity-and-powerpath-e2e` and `test/adversarial-*` contain acceptance gaps worth porting rather than merging stale branches.
4. After owner sign-off, archive/prune obsolete remote branches using a documented retention policy. **No branch deletion was performed during this audit.**
