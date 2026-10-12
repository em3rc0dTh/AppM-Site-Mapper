CREATE TABLE IF NOT EXISTS telemetry_entity_samples (
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('DEVICE','EQUIPMENT','ACCESS_PORT')),
  source_identity TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  sample JSONB NOT NULL,
  PRIMARY KEY (target_id, target_type, source_identity, binding_id, received_at)
);
SELECT create_hypertable('telemetry_entity_samples', by_range('received_at'), if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS telemetry_entity_samples_target_time_idx
  ON telemetry_entity_samples (target_id, target_type, received_at DESC);
