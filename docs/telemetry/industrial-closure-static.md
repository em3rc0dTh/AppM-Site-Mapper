# Industrial closure — implementation only, 2026-10-23

Scope: existing Site Mapper PR #103 and BFDB PR #10, branch
`feat/site-mapper-work-2026-10-23`. This change follows the supplied closure plan.

**Status: implemented for subsequent validation. No tests were added or executed.**
No unit/integration/E2E suites, benchmark, emulator, simulation, browser session or certification
was initiated in this stage. Formatting, TypeScript inspection, lint and source/diff review are
static checks, not functional acceptance. GitHub may run its configured workflows upon publication;
that is independent of the deferred validation in the user's environment.

## Changes and preserved contracts

| Area               | Implementation                                                                                                                                                | Contract preserved                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Alarm projection   | Known ACTIVE=1 and RESOLVED=0 remain readable with stale/invalid/unknown quality; unknown state is NaN                                                        | Existing three-register point layout, FC03, FLOAT32 ABCD and quality codes 0–5                |
| Persistence        | Keep last interpreted signal when a later observation is unknown; retain the later raw observation separately with its cursor                                 | Original captures, full normalized history, source isolation and older-observation protection |
| Eltek measurements | Resolve measured-object OID/value varbind pairs into the actual measured OID, shared by GET/traps; retain generic originals and derivation links              | No inferred scale, unit, physical breaker or panel                                            |
| Enumerations       | Decode known MIB enum codes into state/label; unknown enum values remain UNKNOWN; optional explicit value maps convert approved state labels to numeric codes | Raw type and value retained; no arbitrary numeric encoding                                    |
| Profiles           | Synthetic V/A/temperature examples with explicit decimal scale; field template intentionally lacks scale; optional bounded OID-instance matching              | Unknown engineering scale remains UNKNOWN                                                     |
| Publication        | Catalog reports interpretation, equipment association, Modbus representability, assignment, quality and policy; delivery/Metasys acceptance stay unconfirmed  | No live register allocation or inferred Metasys approval                                      |
| Manifests          | Example v2 appends SNMP measurements/state at offsets 1030–1041 per unit; generator compares previous/output manifest before replacing it                     | Existing example v1 points at 1024/1027 and legacy offsets 0–767 unchanged                    |
| Observability      | Persist queue counters/high-water/full/retry/capture-failure snapshots; expose protected diagnostics and existing industrial-disclosure alerts                | No new dashboard, route replacement or notification to third parties                          |
| BFDB               | Heartbeat includes alarmSubsysSourceDescr; synthetic voltage/current/temperature measured-object scenarios                                                    | Existing GET agents, MQTT publishers and notification identifiers                             |

The original `quality` field still expresses interpretation validity/freshness. The catalog also
returns `communicationQuality`, independently computed from the last relevant observation. Silence
is not proof of a dead controller or an electrical power-loss condition. The Modbus quality word
continues reporting uncertainty while a known alarm remains latched. No timeout resolves an alarm.
Alarm `activatedAt`, `resolvedAt` and `alarmObservedAt` remain available. A later unknown reading
cannot erase a known alarm state or make a historical measured value fresh.

## Commissioning path and example extension

1. Authorize source/IP/principal and bind inventory deliberately, as in the existing runbook.
2. Select verified interpretation rules. Numeric measurement rules with no unit or scale produce
   UNKNOWN and null engineering value; raw data remain available. `evidence` records the rule's
   basis but is not automatic verification of a field controller.
3. Inspect the catalog's `publication` object. It reports `UNINTERPRETED`, `NOT_REPRESENTABLE`,
   `UNASSIGNED` or `ASSIGNED`, plus Unit ID, value/quality offsets and projection policy.
   An unfiltered catalog query also lists commissioned points with no observation as UNOBSERVED; those points are not attached to arbitrary equipment inspectors. Assignment alone does not assert successful delivery or Metasys configuration.
4. Append operator-approved entries and increment the manifest version. Supply the prior manifest
   as the third argument to `commission-points.mjs`, or retain the existing output file: either
   path checks existing assignments. No generator was executed during this closure stage.
