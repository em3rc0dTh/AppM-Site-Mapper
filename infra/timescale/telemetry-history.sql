-- Candidate schema for ADR-021 benchmark only.
-- Do not treat this file as a production vendor selection.

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS appm_telemetry_history (
  observed_at TIMESTAMPTZ NOT NULL,
  event_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  component_address TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  channel SMALLINT NOT NULL CHECK (channel IN (1, 2)),
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL,
  quality TEXT NOT NULL,
  derivation TEXT NOT NULL,
  raw_key TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  protocol_profile TEXT NOT NULL,
  raw_schema_version TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  timestamp_provenance TEXT NOT NULL,
  sequence BIGINT NULL,
  producer_epoch TEXT NULL,
  message_id TEXT NULL,
  metric_catalog_version TEXT NOT NULL,
  point_fingerprint CHAR(64) NOT NULL,
  PRIMARY KEY (observed_at, event_id, component_address, metric_key, channel)
);

SELECT create_hypertable(
  'appm_telemetry_history',
  by_range('observed_at'),
  if_not_exists => TRUE,
  migrate_data => TRUE
);

CREATE INDEX IF NOT EXISTS ix_appm_telemetry_source_observed
  ON appm_telemetry_history (source_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS ix_appm_telemetry_entity_metric_observed
  ON appm_telemetry_history (entity_id, metric_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS ix_appm_telemetry_component_metric_observed
  ON appm_telemetry_history (component_address, metric_key, observed_at DESC);
