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

## Hardening 2026-10-26: capture, outbox and recovery order

Implementation status: recovery mechanisms are coded/documented, **not rehearsed by this change**. No production RPO or RTO is certified. See [hardening delivery and operator acceptance](mk1-critical-hardening-2026-10-26.md).

The recovery set includes more than the two databases:

| Store                    | Include in a coordinated recovery point                                                                                                                                                                                            | Retention responsibility                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MongoDB                  | topology_nodes, power_paths, telemetry_bindings, users, identity_initialization, sessions subject to incident policy, admin_audit, warehouse_templates, workspace state, schema_migrations, integrity_fences and promotion_journal | Canonical data/audit have no new deletion policy. Agree encrypted backup retention and tested restore history with the operator.                                                                      |
| Industrial MongoDB       | industrial_events, industrial_signal_history, industrial_signals, industrial_sources, industrial_logical_registry, industrial_timescale_outbox, industrial_delivery_status                                                         | Existing raw/event/history TTL follows INDUSTRIAL_RETENTION_DAYS (default 90). Pending delivery must be backed up independently of expiring capture evidence. Do not assume a TTL is a backup policy. |
| TimescaleDB              | telemetry_samples, telemetry_entity_samples, snmp_source_progress, snmp_ingest_batches and industrial_observations, indexes, extensions, sequences/metadata, supported WAL/PITR configuration                                      | Existing industrial SQL declares no automatic retention deletion policy. Configure approved retention/PITR; do not infer it from Mongo TTL.                                                           |
| MQTT spool               | Complete private INDUSTRIAL_MQTT_SPOOL volume per subscriber, pending JSON, diagnostics, and temporary files retained as incident evidence                                                                                         | Never delete pending files to free capacity without an explicit data-loss decision. Archive diagnostics separately if long-term capture-failure evidence is needed.                                   |
| SNMP spool/collectors    | Their persistent queues, source credentials/configuration and anti-replay/source identity state                                                                                                                                    | Coordinate with collector owners; Mongo/Timescale backup alone does not contain undelivered collector records.                                                                                        |
| Broker and configuration | Durable broker sessions/queues where supported, MQTT_CLIENT_ID assignments, profiles, logical point manifests, Modbus publication map and versioned configuration                                                                  | External broker policy remains the broker owner's responsibility. Secrets go to the secret manager, never Git.                                                                                        |

Recovery order for an isolated destination:

1. Stop all writers and consumers that can delete acknowledged queue files; preserve incident copies of databases, queues and configuration. Record backup times and the last accepted/delivered identifiers for each source.
2. Restore Mongo as a coherent database, including identities, topology, references, industrial evidence and pending outbox. Keep all application versions stopped. Check the recorded schema version and index/validator compatibility before permitting writes. Decide session revocation explicitly after a security incident.
3. Restore Timescale with the matching extension/schema versions and all ingestion progress/idempotency tables. A missing progress table can change replay behavior even when historical rows exist. Do not blindly initialize empty tables over a restored database.
4. Restore each spool to its original persistent volume ownership and subscriber assignment. Preserve captureId and publisher messageId. Keep new broker deliveries disabled while reconciling retained captures against Mongo events and Timescale delivery IDs. A duplicate replay is expected to be idempotent only within the implemented ID contract and retained deduplication window.
5. Confirm the capture and history services are healthy on the isolated destination. Resume outbox/spool consumers under observation. Compare pending counts, delivery failures, raw/history bounds and known event IDs; absence of an error log alone is insufficient.
6. Restore broker/session routing, then resume new source traffic. Refresh LIVE/Modbus with newly accepted samples. Do not use old replayed values as certified current process state.
7. Record missing intervals, duplicate/rejected identities, measured recovery duration, oldest lost timestamp and operator decisions before returning to normal operations.

A filesystem rename alone is not treated as durable capture: the MQTT spool now fsyncs the file and containing directory before acknowledging successful enqueue. This relies on the operating system and persistent volume honoring fsync. It does not survive loss of the only volume, and it does not implement an off-host backup.

### Promotion interruptions and non-destructive rollback

Promotion uses a unique candidate collection, retained live backup and a `promotion_journal` with PREPARED, LIVE_RENAMED, CANDIDATE_PROMOTED and COMPLETE phases. It holds `integrity_fences.maintenance` across the swap. The namespace renames are individually atomic; the pair is **not** an atomic multi-collection transaction.

On failure, keep all writers stopped. Read the exact candidate/backup names and maintenance owner from the journal and collection inventory. Preserve any partially promoted collection under a distinct incident name before restoring the retained backup; never overwrite or drop it merely to make a command succeed. If the original live collection has been renamed and the candidate rename fails, the script attempts to restore the retained backup when no live namespace exists. It deliberately retains maintenance on error. A crash between journal updates requires comparing the actual namespaces; journal phase alone is not sufficient evidence.

After recovery, verify the restored topology against the retained PowerPaths and TelemetryBindings, as well as indexes, validator and document counts. Release only the exact maintenance owner's lock after operator approval and a recorded recovery decision. Old application versions and external writers do not honor this lock and must remain stopped independently.

The hardening migration adds indexes/validator without repairing documents or dropping obsolete indexes. Failure can leave some additive indexes installed and the maintenance lock held. Inspect and resume conservatively. Automatic startup no longer drops old power-path indexes. Their eventual removal, if required, needs a separate reviewed/versioned migration.

### Objectives still to be decided

Backup frequency, off-host retention, immutable copies, encryption/key recovery, broker queue limits, maximum supported replay window, spool capacity alerts, Mongo/Timescale PITR coverage and measured RPO/RTO remain environment-specific acceptance items. No values are promised by this PR. Run restore drills on an isolated target and attach real evidence before changing the Draft/release status.
