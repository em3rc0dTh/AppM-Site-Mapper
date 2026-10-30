import { prepareRuntimeTopology } from './topology-schema';
import type { Db } from 'mongodb';

export async function ensurePersistenceIndexes(database: Db): Promise<void> {
  await database
    .collection('integrity_fences')
    .createIndex({ key: 1 }, { unique: true, name: 'uq_integrity_fence_key' });
  await database
    .collection('identity_initialization')
    .createIndex({ key: 1 }, { unique: true, name: 'uq_identity_initialization_key' });
  await prepareRuntimeTopology(database);

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
      { sourceAccessPortId: 1 },
      {
        unique: true,
        name: 'uq_active_power_path_source',
        partialFilterExpression: { lifecycle: 'ACTIVE' },
      },
    ),
    powerPaths.createIndex(
      { targetAccessPortId: 1 },
      {
        unique: true,
        name: 'uq_active_power_path_target',
        partialFilterExpression: { lifecycle: 'ACTIVE' },
      },
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
    telemetryBindings.createIndex({ id: 1 }, { unique: true, name: 'uq_telemetry_binding_id' }),
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

  const industrialProfiles = database.collection('industrial_communication_profiles');
  await Promise.all([
    industrialProfiles.createIndex(
      { equipmentId: 1 },
      { unique: true, name: 'uq_industrial_profile_equipment' },
    ),
    industrialProfiles.createIndex({ bdfbDeviceId: 1 }, { name: 'ix_industrial_profile_bdfb' }),
    industrialProfiles.createIndex(
      { sourceIdentity: 1 },
      {
        unique: true,
        name: 'uq_industrial_gateway_source',
        partialFilterExpression: { role: 'GATEWAY', sourceIdentity: { $type: 'string' } },
      },
    ),
    industrialProfiles.createIndex(
      { gatewayEquipmentId: 1, 'rs485.slaveId': 1 },
      {
        unique: true,
        name: 'uq_industrial_rs485_gateway_slave',
        partialFilterExpression: { role: 'METER' },
      },
    ),
  ]);

  const industrialCredentials = database.collection('industrial_credentials');
  await Promise.all([
    industrialCredentials.createIndex(
      { equipmentId: 1 },
      { unique: true, name: 'uq_industrial_credential_equipment' },
    ),
  ]);

  const industrialCredentialEvents = database.collection('industrial_credential_events');
  await Promise.all([
    industrialCredentialEvents.createIndex(
      { id: 1 },
      { unique: true, name: 'uq_industrial_credential_event_id' },
    ),
    industrialCredentialEvents.createIndex(
      { equipmentId: 1, occurredAt: -1 },
      { name: 'ix_industrial_credential_event_equipment_time' },
    ),
  ]);

  const alarmPolicies = database.collection('alarm_policies');
  await Promise.all([
    alarmPolicies.createIndex({ id: 1 }, { unique: true, name: 'uq_alarm_policy_id' }),
    alarmPolicies.createIndex(
      { enabled: 1, targetType: 1, targetId: 1 },
      { name: 'ix_alarm_policy_enabled_target' },
    ),
    alarmPolicies.createIndex(
      { targetId: 1, sourceContext: 1 },
      { name: 'ix_alarm_policy_target_source_context' },
    ),
  ]);

  const alarmOccurrences = database.collection('alarm_occurrences');
  await Promise.all([
    alarmOccurrences.createIndex({ id: 1 }, { unique: true, name: 'uq_alarm_occurrence_id' }),
    alarmOccurrences.createIndex(
      { lifecycle: 1, severity: 1, openedAt: -1 },
      { name: 'ix_alarm_active_severity_time' },
    ),
    alarmOccurrences.createIndex(
      { targetId: 1, lifecycle: 1, openedAt: -1 },
      { name: 'ix_alarm_target_lifecycle_time' },
    ),
    alarmOccurrences.createIndex(
      { correlationKey: 1, lastObservedAt: -1 },
      { name: 'ix_alarm_correlation_last_observed' },
    ),
    alarmOccurrences.createIndex(
      { correlationKey: 1 },
      {
        unique: true,
        name: 'uq_alarm_active_correlation',
        partialFilterExpression: { lifecycle: 'ACTIVE' },
      },
    ),
  ]);

  const alarmTransitions = database.collection('alarm_transitions');
  await Promise.all([
    alarmTransitions.createIndex({ id: 1 }, { unique: true, name: 'uq_alarm_transition_id' }),
    alarmTransitions.createIndex(
      { alarmOccurrenceId: 1, occurredAt: 1 },
      { name: 'ix_alarm_transition_occurrence_time' },
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

  const snmpQuotas = database.collection('snmp_ingest_quota');
  await Promise.all([
    snmpQuotas.createIndex({ key: 1 }, { unique: true, name: 'uq_snmp_ingest_quota_key' }),
    snmpQuotas.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_snmp_ingest_quota_expiry' },
    ),
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
