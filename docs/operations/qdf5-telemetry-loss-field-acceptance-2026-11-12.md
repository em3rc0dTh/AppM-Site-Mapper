# QDF-5 — Telemetry loss and recovery field acceptance record

**Date:** 2026-11-12 (America/Lima; UTC−05:00)  
**System:** AppManager SiteMapper MK2, Telxius Lurín Cable Landing Station  
**Asset:** BDFB QDF-5  
**Evidence status:** **PARTIAL FIELD ACCEPTANCE — OPERATOR OBSERVED; FORENSIC CERTIFICATION OPEN**  
**Repository reference:** `main`, automatic telemetry monitoring contract

## Purpose

Record the operator's communication-interruption exercise, the visible loss alarm, and the unexpectedly fast return to operational status. This is an evidence-based operational record, not a claim of independent broker/DB inspection.

## Observation log

| Local time      | Event                                                                                               | Evidence                                    |
| --------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 09:05:02        | Last valid telemetry timestamp displayed for QDF-5                                                  | Operator screenshot of power-path telemetry |
| 09:08 (approx.) | Operator requested communication/telemetry stop                                                     | Operator statement                          |
| 09:10           | Next nominal publishing opportunity had no usable new data                                          | Operator statement                          |
| 09:15           | Next nominal publishing opportunity had no usable new data                                          | Operator statement                          |
| ~09:19–09:20    | `TELEMETRY_LOSS` surfaced and QDF-5 changed to ALARMA                                               | Operator screenshot and statement           |
| ~09:21          | Communication restored; QDF-5 turned green and the active loss alarm disappeared almost immediately | Explicit operator confirmation              |

All times except the UI last-update timestamp are approximate operator-reported times; they have not been corroborated against immutable server timestamps.

## Source inspection (repository implementation, not field runtime proof)

- `src/modules/telemetry/domain/telemetry-freshness.ts`: expected cadence 5 min; LIVE max age ~6 min; OFFLINE after 15 min.
- `src/modules/alarm/application/telemetry-alarm-evaluator.ts`: watchdog timer every 5 s, automatic source alarm on age **greater than** the loss threshold; source resolution only when the persisted source watch `freshStreak` reaches the configured recovery sample count.
- `src/modules/telemetry/infrastructure/telemetry-runtime.ts`: default loss 900,000 ms and recovery samples 2; monitoring mode is read from `TELEMETRY_WATCH_MODE`.
- `src/modules/telemetry/infrastructure/mongo-telemetry-watch-repository.ts`: each increasing accepted usable observation increments `freshStreak`; `markLost` resets streak to 0.
- `src/modules/telemetry/application/telemetry-service.ts`: accepted samples publish to LIVE before history persistence; UI updates can precede formal alarm state resolution.
- `src/components/workspace/home-live-overview.tsx`: visual status depends on both active alarm rollup and currently projected telemetry. `isTelemetryTransportCurrent` can count a sample for up to 15 minutes.
- `docker-compose.telemetry.yml`: baseline `TELEMETRY_WATCH_MODE=shadow`; actual running deployment mode **not read or verified**. A displayed live-generated alarm would be consistent with active operation, but fixture or other causes must be excluded before making that assertion.

## Technical interpretation

The elapsed **~11–12 minutes since the operator's 09:08 instruction** is not the system's timeout measurement. The 15-minute loss window is calculated from the last accepted packet, approximately 09:05; an alarm near 09:20 is therefore consistent with intended behavior, subject to clock precision.

The rapid restoration of visible data is expected after a fresh packet. Immediate formal alarm clearing can be consistent with two rapidly accepted usable observations, because the current implementation does not require a minimum time between recovery observations. The operator confirmed that the red alarm disappeared and the status became green, but the exact observations and `TELEMETRY_SOURCE_RECOVERED` transition are not independently verified.

## Acceptance matrix

| Test criterion                                              | Result                              | Basis                                     |
| ----------------------------------------------------------- | ----------------------------------- | ----------------------------------------- |
| Last good value remains visible before expiry               | OBSERVED                            | UI at 09:05:02                            |
| Source loss is surfaced after sustained absence             | PASS — OPERATOR OBSERVED            | QDF-5 alarm near 09:20                    |
| Source returns to green after resuming data                 | PASS — OPERATOR OBSERVED            | Operator explicitly confirmed             |
| Active `TELEMETRY_LOSS` disappears on recovery              | PASS — OPERATOR OBSERVED            | Operator explicitly confirmed             |
| Loss threshold equals configured 15-minute policy           | CODE VERIFIED; RUNTIME NOT VERIFIED | Repository only                           |
| Recovery used 2 distinct accepted samples                   | NOT VERIFIED                        | No receive/packet evidence                |
| Formal RESOLVED transition persisted with correct timestamp | NOT VERIFIED                        | No `alarm_transitions` evidence           |
| No fixture contamination in viewed alarms                   | NOT VERIFIED                        | Fixture script exists; DB not inspected   |
| End-to-end industrial alarm certification                   | **NOT CERTIFIED**                   | Missing durable logs and runtime evidence |

## Closure evidence required

1. Read-only, sanitized rows of `alarm_occurrences` and `alarm_transitions` for QDF-5 with `openedAt`, resolution event, source context and `reason`.
2. Corresponding `telemetry_watch_state` record with `lastObservedAt`, `freshStreak`, last usable and last state.
3. First two accepted MQTT observations after ~09:21, each with `receivedAt`, `sourceIdentity` and available message ID; determine whether they came from independent publishes or replay/duplicates.
4. Deployed effective `TELEMETRY_WATCH_MODE`, loss and recovery settings (omit credentials).
5. Confirm occurrences lack the lab fixture marker `LAB_UI_DESIGN_FIXTURE_2026_10_30`.
6. Correlate telemetry sample, watchdog and UI alarm update timestamps to determine latency.

## Decision and follow-up

**Approve the observed behavior as a field acceptance of visible loss and recovery**, not as completed end-to-end industrial certification. Preserve the existing 15-minute timeout pending evidence and avoid changing firmware, broker or runtime based on approximate manual observations alone.

**UX debt:** distinguish `LIVE`, `STALE`, `OFFLINE`, `RECOVERING`, `RECOVERED`; avoid rendering `OPERATIVO` merely because 15-minute-old measurements are still projectable.

No live data, secrets, payloads, deployment settings, or alarm records were modified in producing this document.