5. Mount the same approved points file read-only into Site Mapper and the bridge using the overlay.
   `INDUSTRIAL_MODBUS_POINTS_FILE` points to the application mount. Failure to read/parse the manifest
   is an explicit alert; it does not hide the signal catalog.

The version 2 synthetic example preserves the first six points byte-for-value at their original
addresses and adds the following per Unit ID 1/2/3:

| Offset 0-based | Actual Eltek OID instance     | Synthetic interpretation                           | Quality offset |
| -------------: | ----------------------------- | -------------------------------------------------- | -------------: |
|           1030 | 1.3.6.1.4.1.12148.10.10.5.5.0 | Battery voltage raw integer × 0.1 V                |           1032 |
|           1033 | 1.3.6.1.4.1.12148.10.9.2.5.0  | Load current raw integer × 0.1 A                   |           1035 |
|           1036 | 1.3.6.1.4.1.12148.10.10.7.5.0 | Highest battery temperature raw integer × 0.1 degC |           1038 |
|           1039 | 1.3.6.1.4.1.12148.10.2.1.0    | MIB power-system status code and label             |           1041 |

These decimal scales are an explicit laboratory encoding, not a claim about installed firmware.
The MIB itself makes temperature dependent on Celsius/Fahrenheit controller settings. Use
`config/industrial/eltek-field.template.json` for field preparation: scale is intentionally absent.
Table-column rules may use `match: "oid-instance"` with the exact column base OID; exact matches
win, then the longest configured instance prefix. No rule should target a whole unrelated subtree.

## Operator diagnostics

`GET /api/telemetry/industrial/diagnostics` requires the existing `telemetry:read` permission.
It returns sanitized counters, queue depth/capacity, timestamps and alert codes, never spool paths,
credentials or original captures. `/signals` returns the same operational status; the existing
industrial disclosure displays alerts and keeps source/protocol, value/enum label, quality,
timestamp and assigned point information together.

MQTT and SNMP snapshots are atomically replaced as `diagnostics.json` in their persistent spool
volumes. Updates are coalesced, avoiding an unbounded diagnostic-write queue. The application reads
the SNMP snapshot through a read-only volume mount (`INDUSTRIAL_SNMP_DIAGNOSTICS_FILE`). Missing,
unreadable or >120-second-old snapshots are explicit diagnostic alerts. Runtime profile/outbox
initialization faults are also reported; the optional industrial capture must not prevent the
existing MQTT telemetry route from initializing.

| Condition                     | Observable behavior                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Queue at 80%                  | Protocol-specific QUEUE_HIGH_WATER alert                                                                 |
| Queue full                    | QUEUE_FULL plus rejection/capture-failure counters                                                       |
| Delivery failure              | Retained pending capture, retry counter and DELIVERY_RETRY alert                                         |
| Capture/spool failure         | Historical CAPTURE_FAILURE_RECORDED alert/counter, retained across restart when diagnostic storage works |
| Diagnostic volume unavailable | UNAVAILABLE/STALE or DIAGNOSTIC_STORAGE_FAILED alert                                                     |

Capture-failure alerts describe recorded events; they are not silently cleared by the next
successful delivery. Use the site's monitoring acknowledgement/baseline policy for those counters.
Queue-pressure/retry conditions follow pending depth. Reading the endpoint is not notification
routing: operators must configure their monitoring consumer/alert route. This change sends no
emails, messages or external notifications. If the diagnostic disk also fails, current process
faults and stale/missing snapshots are the remaining evidence; zero loss is not guaranteed.
Queue capacity variables are `INDUSTRIAL_MQTT_MAX_PENDING` and `SNMP_TRAP_MAX_PENDING` (1–10,000).

## Deferred validation

The user's environment must still check: latched alarm plus STALE quality after elapsed time;
explicit clear and restart recovery; direct GET and trap-referenced voltage/current/temperature;
unknown enum/scale and profile changes; v1/v2c/v3/informs; prior-manifest immutability; queue-full,
disk/DB failure and recovery diagnostics; actual QDF/inspector appearance; field firmware/scales,
source identity and Metasys import. No item in this list is marked passed in this stage.

Historical test evidence in `industrial-lab-evidence.md` pertains to the earlier baseline
`ccd801d74ea8e3fe6f9280affe740454415b7058`, not to this untested closure revision.
No PR was merged to main.
