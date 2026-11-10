/*
 * Automatic operational telemetry monitoring indexes.
 *
 * Run deliberately against the selected Site Mapper database after backup.
 * This migration does not modify telemetry bindings, topology or alarm history.
 */

const watches = db.getCollection('telemetry_watch_state');

watches.createIndex(
  { id: 1 },
  {
    name: 'telemetry_watch_state_id_unique',
    unique: true,
  },
);

watches.createIndex(
  { protocol: 1, sourceIdentity: 1, scope: 1, targetId: 1 },
  {
    name: 'telemetry_watch_source_scope_target',
  },
);

watches.createIndex(
  { lastObservedAt: 1 },
  {
    name: 'telemetry_watch_last_observed',
    sparse: true,
  },
);

printjson({
  collection: watches.getName(),
  indexes: watches.getIndexes().map((index) => index.name),
});
