import type { Collection, Db, Document, IndexDescription } from 'mongodb';

export const HARDENING_SCHEMA_VERSION = 'mk1-critical-hardening-001';
export const topologyIndexes: readonly IndexDescription[] = [
  { key: { id: 1 }, unique: true, name: 'uq_topology_id' },
  { key: { parentId: 1, lifecycle: 1, name: 1 }, name: 'ix_topology_parent_lifecycle_name' },
  { key: { kind: 1, lifecycle: 1 }, name: 'ix_topology_kind_lifecycle' },
  { key: { serialNumber: 1 }, name: 'ix_topology_serial', sparse: true },
  { key: { serialNumber: 1 }, name: 'uq_active_publisher_serial', unique: true,
    partialFilterExpression: { lifecycle: 'ACTIVE', kind: { $in: ['DEVICE', 'EQUIPMENT'] }, serialNumber: { $type: 'string' } } },
  { key: { deviceId: 1, kind: 1, lifecycle: 1 }, name: 'ix_topology_device_equipment' },
  { key: { 'accessPorts.id': 1 }, unique: true, sparse: true, name: 'uq_topology_access_port_id' },
  { key: { parentId: 1 }, unique: true, name: 'uq_active_rack_position',
    partialFilterExpression: { kind: 'CONTAINER_RACK', lifecycle: 'ACTIVE' } },
];

/** Additive revision: absent is legacy revision zero, never a wildcard CAS. */
export const topologyValidator = { $jsonSchema: {
  bsonType: 'object', required: ['id', 'kind', 'parentId', 'name', 'lifecycle', 'createdAt', 'updatedAt'],
  properties: {
    id: { bsonType: 'string', minLength: 1 },
    name: { bsonType: 'string', minLength: 1 },
    parentId: { bsonType: ['string', 'null'] },
    kind: { enum: ['NETWORK', 'SITE', 'STRUCTURE', 'LEVEL', 'ROOM_SUBSTRUCTURE', 'CONTAINER_CLUSTER_BAY', 'POSITION', 'CONTAINER_RACK', 'DEVICE', 'EQUIPMENT'] },
    lifecycle: { enum: ['ACTIVE', 'ARCHIVED'] },
    createdAt: { bsonType: 'string' }, updatedAt: { bsonType: 'string' },
    revision: { bsonType: ['int', 'long', 'double'], minimum: 1, maximum: 9007199254740991, multipleOf: 1 },
    accessPorts: { bsonType: 'array' }, children: { bsonType: 'array' }, rootEquipmentIds: { bsonType: 'array' }, cas: { bsonType: 'array' },
  },
} };

export async function ensureTopologyIndexes(collection: Collection<Document>): Promise<void> {
  for (const index of topologyIndexes) {
    const { key, ...options } = index;
    await collection.createIndex(key, options);
  }
}

export async function prepareRuntimeTopology(database: Db): Promise<void> {
  const exists = await database.listCollections({ name: 'topology_nodes' }, { nameOnly: true }).hasNext();
  if (!exists) {
    try { await database.createCollection('topology_nodes', { validator: topologyValidator, validationLevel: 'strict', validationAction: 'error' }); }
    catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 48) throw error; }
    await ensureTopologyIndexes(database.collection('topology_nodes'));
  } else {
    // Existing data/indexes are never rewritten on startup. Operators run the versioned migration.
    const indexes = await database.collection('topology_nodes').indexes();
    if (topologyIndexes.some((required) => !indexes.some((actual) => actual.name === required.name && JSON.stringify(actual.key) === JSON.stringify(required.key) && (!required.unique || actual.unique) && (!required.sparse || actual.sparse) && JSON.stringify(actual.partialFilterExpression) === JSON.stringify(required.partialFilterExpression)))) {
      throw new Error(`MIGRATION_REQUIRED: ${HARDENING_SCHEMA_VERSION}`);
    }
    const metadata = await database.listCollections({ name: 'topology_nodes' }).next();
    if (JSON.stringify(metadata?.options?.validator) !== JSON.stringify(topologyValidator)) throw new Error(`MIGRATION_REQUIRED: ${HARDENING_SCHEMA_VERSION} validator`);
  }
}
