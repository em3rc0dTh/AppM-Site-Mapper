// SPRINT 02 - Alarm History indexes (mongosh).
// Apply with the existing authorized Mongo connection, after backup and S01 integration.
// Idempotent: createIndex on an existing identical name/spec does not rebuild it.
// Does not delete, reset, migrate, or modify alarm occurrences.
const occurrences = db.getCollection('alarm_occurrences');
occurrences.createIndex({ openedAt: -1, id: -1 }, { name: 'alarm_history_time_v1' });
occurrences.createIndex({ lifecycle: 1, openedAt: -1, id: -1 }, { name: 'alarm_history_lifecycle_v1' });
occurrences.createIndex({ acknowledgement: 1, openedAt: -1, id: -1 }, { name: 'alarm_history_ack_v1' });
occurrences.createIndex({ severity: 1, openedAt: -1, id: -1 }, { name: 'alarm_history_severity_v1' });
occurrences.createIndex({ targetId: 1, openedAt: -1, id: -1 }, { name: 'alarm_history_target_v1' });
print('SPRINT_02_HISTORY_INDEXES_READY');
