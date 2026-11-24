-- Durable per-feed energy accumulator used by the Metasys Eltek Modbus projection.
-- Source V/I remain authoritative; this stores only the Site Mapper derived integral state.
CREATE TABLE IF NOT EXISTS snmp_feed_energy_state (
  target_id TEXT NOT NULL,
  source_identity TEXT NOT NULL,
  last_received_at TIMESTAMPTZ NOT NULL,
  last_power_w DOUBLE PRECISION,
  energy_kwh DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (energy_kwh >= 0),
  covered_seconds DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (covered_seconds >= 0),
  integrated_intervals BIGINT NOT NULL DEFAULT 0 CHECK (integrated_intervals >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_id, source_identity)
);

CREATE INDEX IF NOT EXISTS snmp_feed_energy_state_source_idx
  ON snmp_feed_energy_state (source_identity);
