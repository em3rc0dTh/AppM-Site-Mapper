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

Runtime rollout mode:

```text
TELEMETRY_WATCH_MODE=shadow   # calculate + log transitions, create no occurrences
TELEMETRY_WATCH_MODE=active   # persist AlarmOccurrence/AlarmTransition
```

The default is `shadow`. Shadow transitions are logged as
`alarm.telemetry_shadow_transition` and are de-duplicated until the condition resolves.

Runtime overrides:

```text
TELEMETRY_WATCH_LOSS_AFTER_MS
TELEMETRY_WATCH_RECOVERY_SAMPLES
TELEMETRY_WATCH_REPORTED_OFFLINE_SAMPLES
```

These values are operational policy, not electrical thresholds.

The base `docker-compose.telemetry.yml` passes all four `TELEMETRY_WATCH_*` variables
to the `site-mapper` container. Its default remains **shadow**, even if MQTT
is enabled. The final field environment/overlay must be inspected before
changing the mode; changing a host-only environment file without recreating
the application container does not update its running process.

The existing seed-01 industrial Equipment (gateway, controller and meters)
remain in MongoDB to preserve telemetry bindings, even when customer-facing
navigation hides them. Visual hiding is not telemetry disabling.

### Safe index compatibility

`ensurePersistenceIndexes()` creates the three telemetry-watch indexes during
normal bootstrap. The optional `scripts/migrations/automatic-telemetry-watch-indexes.mongosh.js`
uses matching canonical index specifications. **Both preserve existing equivalent
legacy-named indexes**, so already-prepared databases do not receive duplicate
or conflicting index definitions. A same-key index with incompatible uniqueness
or sparse options causes a deliberate failure; neither routine drops or renames
an index. Run the optional script only against the verified target database
after a restorable backup, never against a guessed MongoDB database name.

For field rollout, use `shadow` first. Only enable `active` after verifying
the correct MQTT source identities, watch state, 15-minute loss window and
clean recovery behavior in TFARM04. No forced source outage is permitted without
an approved test window.

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
3. Inspect existing telemetry-watch index specifications. Bootstrap creates compatible indexes automatically; run the optional idempotent migration only when required by the change plan.
4. Deploy without manual alarm-policy seeding.
5. Observe `telemetry_watch_state` for one complete source cadence/loss window.
6. Confirm source/panel/breaker classifications against field reality.
7. Validate loss and recovery with controlled communication interruption before production acceptance.

No TFARM04 live mutation is performed by this branch.
