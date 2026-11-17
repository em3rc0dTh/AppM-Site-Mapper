# TFARM04 runtime saturation incident — 2026-11-17

## Status

**Mitigated and partially remediated in software.**

The production-like TFARM04 office/field runtime became severely unresponsive while the Site Mapper Docker stack was active. No zombie-process condition was found. The incident exposed two independent hot paths:

1. an unbounded-ish latest-sample SQL pattern over a seven-day TimescaleDB window; and
2. per-delivery MongoDB-backed authorization inside the telemetry SSE stream.

The first hot path is fixed in this change. The second is reduced by bounded session revalidation and still has a follow-up item to consolidate browser-side SSE subscriptions.

## Impact

Observed on TFARM04 during the incident:

- host load average peaked at approximately **94 / 82 / 77** before reboot;
- Site Mapper, MongoDB and TimescaleDB were the dominant active consumers;
- TimescaleDB previously reached multi-GB resident memory and very high block I/O;
- after containment, Site Mapper still saturated approximately one CPU core;
- stopping only the Cloudflare tunnel reduced Site Mapper CPU from approximately **101.6% to 7.1%**, showing that the remaining Next.js cost was request/stream driven rather than an autonomous process loop.

No data volumes were removed during recovery.

## Root cause 1 — latest entity query

### Previous query

`query_latest_entity_samples()` used:

```sql
SELECT sample
FROM (
  SELECT
    sample,
    target_id,
    received_at,
    ROW_NUMBER() OVER (
      PARTITION BY target_id
      ORDER BY received_at DESC
    ) AS idx
  FROM telemetry_entity_samples
  WHERE target_type = $1
    AND target_id = ANY($2)
    AND received_at >= NOW() - INTERVAL '7 days'
) recent
WHERE idx <= 4
ORDER BY received_at ASC;
```

The desired contract was simple: return up to the latest four samples per requested target. The window-function plan forced PostgreSQL/TimescaleDB to process and sort a much larger candidate set before discarding almost all of it.

On TFARM04 a representative `EXPLAIN` estimated roughly **78,891 rows** and produced:

- `WindowAgg`;
- `Gather Merge`;
- parallel sort;
- `Parallel Seq Scan` on the current chunk.

The hypertable already had the correct composite index:

```text
(target_id, target_type, received_at DESC)
```

and both active chunks had their propagated `target_time_idx` indexes. The failure was therefore query shape, not a missing index.

### Corrected query

The query now drives each requested target independently through a `LATERAL` lookup with `ORDER BY received_at DESC LIMIT 4`.

A representative `EXPLAIN` on TFARM04 changed from a plan cost near **195k** to approximately **16**, with:

- `Nested Loop`;
- `Limit 4`;
- Timescale `ChunkAppend`;
- direct `Index Scan` using `telemetry_entity_samples_target_time_idx`.

This preserves the API contract while allowing the existing index to do the work.

## Root cause 2 — SSE authorization amplification

`GET /api/telemetry/stream` correctly authorizes the connection before opening an SSE stream. However, the stream also called `auth.authorize()` for **every telemetry delivery**.

`AuthService.authorize()` resolves the session from MongoDB and then resolves the user, so high-frequency telemetry multiplied by multiple SSE connections caused repeated MongoDB reads and Next.js CPU work.

TFARM04 isolation evidence:

- with Cloudflare traffic active, Site Mapper was approximately **101.6% CPU**;
- after stopping only `cloudflared-site-mapper` for 20 seconds, Site Mapper fell to approximately **7.1% CPU**;
- after bounding reauthorization to once every 15 seconds per stream, Site Mapper measured approximately **79% CPU** and MongoDB approximately **64% CPU** under live traffic.

The latter result proves this change removes one multiplier but does **not** close the entire external-traffic hot path.

### Corrected behavior

The stream still performs full authorization when it is opened.

After that, authorization is rechecked at most once every 15 seconds per stream. Session/role revocation therefore remains bounded rather than being cached for the lifetime of the connection.

## Regression protection

`infra/telemetry-store/test_entity_history.py` now asserts that the latest-entity query:

- does not use `ROW_NUMBER()`;
- unnests the requested target list;
- uses `CROSS JOIN LATERAL`;
- binds the lookup to each requested target;
- keeps `LIMIT 4`.

## Clean-machine deployment

A clean host does **not** need the TFARM04 emergency edits.

Use the repository version containing this change and bring the office profile up through Compose:

```bash
./infra/field/office-up.sh real
```

or equivalently with the configured runtime environment:

```bash
docker compose \
  --env-file .runtime/office-test.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  --profile snmp \
  up -d --build
```

The base Compose contract already declares:

- `telemetry-store` depends on TimescaleDB becoming `service_healthy`;
- Site Mapper depends on Telemetry Store being started;
- Site Mapper depends on Mongo replica-set initialization completing.

This is the supported bootstrap path for a clean machine.

## TFARM04 containment used during diagnosis

The following CPU limits were used locally to keep the desktop responsive while diagnosing the fault:

```yaml
services:
  site-mapper:
    cpus: 1.0
  timescaledb:
    cpus: 1.0
  mongodb:
    cpus: 0.75
```

These are **host containment values**, not the product fix and not a universal production sizing recommendation.

Do not delete Docker volumes as part of this incident recovery.

## Validation evidence

The TFARM04 runtime was rebuilt after both software edits.

Telemetry Store:

- rebuilt successfully;
- emitted `SITE_MAPPER_TELEMETRY_STORE_READY`;
- TimescaleDB later measured essentially idle;
- the previous active `ROW_NUMBER()` query disappeared from `pg_stat_activity`.

Site Mapper:

- rebuilt successfully with Next.js 16.4.6;
- the bounded SSE authorization change reduced CPU under the same external traffic;
- further work is still required to understand/consolidate external request and SSE fan-out.

## Remaining follow-up

The incident is **not considered fully performance-closed** until the remaining Cloudflare-driven load is resolved.

Primary follow-up:

1. measure request paths entering Next.js through Cloudflare;
2. count concurrent `/api/telemetry/stream` connections;
3. consolidate browser telemetry into one shared SSE subscription where practical;
4. review repeated client pollers (5 s / 15 s / 60 s);
5. re-measure Site Mapper and MongoDB CPU with Cloudflare active;
6. only then revisit TFARM04 CPU containment limits.

## Operational security note

Do not paste runtime environment files or credentials into incident logs. Rotate any credential that becomes exposed during diagnostics.
