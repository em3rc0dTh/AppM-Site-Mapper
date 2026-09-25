# G16 Historical Sink Candidate Contract

Status: benchmark implementation checkpoint; no production vendor selected.

## Purpose

This checkpoint turns the vendor-neutral `TelemetryHistorySink` boundary into two executable
candidate mappings without changing the domain contract.

## InfluxDB 3 Core candidate

`InfluxDb3TelemetryHistorySink`:

- uses the native `POST /api/v3/write_lp` endpoint;
- explicitly sets `precision=nanosecond`;
- explicitly sets `accept_partial=false`;
- explicitly sets `no_sync=false` so a successful call waits for the durable write path;
- sends one canonical point per metric;
- includes `event_id` in point identity so a legitimate second event at the same observation time
  remains distinct;
- replays the exact same canonical event as the exact same line protocol;
- never includes the bearer token or server response body in thrown errors.

This is still a candidate. InfluxDB 3 duplicate overwrite semantics mean the benchmark must prove
that exact replay is harmless and that no recovery flow relies on overwrite ordering.

## TimescaleDB candidate

`TimescaleTelemetryHistorySink`:

- depends only on a narrow `TimescaleSqlClient` port, not a Postgres package in domain/application
  code;
- writes one canonical point per metric;
- uses a deterministic SHA-256 fingerprint of canonical point content;
- treats an existing point with the same identity and same fingerprint as an idempotent replay;
- fails closed with `TIMESCALE_HISTORY_CONFLICT` when the point identity exists with a different
  fingerprint;
- tolerates partial event writes because the durable outbox can replay the same event and complete
  missing points idempotently.

The benchmark schema is in `infra/timescale/telemetry-history.sql`. It is candidate infrastructure,
not a production database selection.

## Recovery semantics shared by both candidates

The durable acceptance/outbox remains authoritative until the history writer marks an event
`DELIVERED`.

Therefore:

1. sink unavailable -> event is rescheduled with bounded backoff;
2. worker crash before delivery mark -> lease expires and another worker can reclaim;
3. crash after some metric points were written -> replay re-sends the same canonical points;
4. exact duplicates must be harmless;
5. canonical identity/content conflicts fail closed and remain operationally visible.

## Still required before ADR-021 can select a backend

- pinned container/image versions and digests;
- same generated benchmark dataset for both candidates;
- 1h / 24h / 7d / 30d / custom-range query measurements;
- aggregation/downsampling measurements;
- database outage and worker restart matrix;
- backup/restore drill with observed RPO/RTO;
- retention proof;
- load/soak proof;
- least-privilege credential proof;
- license/deployment decision for Timescale Community features;
- SHA-bound benchmark receipt.

No G16 PASS is claimed by this checkpoint.
