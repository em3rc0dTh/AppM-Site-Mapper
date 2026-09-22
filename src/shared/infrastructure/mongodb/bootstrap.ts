import type { Db } from 'mongodb';

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
  ]);

  const powerPaths = database.collection('power_paths');
  await Promise.all([
    powerPaths.createIndex({ id: 1 }, { unique: true, name: 'uq_power_path_id' }),
    powerPaths.createIndex({ sourceEntityId: 1 }, { name: 'ix_power_path_source' }),
    powerPaths.createIndex({ targetEntityId: 1 }, { name: 'ix_power_path_target' }),
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
