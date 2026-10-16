# Backup and Restore

## Scope

Backup and restore cover **two independent persisted stores**: canonical MongoDB (inventory, users, bindings and PowerPaths) and the Site Mapper-owned TimescaleDB (telemetry history). The external BFDB emulator/gateway databases are separate and require their own policies.

Site Mapper does not implement destructive automatic database reset in production.

## Required production policy

Before production release, define and verify:

- backup mechanism/provider;
- backup frequency;
- retention period;
- encryption policy;
- access control;
- restore destination;
- recovery-time objective (RTO);
- recovery-point objective (RPO).

These values are environment/business decisions and are not invented by the repository.

## Pre-migration backup

Before promoting G13 migration staging data:

1. take a target-database backup;
2. verify that the backup is readable/restorable;
3. record the source migration fingerprint;
4. retain the migration ID map in a secure operational store;
5. retain the migration report outside this public repository.

No production promotion should proceed without a verified restore point.

## Restore verification

A restore exercise should verify:

- users;
- sessions according to the desired incident policy;
- topology hierarchy;
- Device/Equipment sibling relationships;
- Room polygons;
- Container/Rack CAS state;
- BDFB internal structures;
- PowerPaths.

LIVE/latest state and the Modbus sidecar are **ephemeral**. MongoDB backups do not include Site Mapper TimescaleDB tables. A restore plan must cover both persisted stores; any gaps during an MQTT/history outage are not reconstructed automatically from a UI refresh.

## Rollback after migration

The G13 migration engine stages data first.

If post-promotion verification fails, prefer restoring the verified pre-migration backup rather than manually editing a partially migrated hierarchy.

## Evidence

Production backup/restore certification requires provider/environment evidence. Repository tests cannot truthfully prove that a specific production backup provider has restored a real database.

## TimescaleDB recovery policy

Historical telemetry is product data, not a transient UI cache. Before a
persistent MVP pilot, identify the approved TimescaleDB backup mechanism,
retention, encryption, RPO/RTO and a **separate isolated restore target**.

The restore rehearsal must verify:

- the `telemetry_samples` hypertable, indexes and breaker identity columns;
- the `telemetry_entity_samples` hypertable and target/source provenance;
- recent sample counts and latest `received_at` on a known breaker;
- the history-store adapter `/health` and authorized history queries;
- expected behavior when the historical service is unavailable.

Do not restore a Timescale dump over the active lab/production database.
Stop writers, isolate the destination and obtain explicit approval before
any actual restore. A file backup alone is not proof of recoverability.

## Data consistency and incident gaps

MongoDB and TimescaleDB are **not one distributed transaction**. A valid
TelemetryBinding in MongoDB does not guarantee that all MQTT samples were
persisted during a storage outage. After recovery, compare new timestamps
and the writer's failure diagnostics, rather than only verifying that a
historical chart displays old rows.

The Modbus service uses transient Latest State and needs newly accepted
samples after restart; no historical replay to Modbus is certified.
See [history incident runbook](history-connectivity.md) and
[MVP readiness](../release/MVP-READINESS.md).
