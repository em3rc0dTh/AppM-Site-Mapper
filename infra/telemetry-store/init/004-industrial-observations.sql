CREATE TABLE IF NOT EXISTS industrial_observations (
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  signal_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  logical_point_id TEXT,
  source_identity TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('MQTT', 'SNMP')),
  kind TEXT NOT NULL,
  numeric_value DOUBLE PRECISION,
  unit TEXT,
  quality TEXT NOT NULL,
  sample JSONB NOT NULL,
  PRIMARY KEY (observed_at, signal_id, event_id)
);
SELECT create_hypertable('industrial_observations', 'observed_at', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS industrial_series_signal ON industrial_observations (signal_id, observed_at DESC, event_id DESC);
CREATE INDEX IF NOT EXISTS industrial_series_logical ON industrial_observations (logical_point_id, observed_at DESC, event_id DESC, signal_id DESC);
-- No automatic deletion policy: retention must be approved separately from Mongo capture TTL.
