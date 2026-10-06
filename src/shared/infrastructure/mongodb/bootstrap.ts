import type { Collection, Db, Document } from 'mongodb';

async function dropIndexIfPresent(collection: Collection<Document>, name: string): Promise<void> {
  let indexes;
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 26
    ) {
      return;
    }
    throw error;
  }

  if (indexes.some((index) => index.name === name)) {
    await collection.dropIndex(name);
  }
}

export async function ensurePersistenceIndexes(database: Db): Promise<void> {
  const topology = database.collection('topology_nodes');

  await Promise.all([
    topology.createIndex({ id: 1 }, { unique: true, name: 'uq_topology_id' }),
    topology.createIndex(
      { parentId: 1, lifecycle: 1, name: 1 },
      { name: 'ix_topology_parent_lifecycle_name' },
    ),
    topology.createIndex({ kind: 1, lifecycle: 1 }, { name: 'ix_topology_kind_lifecycle' }),
    topology.createIndex({ serialNumber: 1 }, { name: 'ix_topology_serial', sparse: true }),
    topology.createIndex(
      { deviceId: 1, kind: 1, lifecycle: 1 },
      { name: 'ix_topology_device_equipment' },
    ),
    topology.createIndex(
      { 'accessPorts.id': 1 },
      { unique: true, sparse: true, name: 'uq_topology_access_port_id' },
    ),
  ]);

  const warehouseTemplates = database.collection('warehouse_templates');
  await Promise.all([
    warehouseTemplates.createIndex({ id: 1 }, { unique: true, name: 'uq_warehouse_template_id' }),
    warehouseTemplates.createIndex(
      { lifecycle: 1, kind: 1, name: 1 },
      { name: 'ix_warehouse_lifecycle_kind_name' },
    ),
  ]);

  const powerPaths = database.collection('power_paths');
  await Promise.all([
    dropIndexIfPresent(powerPaths, 'ix_power_path_source'),
    dropIndexIfPresent(powerPaths, 'ix_power_path_target'),
    dropIndexIfPresent(powerPaths, 'uq_active_power_path_endpoints_feed'),
  ]);
  await Promise.all([
    powerPaths.createIndex({ id: 1 }, { unique: true, name: 'uq_power_path_id' }),
    powerPaths.createIndex(
      { sourceAccessPortId: 1, lifecycle: 1 },
      { name: 'ix_power_path_source_access_port' },
    ),
    powerPaths.createIndex(
      { targetAccessPortId: 1, lifecycle: 1 },
      { name: 'ix_power_path_target_access_port' },
    ),
    powerPaths.createIndex(
      { connectionKey: 1 },
      {
        unique: true,
        name: 'uq_active_power_path_connection_key',
        partialFilterExpression: {
          lifecycle: 'ACTIVE',
          connectionKey: { $type: 'string' },
        },
      },
    ),
  ]);

  const telemetryBindings = database.collection('telemetry_bindings');
  await Promise.all([
    telemetryBindings.createIndex(
      { id: 1 },
      { unique: true, name: 'uq_telemetry_binding_id' },
    ),
    telemetryBindings.createIndex(
      { protocol: 1, sourceIdentity: 1, sourcePointId: 1, metric: 1 },
      {
        unique: true,
        name: 'uq_active_telemetry_source_point_metric',
        partialFilterExpression: { lifecycle: 'ACTIVE' },
      },
    ),
    telemetryBindings.createIndex(
      { targetType: 1, targetId: 1, lifecycle: 1 },
      { name: 'ix_telemetry_target' },
    ),
  ]);

  const users = database.collection('users');
  await Promise.all([
    users.createIndex({ id: 1 }, { unique: true, name: 'uq_user_id' }),
    users.createIndex({ email: 1 }, { unique: true, name: 'uq_user_email' }),
  ]);

  const sessions = database.collection('sessions');
  await Promise.all([
    sessions.createIndex({ id: 1 }, { unique: true, name: 'uq_session_id' }),
    sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'uq_session_token_hash' }),
    sessions.createIndex({ userId: 1, revokedAt: 1 }, { name: 'ix_session_user_revoked' }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'ttl_session_expiry' }),
  ]);

  const authRateLimits = database.collection('auth_rate_limits');
  await Promise.all([
    authRateLimits.createIndex({ key: 1 }, { unique: true, name: 'uq_auth_rate_key' }),
    authRateLimits.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_auth_rate_expiry' },
    ),
  ]);
}
