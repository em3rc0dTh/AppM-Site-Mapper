# Backup and Restore

## Scope

Backup/restore is an infrastructure operation around the canonical MongoDB database.

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

Telemetry latest-value state is transient and is not a MongoDB recovery requirement unless a future telemetry-history feature explicitly persists it.

## Rollback after migration

The G13 migration engine stages data first.

If post-promotion verification fails, prefer restoring the verified pre-migration backup rather than manually editing a partially migrated hierarchy.

## Evidence

Production backup/restore certification requires provider/environment evidence. Repository tests cannot truthfully prove that a specific production backup provider has restored a real database.
