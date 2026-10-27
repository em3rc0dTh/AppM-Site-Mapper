# Site Mapper MK1 — Audited deletion and historical retention

**Status:** implemented on the feature branch; production acceptance requires operator validation.

## Meaning of Delete

Delete means **retire from the active inventory**, not erase historical evidence.

- Nodes (including the one Device identity and its recursive Equipment graph) become `ARCHIVED` with a deletion tombstone (`operationId`, `actorId`, `at`, `mode`).
- Historical entity documents, their original relationships, serials and `rackPlacement` snapshots remain in MongoDB.
- Active AccessPorts on retired Equipment become archived; attached PowerPaths and TelemetryBindings become archived **without changing their identifiers**.
- Existing telemetry sample/history storage (e.g. TimescaleDB, industrial history) is **not deleted or rewritten**.
- A surviving parent Equipment loses the retired child reference; POSitional `children[]` keeps the empty slot as `null`. A surviving Device loses the retired root Equipment reference.
- Rack CAS occupancy for the retired Equipment is freed; remaining Equipment and their reservations are preserved. An archived Rack has no active CAS reservations.

## Explicit operations

- `SINGLE` retires only the selected entity. Reject if active descendants exist.
- `TREE` retires the selected entity and **every active descendant** as a single transaction.
- The UI shows the affected entity, Equipment and Device counts, CAS allocations, PowerPaths and telemetry bindings, then requires the exact entity name.
- The server rebuilds the full graph and rejects confirmation if the preview's digest is stale. The digest is not authorization.
- The actor comes from the authenticated session; the HTTP body may not select or override that actor.
- Only a `system:danger` principal may preview or execute deletion.
- MongoDB transactions include topology CAS changes, operational reference retirement, and one `TOPOLOGY_DELETE` audit record. If a step fails, the transaction aborts.
- Memory mode rejects deletion because it cannot provide cross-repository atomicity.
- Limit: 2000 active topology nodes per operation. Larger subtrees require an explicitly designed batch protocol.

## Audit evidence

`admin_audit` retains the authenticated actor, operation ID, mode, exact root entity name/kind, every affected entity ID/name/kind, original RackPlacement snapshots, retired PowerPath IDs, retired TelemetryBinding IDs and timestamp. Deletion does not remove this record.

`Archive` (legacy lifecycle management) is different from confirmed `Delete`. Tombstoned nodes are not restored through the generic `restore` action.

## Out of scope

- Purging telemetry/history databases.
- Physical movement between racks.
- Any automatic migration to another Device.
- Hard deletion of MongoDB historical records.
- Customer-configurable retention policies.
