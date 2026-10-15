# Site Mapper — Modbus TCP output for Metasys

## Ownership

The Site Mapper deployment owns the Modbus TCP server **as a separate runtime service in this repository**. The same MQTT packet is normalized and verified once by Site Mapper; accepted breaker data is then fanned out to:

- TimescaleDB historical persistence, independently of Modbus;
- in-process Latest State and the UI;
- the isolated Site Mapper Modbus TCP server (ephemeral Latest State for BMS polling).

The Modbus server does not query TimescaleDB or MongoDB when answering a Modbus request, and failure of this optional output does not reject an otherwise valid MQTT message.

## Wire contract (baseline)

- Transport: Modbus TCP (MBAP), holding register read function **03** only
- Default server: TCP 1502, bound to loopback for local operation. The standard 502 can be mapped at deployment after network authorization.
- Source mapping: `MODBUS_SOURCE_UNITS_JSON` is required, e.g. `{"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3}`. **Never guess a serial or unit from topology.**
- Per Unit ID: 96 circuits × 4 variables × 2 holding registers = **768 registers** (0–767).
- Raw-point layout is explicit: the legacy default `blocks-2x48` maps `0_1_1`..`0_1_48` to circuits 1–48 and `0_2_1`..`0_2_48` to circuits 49–96. The verified BFDB emulator uses `panels-4x24`: `0_1_1`..`0_1_24` → 1–24, `0_2_*` → 25–48, `0_3_*` → 49–72 and `0_4_*` → 73–96. Set `MODBUS_POINT_LAYOUT` to the provider-approved layout; never infer an unverified wiring map. The local `docker-compose.telemetry.yml` lab defaults to `panels-4x24` while direct stand-alone server usage retains `blocks-2x48` for compatibility.
- Variable order at each circuit: Voltage (V), Current (A), Power (W), Energy (kWh).
- Circuit number `n` from 1 to 96: zero-based start address `(n - 1) * 8`; Voltage at +0, Current at +2, Power at +4, Energy at +6. IEEE-754 FLOAT32, network big-endian word order, **high word first**. Register numbering in Metasys may need +40001 or +1 offset depending on its configured Modbus driver.
- Only explicitly commissioned breaker metrics accepted by Site Mapper are exported. Missing values are not invented.
- Missing, invalid or stale values (default age 30 seconds) currently read **0**. This may be indistinguishable from a genuine zero and **must not be used for safety controls** until a quality-register contract has been certified.
- Function codes other than FC03 return illegal-function exception. Malformed/out-of-range FC03 requests return exception, not out-of-bounds data.

## Local deployment

Set an **independent, private** random `MODBUS_BRIDGE_TOKEN` of at least 24 characters and the approved source map.

For Docker Compose `docker-compose.telemetry.yml`, start the sidecar along with TimescaleDB. This compose profile publishes the TCP Modbus and internal HTTP ingestion ports on **127.0.0.1 only**. Do not expose HTTP ingestion publicly.

For a Next.js process running on the Docker host, set:

```sh
MODBUS_BRIDGE_URL=http://127.0.0.1:18082
MODBUS_BRIDGE_TOKEN=<same-private-token>
```

The sidecar listens for authenticated writes from Site Mapper at `POST /internal/accepted-breaker`. It is not a public telemetry endpoint. In a containerized Next.js deployment, configure this URL to the private sidecar service name instead.

Expose Modbus only through a customer-approved OT network route/firewall. Modbus TCP has no built-in authentication or encryption. Metasys commissioning and production network routing remain explicit acceptance gates.

## Verification

```sh
node --test infra/modbus-tcp/server.test.mjs
```

The GitHub full-stack E2E checks that Site Mapper's accepted MQTT breaker sample arrives via Modbus FC03 at Unit ID 1 and matches V/A/W/kWh, and that Unit ID 2 is isolated. That run simultaneously verifies the TimescaleDB history.

## Remaining operational gates

This is not a guarantee of commissioned Johnson Controls Metasys connectivity. Before production: OT firewall and addressing, TCP 502 mapping if needed, driver offset/word-order confirmation, freshness/quality signalling, source-map approval, TLS authenticated production MQTT, restart/staleness behavior, and failover/durable rehydration of Latest State.

## Live CB-01 certification (read-only)

After CB-01 has four verified bindings and Site Mapper shows a LIVE sample, confirm that the Modbus sidecar and TimescaleDB contain the **same actual measurements**, not a fixed fixture. From the Site Mapper repository root:

```sh
git pull origin main
docker compose -f docker-compose.telemetry.yml up -d --no-deps --build --force-recreate modbus-tcp
docker compose -f docker-compose.telemetry.yml up -d --no-deps --force-recreate site-mapper
node scripts/operations/certify-modbus-cb01.mjs \
  --source EMU-BFDB-01 \
  --point 0_1_1 \
  --breaker 4d394db4-b263-4ca3-9fa2-fb10661d89ff
```

The script reads approved source→Unit ID from **the running Modbus container**. It then polls the loopback TCP/1503 FC03 response (8 holding registers, four network-order FLOAT32 values) and compares that tuple to **recent** rows for exactly the same source, point and breaker in the Site Mapper-owned `telemetry_samples` table. It never writes to MongoDB, TimescaleDB, MQTT, or Modbus. `MODBUS_CERT_PASS` certifies this local lab flow at the time of execution; `MODBUS_CERT_FAILED` or a timeout is **not** a pass. The sidecar's freshness policy may return zeros if no commissioned sample has arrived within 30 seconds.

This local validation does **not** certify external Metasys connectivity, wiring, BMS register offsets, quality flags, or behavior after a process restart. Do not expose the port beyond the approved OT network.
