# Site Mapper MK1 — MQTT / TimescaleDB / Modbus local laboratory

**Scope:** read-only certification of one explicitly commissioned synthetic breaker. Not customer field acceptance or Johnson Controls Metasys commissioning.

## Separate ownership, one accepted packet

```text
Independent BFDB emulator (external repository)
    │ data/dev/EMU-BFDB-01 (MQTT through temporary review tunnel)
    ▼
Site Mapper (Next.js; MongoDB inventory + explicit TelemetryBindings)
    │ accepted source EMU-BFDB-01 / point 0_1_1
    ├── Authenticated browser LIVE and SSE
    ├── TimescaleDB: exact Equipment history and breaker electrical rows
    └── Private authenticated bridge → Site Mapper Modbus TCP sidecar
                                       Unit ID 1 / FC03 / registers 0..7
```

Do not reuse the external `bfdb-telemetry-gateway` database or Modbus service as Site Mapper's private store/sidecar. Keep the two Compose projects independent. External Pinggy host/port may change at every session; secrets and customer topology must not be committed.

## Verified lab inventory example (2026-10-15)

A single Site Mapper positional Equipment `PANEL-01` has 24 slots and declared raw-point prefix `0_1`. Position 01 contains canonical Equipment `BDFB-01-PANEL-01-CB-01`. The MQTT publisher `EMU-BFDB-01` belongs to **the PANEL Equipment**, not to the parent BDFB Device. Its four independently verified breaker bindings map `0_1_1` to `VOLTAGE`, `CURRENT`, `POWER`, `ENERGY`.

Example lab identifiers, not production constants:

- Panel Equipment: `5a31f9bd-220d-4f1b-b42a-f73a9aaf03f5`.
- Breaker Equipment: `4d394db4-b263-4ca3-9fa2-fb10661d89ff`.
- `EMU-BFDB-01` publisher Unit ID: 1, **as confirmed by the lab's private mapping**.

This mapping was explicitly commissioned via the existing UI and panel API; the physical slot number was not an automatic association. The synthetic source should never be represented as surveyed customer wiring.

## Start / rebuild without deleting state

Run from the AppM-Site-Mapper repository root, with runtime secrets in ignored local configuration and the external emulator/broker/tunnel already running:

```bash
git pull --ff-only origin main
docker compose -f docker-compose.telemetry.yml up -d --build
docker compose -f docker-compose.telemetry.yml ps
```

For a targeted deployment that preserves running MongoDB and TimescaleDB containers:

```bash
docker compose -f docker-compose.telemetry.yml \
  up -d --no-deps --build --force-recreate modbus-tcp site-mapper
```

**Do not** use `docker compose down -v`, delete MongoDB volumes or change inventory serials to resolve a network problem. Do not merge external BFDB Compose volumes with Site Mapper's volumes.

## Confirm source acceptance and commissioning

Authenticated endpoints:

```text
GET http://localhost:3000/api/telemetry/diagnostics
GET http://localhost:3000/api/telemetry/panel-commissioning?panelId=5a31f9bd-220d-4f1b-b42a-f73a9aaf03f5
GET http://localhost:3000/api/telemetry/entity?targetId=4d394db4-b263-4ca3-9fa2-fb10661d89ff&window=LIVE
GET http://localhost:3000/api/telemetry/entity?targetId=4d394db4-b263-4ca3-9fa2-fb10661d89ff&window=24h
```

Required state: subscribed connection, received/accepted messages, zero relevant rejections, four active metric bindings with `ready:true`, and a _recent_ actual sample attributed to the breaker with `sourceIdentity=EMU-BFDB-01` and `sourcePointId=0_1_1`. A `ready:true` commissioning response alone does not certify LIVE.

## Read-only TimecaleDB check

```bash
docker compose -f docker-compose.telemetry.yml exec -T timescaledb \
  psql -U site_mapper -d site_mapper_telemetry <<'SQL'
SELECT count(*) AS entity_history_rows, max(received_at) AS last_received
FROM telemetry_entity_samples
WHERE target_id = '4d394db4-b263-4ca3-9fa2-fb10661d89ff'
  AND target_type = 'EQUIPMENT';

SELECT count(*) AS breaker_timeseries_rows, max(received_at) AS last_received
FROM telemetry_samples
WHERE breaker_id = '4d394db4-b263-4ca3-9fa2-fb10661d89ff';
SQL
```

A prior local observation was 44 entity samples and 35 electrical rows; **these counts are not hardcoded thresholds** and may change each second while MQTT runs.

## Modbus FC03 — exact live/history cross-check

```bash
node scripts/operations/certify-modbus-cb01.mjs \
  --source EMU-BFDB-01 \
  --point 0_1_1 \
  --breaker 4d394db4-b263-4ca3-9fa2-fb10661d89ff
```

The script obtains Unit ID and point layout **from the running sidecar**, reads the four FLOAT32 variables via FC03 on host-loopback port 1503, and compares the tuple against **recent exact-breaker rows** of the Site Mapper-owned `telemetry_samples` table. It performs no writes.

Observed at the time of prior acceptance:

```text
MODBUS_CERT_PASS
Unit ID 1 · circuit 1 · addresses 0–7
voltageV≈12.23 V · currentA≈13.49 A · powerW≈164.94 W · energyKwh≈0.3476 kWh
matchedRecentBreakerHistory=true
```

Do not treat the preceding numbers as current readings, setpoints or fixtures. `MODBUS_CERT_PASS` is required for the local Modbus gate; `MODBUS_CERT_FAILED` is not a pass.

## Troubleshooting boundaries

| Symptom                           | Inspect                                                                                            | Do not do                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------- |
| HTTP 500 during entity LIVE       | `docker compose -f docker-compose.telemetry.yml logs --tail=100 site-mapper`, APP_ENV and MQTT URL | Reset MongoDB                          |
| MQTT subscribed, rejected packets | `/api/telemetry/diagnostics`, unique serial, source/topic identity                                 | Invent implicit breaker bindings       |
| 4/4 bindings but `NO DATA`        | source raw point, active publisher, accepted telemetry                                             | Recreate breaker                       |
| LIVE works but no history         | history writer diagnostics, telemetry-store, timescaledb                                           | Report full history certification      |
| Modbus zero                       | sidecar logs, bridge token, freshness threshold, point layout and explicit source unit map         | Interpret zero as certified healthy    |
| Modbus exception                  | FC03 offset/register count and configured Unit ID                                                  | Guess register offset or source serial |

Read-only log command:

```bash
docker compose -f docker-compose.telemetry.yml logs --tail=100 site-mapper modbus-tcp telemetry-store
```

## Explicit remaining release gates

The lab does **not** certify all 96 circuits, all three 96-point sources, physical installation, production security, OT firewall, Metasys register offset/endian settings, quality/staleness registers, persistence/failover of Modbus Latest State or live data after restart. A zero register is currently ambiguous. Never drive safety interlocks from this output until that quality contract is resolved.

Open branches/PRs are **not** evidence of a validated main release. See [release checklist](../release/release-checklist.md).
