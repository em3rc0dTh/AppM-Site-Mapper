-- SNMP poll durability ledger; intentionally ordinary PostgreSQL tables so
-- unique keys and row locks are global across TimescaleDB chunks and app replicas.
CREATE TABLE IF NOT EXISTS snmp_source_progress (
  source_identity TEXT PRIMARY KEY,
  last_observed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS snmp_ingest_batches (
  source_identity TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  feed_count SMALLINT NOT NULL CHECK (feed_count BETWEEN 1 AND 64),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_identity, observed_at)
);
CREATE INDEX IF NOT EXISTS snmp_ingest_batches_recent_idx
  ON snmp_ingest_batches (committed_at DESC);
