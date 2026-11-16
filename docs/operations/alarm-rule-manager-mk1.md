# Site Mapper MK1 — Alarm Rule Manager / DC 48 V

Status: **implementation on feature branch; NOT commissioned for customer production**.
The Alarm Center and legacy `alarm_policies` remain authoritative for existing occurrences.

## User surfaces

- `/alarms`: existing Alarm Center plus related, co-occurring breaker conditions.
- `/alarms/rules`: rule catalog, profile reference, per-scope drafts, publication, assignments, history and dry-run.
- `/alarms/rules?breakerId=<id>`: direct entry from the Breaker Limit editor.
- `GET /api/alarms/rules`: catalog, unmodified rectifier reference profile, saved rules and audit history. Requires `alarms:read`.
- `POST /api/alarms/rules`: `SAVE_DRAFT`, `PUBLISH`, `DISABLE`. Requires `settings:write`, same-origin cookie request, bounded JSON schema, optimistic revision. `PUBLISH` additionally requires `confirmImpact: true`.
- `GET /api/alarms/rules/effective?breakerId=<id>`: effective configured rules and legacy policies, subject to `alarms:read`.

## DC-48V-24CELL reference

Observed in the provided rectifier settings screenshot:

| Field | V |
|---|---:|
| Nominal system | 48 |
| Rectifier OVS | 59.0 |
| Reference | 54.50 |
| Boost | 56.50 |
| Rectifier standby setting | 44.40 |
| Battery disconnect | 43.00 |
| Battery reconnect | 48.00 |
| Battery test end | 45.50 |

Battery cells: 24.

**Never treat these numbers as automatically enabled alarm thresholds.** They are recorded settings for a particular rectifier. Commission alarm limits per site and measurement location, verify battery mode/state and metering precision, then publish. This feature has no write path to the rectifier.

## Policy resolution

Legacy `alarm_policies` and the breaker overcurrent service are preserved unchanged.

- New configurations live in `alarm_rule_configurations`. Each deterministic ID is one (scope, scopeId, rule code), with `draft`, optional immutable `published` snapshot, revision and append-only embedded audit snapshots.
- A draft update does **not** change the currently published snapshot.
- `PUBLISH` and `DISABLE` atomically replace that snapshot using revision CAS.
- Effective rule precedence: GLOBAL < QDF/Device < PANEL < BREAKER; most-specific published rule wins by code.
- A legacy policy enabled for a breaker always wins for an overlapping code; no migration, overwrite or silent replacement.
- Each MQTT metric binding is scoped to one breaker Equipment. New rules are synthesized in-memory only if the breaker is ACTIVE and has a matching active bound point and source.
- An unconfigured breaker cannot assert new electrical conditions.
- `LOAD_LOSS` requires `expectedLoad:true`, a commissioned reference threshold and a previously observed current above that reference within the evaluator's operating lifetime. `0.0 A` alone does not prove that a breaker tripped.
- `TELEMETRY_LOSS` remains a transport/freshness condition, not an electrical zero. Explicit OFFLINE samples are ignored by electrical assertion/recovery.
- `POWER_LOSS` retains existing semantics: correlated low voltage and low current.
- Energy rules use elapsed observation windows and kWh deltas, never the absolute cumulative kWh value as a consumption threshold.

## Known boundaries, to close before client rollout

1. **Commissioning is mandatory**: obtain authorized operating voltage range, measured point, rectifier mode status, current reference and meter precision from the site's electrical owner. Published examples are not customer defaults.
2. **Audit evidence**: export customer-specific rule versions, timestamps, actors and sample evidence for acceptance; do not place sensitive production customer telemetry or secrets in this public repository.
3. **Runtime state**: current counters, load-observed latches, and energy windows are process-local and not durable across restart. Avoid relying on these without verifying failover/restart behavior for critical monitoring.
4. **Disable/reconfigure of active alarms**: previously generated active occurrences are preserved in the Alarm Center. Review operator resolution policy when a rule is disabled or its thresholds change; never silently delete historical evidence.
5. **Correlation**: group events on the same breaker occurring within ten minutes for operator triage; **this is not definitive root-cause correlation** and does not imply all QDF breakers are faulty.
6. **Compliance**: secure APIs reuse central session and RBAC. Review against OWASP ASVS requirements and attach test evidence before claiming controls have been verified.
7. **Acceptance**: CI tests, client-configured field simulation, MQTT stale/duplicate/out-of-order flows, reboot/state retention, load OFF/ON scenarios, voltage boost and battery test cases, per-source identity/position isolation, concurrency and source quality must pass before production.

## Operator workflow

1. Open Rule Manager and check the `DC-48V-24CELL` reference values.
2. Choose a rule and scope; enter approved, measured thresholds and recovery hysteresis.
3. Save as DRAFT; the published policy remains unchanged.
4. Inspect effective breaker policy and simulate a candidate condition without generating an actual alarm.
5. Confirm impact, then PUBLISH using admin privileges and the latest revision.
6. Observe independent V/A/P/E occurrences and correlated presentation within Alarm Center.
7. DISABLE/rollback deliberately; retain audit history and evaluate any existing active occurrences separately.
