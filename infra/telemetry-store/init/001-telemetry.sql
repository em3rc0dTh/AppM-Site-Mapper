CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS telemetry_samples (
  id BIGSERIAL,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  source_identity TEXT NOT NULL,
  device_id TEXT NOT NULL,
  shelf_id TEXT NOT NULL,
  frame_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  breaker_id TEXT NOT NULL,
  raw_point_id TEXT NOT NULL,
  message_id TEXT,
  state TEXT,
  voltage_v DOUBLE PRECISION,
  current_a DOUBLE PRECISION,
  power_w DOUBLE PRECISION,
  energy_kwh DOUBLE PRECISION,
  PRIMARY KEY (id, observed_at)
);

SELECT create_hypertable(
  'telemetry_samples',
  by_range('observed_at'),
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS telemetry_samples_source_time_idx
  ON telemetry_samples (source_identity, observed_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_samples_source_point_time_idx
  ON telemetry_samples (source_identity, raw_point_id, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS telemetry_samples_message_point_time_uidx
  ON telemetry_samples (source_identity, message_id, raw_point_id, observed_at)
  WHERE message_id IS NOT NULL;
