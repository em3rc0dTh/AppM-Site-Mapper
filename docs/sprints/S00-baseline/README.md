# Sprint 00 — Commissioning Baseline & Automatic Telemetry Reconciliation

**Scope:** AppM Site Mapper MK1 · OFFICE/FIELD baseline  
**Target:** converge to `main` after acceptance  
**Rule:** no Sprint 01 breaker-threshold/rating/alarm work is included here.

## Stories

| ID | Story | Implementation | Acceptance |
| --- | --- | --- | --- |
| S00-HU01 | Automatically bind BFDB MQTT telemetry to an existing breaker when serial + governed raw point + topology produce one deterministic match. MQTT never creates infrastructure. | `AutomaticBfdbBindingReconciler` + TelemetryService integration | Dedicated integration run; no binding before breaker exists, binding after breaker exists, missing metrics remain absent, replay is idempotent. |
| S00-HU02 | Make the accepted post-migration QDF-2 physical schedule canonical and reproducible. | seed-01 v8 + in-place QDF-2 topology migration | QDF-2 A3/B3 positions 1..13, 26 breakers, legacy positions retained as evidence, no topology invention outside schedule. |
| S00-HU03 | Reproduce the three-controller Config2 SNMP OFFICE commissioning without manual Docker edits. | OFFICE compose real-SNMP profile + runtime template | Three collectors, controller identities 01/02/03, four Config2 points each, 12 bindings total. |
| S00-HU04 | Recover Timescale history connectivity deterministically after runtime/password drift. | `repair-timescale-role.sh` | Timescale ready + telemetry-store `/health` healthy; repair restarts only telemetry-store. |
| S00-HU05 | Produce a coordinated recoverable backup before baseline mutations. | `backup-office-state.sh` + `verify-office-backup-restore.sh` | Mongo + Timescale dumps, checksums, private runtime/config copy, successful isolated restore in disposable containers. |
| S00-HU06 | Reconcile the current QDF inventory and telemetry identities without duplicates. | `audit-office-baseline.mongosh.js` | QDF-2=26, QDF-4=12, QDF-5=36, total=74; unique serials; no duplicate active source-point-metric binding. |
| S00-HU07 | Prove MQTT, SNMP and history are alive while keeping LAB/FIELD provenance explicit. | OFFICE runbook + baseline audit | MQTT/Entity history present, SNMP durable batches present, telemetry-store healthy, runtime secrets remain outside Git. |
| S00-HU08 | Execute one controlled gate and produce acceptance evidence before merging. | `sprint-00-gate.sh` | code validation -> backup -> isolated restore -> QDF-2 v8 reconciliation -> Timescale health -> final baseline audit -> acceptance receipt. |

## Explicit boundaries

Sprint 00 does **not** implement:

- breaker `ratedCurrentA`;
- overcurrent thresholds;
- alarm policies;
- right-click threshold editing;
- branding;
- workspace resizers;
- Caddy/HTTPS.

Those belong to subsequent sprints.

## Automatic binding contract

```text
Site Mapper breaker exists
+
known BFDB serial
+
governed raw point 0_<group>_<position>
+
metric actually present in MQTT
        |
        v
unique physical match
        |
        +--> persist AUTO_RECONCILED binding
        +--> LIVE / history
```

No breaker in Site Mapper => RAW remains unmapped.

Missing metric => no metric binding and no derived value.

## Controlled execution

### Read-only planning

```bash
sh scripts/operations/sprint-00-gate.sh plan
```

This performs code validation, compose validation, QDF-2 migration plan, Timescale health and a current baseline audit. The migration remains read-only.

### Acceptance

```bash
SITEMAPPER_S00_ACK=ACCEPT sh scripts/operations/sprint-00-gate.sh accept
```

The acceptance path first creates and restores a private backup. It then applies only the approved QDF-2 topology reconciliation and runs the final audit.

A successful run prints:

```text
SPRINT_00_ACCEPTED
receipt=<private backup path>/SPRINT-00-ACCEPTANCE.txt
```

The private receipt/backups must not be committed.

## Main convergence

The Sprint 00 PR may be merged only after the acceptance run succeeds. Once merged, `main` is the sole baseline for Sprint 01; the Sprint 00 working branch is no longer an operational source of truth.
