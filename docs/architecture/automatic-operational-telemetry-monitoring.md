# Automatic Operational Telemetry Monitoring

**Status:** implementation baseline on `feat/automatic-operational-alarm-commissioning`.

## Purpose

Telemetry commissioning and telemetry-loss monitoring are one operational contract.

> If Site Mapper accepts an MQTT source/point binding as operational, the same binding becomes an expected observation automatically. No separate manual telemetry-loss policy is required.

Electrical thresholds remain separate because Site Mapper must not invent engineering limits. Existing commissioned `LOW_VOLTAGE`, `OVERCURRENT` and `POWER_LOSS` policies continue to use approved threshold/protection data.

## Invariants

1. MQTT ingestion, normalization, history and Modbus delivery do not depend on alarm persistence succeeding.
2. Source identity is the stable MQTT `sourceIdentity`/serial, never the source IP address.
3. Missing telemetry is not electrical zero.
4. An explicit point `state=OFFLINE` is communication/coverage evidence and must not assert electrical threshold alarms from zero-filled fields.
5. Watch state survives process restart in `telemetry_watch_state`.
6. Existing active telemetry bindings are the authority for what Site Mapper expects to observe.
7. A source-level loss suppresses descendant panel/breaker telemetry-loss occurrences.
8. A complete panel loss suppresses breaker telemetry-loss occurrences under that panel.
9. A partial panel loss remains breaker-scoped.
10. Multiple simultaneous source losses escalate source alarm severity and retain shared-impact evidence.

## Observation hierarchy

```text
MQTT source / QDF
        |
        +-- panel
              |
              +-- commissioned breaker point
```

### Breaker loss

If one expected point exceeds the loss window while sibling points remain usable:

```text
QDF       LIVE
Panel     DEGRADED
Breaker   TELEMETRY_LOSS
```

### Panel loss

If all commissioned breaker points under one panel are unavailable while the MQTT source remains live:

```text
QDF       LIVE
Panel     TELEMETRY_LOSS
Breakers  unavailable because of parent loss
```

The panel occurrence is primary; child alarm fan-out is suppressed.

### QDF/source loss

If the commissioned MQTT source itself exceeds the loss window:

```text
QDF       TELEMETRY_LOSS
Panels    unavailable because of source loss
Breakers  unavailable because of source loss
```

Descendant telemetry-loss occurrences are resolved/suppressed as superseded by the source condition.

### Multiple QDF loss

Two or more simultaneously lost commissioned sources are escalated to `CRITICAL` and each source occurrence carries evidence describing the correlated fleet impact. This preserves canonical Device/Equipment alarm ownership without inventing a non-canonical global alarm target.

## Persistence

`telemetry_watch_state` stores:

- protocol;
- source identity;
- scope (`SOURCE` or `POINT`);
- canonical target;
- optional source point;
- first expected time;
- last observed packet time;
- last usable observation time;
- latest reported point state;
- fresh recovery streak;
- explicit-offline streak.

On the first rollout, an already-commissioned binding receives one complete loss-window bootstrap grace period. After a watch exists, restarts reuse persisted state; a source that was already lost does not have to publish again before the watchdog can detect it.

## Default BFDB policy

The runtime defaults to the established five-minute BFDB field cadence:

```text
expected cadence             5 minutes
automatic loss              15 minutes
recovery samples             2
reported OFFLINE debounce    2 samples
```

Runtime overrides:

```text
TELEMETRY_WATCH_LOSS_AFTER_MS
TELEMETRY_WATCH_RECOVERY_SAMPLES
TELEMETRY_WATCH_REPORTED_OFFLINE_SAMPLES
```

These values are operational policy, not electrical thresholds.

## Threshold alarms

Automatic observability does not fabricate limits.

```text
binding exists
  -> automatic telemetry watch

verified/approved breaker protection exists
  -> OVERCURRENT policy

approved low-voltage/power-loss policy exists
  -> corresponding electrical evaluator
```

An explicit `OFFLINE` point bypasses electrical evaluation until usable telemetry returns.

## Failure isolation

Alarm/watch failures are logged as `alarm.telemetry_evaluation_failed` or `alarm.telemetry_watchdog_failed`. They do not reject an accepted MQTT packet and do not stop LIVE/history/Modbus processing.

## Rollout

1. Merge code only after CI/acceptance.
2. Back up MongoDB.
3. Apply `scripts/migrations/automatic-telemetry-watch-indexes.mongosh.js`.
4. Deploy without manual alarm-policy seeding.
5. Observe `telemetry_watch_state` for one complete source cadence/loss window.
6. Confirm source/panel/breaker classifications against field reality.
7. Validate loss and recovery with controlled communication interruption before production acceptance.

No TFARM04 live mutation is performed by this branch.
