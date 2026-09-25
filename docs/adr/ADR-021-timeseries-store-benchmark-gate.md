# ADR-021 — Historical time-series store benchmark gate

- Status: **Accepted benchmark gate; vendor not frozen**
- Date: 2026-09-24
- Product: **AppManager Site Mapper**
- Scope: canonical telemetry history persistence and query path

## Context

G16 now has:

- durable MQTT acceptance before QoS 1 acknowledgement;
- durable latest state;
- an outbox with lease/retry/dead-letter semantics;
- protocol-profile provenance;
- a canonical breaker telemetry adapter backed by historical evidence;
- a vendor-neutral `TelemetryHistorySink`.

The remaining history decision must satisfy the product contract for current/latest, 24h, 7d, month
and bounded custom historical ranges without coupling domain/UI code to a storage vendor.

Historical lineage proves that an earlier AppM generation used Mosquitto → Telegraf → InfluxDB v2.
That is relevant implementation evidence, but it is not sufficient to freeze the MK1 backend.

This ADR records the current 2026 evaluation gate rather than selecting a database from familiarity.

## Candidates reviewed

### InfluxDB 3 Core

Current official documentation describes InfluxDB 3 Core as an open-source time-series database using
Arrow/DataFusion/Parquet, with SQL and InfluxQL query APIs and compatibility with v1/v2 write APIs.

Relevant strengths:

- purpose-built time-series storage;
- permissive MIT/Apache licensing in the open-source project;
- native SQL query API;
- project history already contains Influx operational knowledge;
- official scheduled downsampler plugin;
- token-based authorization;
- database/table retention support in the current v3 API;
- line protocol and HTTP make a dependency-light Site Mapper sink practical.

Current constraints that must be tested, not hand-waved:

- the default `query-file-limit` is 432 files, which with the default generation duration corresponds
  to approximately 72 hours; the limit can be increased, but official docs warn of degraded query
  performance and higher memory use;
- Core backup/restore documentation uses an object-storage copy procedure rather than the Enterprise
  managed backup workflow;
- retention behavior and configuration differ between Core and Enterprise releases and must be
  pinned to the exact selected image;
- duplicate point overwrites are explicitly non-deterministic. Site Mapper may therefore rely only
  on replaying an identical canonical point identity/value, never on overwrite ordering to repair
  data;
- schema/tag order is effectively part of the table contract and must be created explicitly rather
  than discovered accidentally from the first production write.

Current reference image for benchmark: a version-specific InfluxDB 3 Core image. Never use
`influxdb:latest` or another moving production tag.

### TimescaleDB

Current TimescaleDB is a PostgreSQL extension. The current release line remains actively maintained
and provides standard SQL/Postgres operational tooling.

Relevant strengths:

- arbitrary SQL time-range queries;
- PostgreSQL uniqueness/constraints make sink idempotency straightforward;
- mature backup/PITR/replication ecosystem;
- Community edition provides continuous aggregates, automated retention and columnstore/compression
  features useful for the Site Mapper query horizons;
- standard Postgres clients and tooling reduce vendor-specific query language exposure.

Current constraint:

- continuous aggregates, automated retention policies and current columnstore features are not
  available in the Apache-2-only edition; they are Community features under the Timescale License.
  Production use therefore requires an explicit product/deployment/license decision. The project
  must not silently adopt TSL-only functionality and later discover that its distribution/service
  model is incompatible.

Current reference release observed for benchmark planning: TimescaleDB 2.30.x. The actual benchmark
must pin a patch release and compatible PostgreSQL major.

## Current decision

No time-series vendor is frozen by G16 yet.

**Technical benchmark order:**

1. TimescaleDB Community — technical baseline for arbitrary-range SQL, deterministic idempotency,
   retention and continuous aggregate behavior, subject to an explicit license/deployment gate.
2. InfluxDB 3 Core — permissive-license baseline, subject to proving 7d/month/custom-range query SLOs,
   deterministic replay behavior, and backup/restore.
3. A commercial InfluxDB Enterprise evaluation is optional only if Core cannot satisfy the required
   range/operational gates and commercial licensing is acceptable.

This ordering is not a production selection. A candidate becomes selected only after the benchmark
receipt is committed.

## Canonical benchmark dataset

The same canonical event model must be used for every candidate.

Baseline scenario must include at least the current three-BDFB deployment and must be parameterized
for growth. The benchmark generator must vary:

- telemetry sources;
- active breaker/component count;
- metrics per component;
- publish cadence;
- out-of-order/replayed events;
- one-hour, 24h, 7d and 30d retained windows;
- a growth multiplier above the immediate deployment.

No candidate may receive a vendor-specific "easier" input shape that changes the canonical product
semantics.

## Required write gates

A candidate must prove:

- idempotent replay by canonical `eventId`/point identity without corrupting a legitimate second
  event at the same observation timestamp;
