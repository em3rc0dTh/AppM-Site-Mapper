/*
 * Optional pre-deployment telemetry-watch index provisioning.
 *
 * Ensure a verified MongoDB backup first. The regular application bootstrap
 * also provisions these indexes; this script is safe with both legacy names
 * and the canonical bootstrap names. No index is dropped or renamed.
 */

const watches = db.getCollection('telemetry_watch_state');
const exists = db.getCollectionInfos({ name: 'telemetry_watch_state' }).length > 0;
const existingIndexes = exists ? watches.getIndexes() : [];

const expectedIndexes = [
  { key: { id: 1 }, name: 'uq_telemetry_watch_state_id', unique: true },
  {
    key: { protocol: 1, sourceIdentity: 1, scope: 1, targetId: 1 },
    name: 'ix_telemetry_watch_source_scope_target',
  },
  { key: { lastObservedAt: 1 }, name: 'ix_telemetry_watch_last_observed', sparse: true },
];

for (const expected of expectedIndexes) {
  const matching = existingIndexes.find(
    (index) =>
      Object.keys(index.key).length === Object.keys(expected.key).length &&
      Object.entries(expected.key).every(([field, direction]) => index.key[field] === direction),
  );

  if (matching) {
    if (
      Boolean(matching.unique) !== Boolean(expected.unique) ||
      Boolean(matching.sparse) !== Boolean(expected.sparse)
    ) {
      throw new Error('TELEMETRY_WATCH_INDEX_CONFLICT: incompatible index ' + matching.name);
    }
    print('Preserving compatible telemetry watch index: ' + matching.name);
    continue;
  }

  const options = { name: expected.name };
  if (expected.unique) options.unique = true;
  if (expected.sparse) options.sparse = true;
  watches.createIndex(expected.key, options);
  existingIndexes.push({ key: expected.key, ...options });
}

printjson({
  collection: watches.getName(),
  indexes: watches.getIndexes().map((index) => index.name),
});