- bounded batch write latency;
- recovery after process restart;
- recovery after database unavailability;
- no acknowledged outbox event is silently lost;
- repeated writes of the exact same canonical event are harmless;
- malformed canonical events are rejected before the vendor sink.

## Required query gates

The same repository/query contract must demonstrate:

- latest/current;
- 24 hours;
- 7 days;
- approximately 30 days;
- bounded custom historical range;
- min/max/avg/last/count where valid;
- metric-specific rollup/downsampling;
- source/entity/component filtering;
- deterministic ordering and pagination/limits;
- no browser-side stitching of millions of raw points.

A candidate that requires unsafe memory/query-limit increases to satisfy 30-day behavior does not
pass merely because the setting can technically be increased.

## Retention and downsampling gates

The benchmark must materialize a concrete tier policy, for example:

- fine raw data for a configurable short window;
- medium-resolution rollup for a longer window;
- hourly/daily rollups where long-term analysis requires them.

The exact durations remain product/configuration decisions, but create/change/delete/rebuild behavior
must be proven.

Retention must not delete administrative audit records or topology state.

## Backup/restore gate

The selected candidate must complete a restore drill, not just document a command.

Receipt must record:

- database/image version;
- dataset size;
- backup start/end;
- restore start/end;
- restored row/point counts;
- latest historical timestamp;
- hash/count reconciliation strategy;
- RPO observed;
- RTO observed;
- any data/query features unavailable during recovery.

## Security gate

The selected history store must run:

- on a private service network;
- with TLS where traffic crosses a trust boundary;
- with least-privilege application credentials;
- without admin credentials in the web client;
- with secrets outside Git;
- with a documented rotation/revocation path.

The browser never receives direct TSDB credentials.

## Telegraf decision

Telegraf is **not** part of the hardware trust boundary.

If retained, it may consume only a validated canonical internal stream after Site Mapper ingestion.
It must not reintroduce raw-hardware → Telegraf → TSDB as the authoritative G16 path.

Telegraf is selected only if measured operational benefit from buffering/batching/format delivery is
greater than the complexity of the Site Mapper history worker writing the selected TSDB directly.

## Production freeze conditions

ADR-021 moves to a selected backend only when the repository contains:

1. benchmark harness/configuration for both primary candidates;
2. benchmark receipt with the same dataset/query set;
3. license/deployment decision for any non-permissive dependency;
4. restore drill evidence;
5. selected schema and idempotency proof;
6. retention/downsampling proof;
7. failure/recovery proof;
8. load/soak evidence;
9. exact image/version/digest policy;
10. an ADR update naming the selected store and the rejected alternative.

Until then, the vendor-neutral `TelemetryHistorySink` remains the authoritative application boundary.

## Current source references

Reviewed against official/current material on 2026-09-24:

- InfluxDB 3 Core install and pinned-image guidance:
  https://docs.influxdata.com/influxdb3/core/install/
- InfluxDB 3 Core query-file-limit:
  https://docs.influxdata.com/influxdb3/core/reference/config-options/
- InfluxDB 3 Core query and SQL behavior:
  https://docs.influxdata.com/influxdb3/core/get-started/query/
- InfluxDB 3 Core retention:
  https://docs.influxdata.com/influxdb3/core/reference/internals/data-retention/
- InfluxDB 3 Core backup/restore:
  https://docs.influxdata.com/influxdb3/core/admin/backup-restore/
- InfluxDB 3 Core downsampler:
  https://docs.influxdata.com/influxdb3/core/plugins/library/official/downsampler/
- InfluxDB 3 schema/primary-key guidance:
  https://docs.influxdata.com/influxdb3/core/write-data/best-practices/schema-design/
- TimescaleDB current project/releases:
  https://github.com/timescale/timescaledb
- TimescaleDB editions/license feature boundary:
  https://github.com/timescale/docs/blob/latest/about/timescaledb-editions.md
- TimescaleDB self-hosted production guidance:
  https://docs.tigerdata.com/self-hosted/latest/install/
- TimescaleDB restore administration functions:
  https://docs.tigerdata.com/api/latest/administration


## Implementation checkpoint — candidate sinks

The repository now contains executable write mappings for both primary benchmark candidates without
changing the vendor-neutral application boundary:

- `InfluxDb3TelemetryHistorySink` uses the native v3 line-protocol write endpoint with explicit
  nanosecond precision, partial writes disabled and asynchronous/no-sync acknowledgement disabled.
- `TimescaleTelemetryHistorySink` uses a narrow SQL-client port plus a deterministic point
  fingerprint so exact replay is idempotent and conflicting canonical content fails closed.
- `infra/timescale/telemetry-history.sql` materializes only the benchmark candidate schema.
- unit tests prove stable replay identity and conflict behavior without requiring either database in
  ordinary CI.

This checkpoint does **not** select a production backend. The benchmark, query SLOs, retention,
backup/restore, outage recovery, load/soak, exact pinned images and licensing decision remain open
before this ADR can be amended to a selected vendor.
