# Site Mapper — Modbus TCP output for Metasys

## Ownership

The Site Mapper deployment owns the Modbus TCP server **as a separate runtime service in this repository**. The same MQTT packet is normalized and verified once by Site Mapper; accepted breaker data is then fanned out to:

- TimescaleDB historical persistence, independently of Modbus;
- in-process Latest State and the UI;
- the isolated Site Mapper Modbus TCP server (ephemeral Latest State for BMS polling).

The Modbus server does not query TimescaleDB or MongoDB when answering a Modbus request, and failure of this optional output does not reject an otherwise valid MQTT message.

## Wire contract (baseline)

- Transport: Modbus TCP (MBAP), Input Register read function **04** only
- Default server: TCP 1502, bound to loopback for local operation. The standard 502 can be mapped at deployment after network authorization.
- Source mapping: `MODBUS_SOURCE_UNITS_JSON` is required, e.g. `{"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3}`. **Never guess a serial or unit from topology.**
- Per Unit ID: 96 breakers × 4 variables × 2 registers = **768 breaker registers** (0–767), plus **8 QDF Total registers** (768–775), for 776 registers.
- The Modbus sidecar receives a canonical **2×48** identity: A uses `0_1_1..0_1_48` and B uses `0_2_1..0_2_48`. Site Mapper translates the real Acrel wire format before this boundary. Field Acrel groups are 1/3/5/7, measured positions are 1..12, and channel 1/2 (`U1/I1/P1/EP1` vs `U2/I2/P2/EP2`) resolves to the 24 positions of each physical panel. The local `docker-compose.telemetry.yml` lab defaults to `panels-4x24` while direct stand-alone server usage retains `blocks-2x48` for compatibility.
- Variable order at each circuit: Voltage (V), Current (A), Power (kW), Energy (kWh).
- Internal ordinal `n` from 1 to 96 (client labels 01-A…48-A then 01-B…48-B): zero-based start address `(n - 1) * 8`; Voltage at +0, Current at +2, Power at +4, Energy at +6. IEEE-754 FLOAT32, network big-endian word order, **high word first**. Register numbering in Metasys may need +40001 or +1 offset depending on its configured Modbus driver.
- Power is stored internally in watts (`powerW`) and converted at the Modbus publication boundary (`W / 1000`) so the wire value and engineering unit are kW. Historical storage is unchanged.
- Only explicitly commissioned breaker metrics accepted by Site Mapper are exported. Missing values are not invented.
- Missing or stale values (default age 30 seconds) use `MODBUS_MISSING_POLICY`. The backward-compatible default `zero` reads **0**, indistinguishable from a valid zero. The opt-in `exception` returns Modbus exception 04 for the entire FC04 request when any requested value is missing/stale. **Do not use this output for safety controls** until Metasys polling and missing-data behavior have been field-certified.
- The breaker block remains exactly 0–767. Client circuit **00** occupies 768–775: Voltage 768, Current 770, Power 772 and Energy 774 (each FLOAT32/two registers). Governed industrial extensions still begin at address **1024** and remain opt-in.
- Function codes other than FC04 return illegal-function exception. Malformed/out-of-range FC04 requests return exception, not out-of-bounds data.

## Metasys Eltek v1.3 customer extension

The customer source of truth is `Modbus_TCP_v1.3.xlsx`. The runtime manifest is
[`config/industrial/modbus-points.metasys-eltek-v1.3.json`](../../config/industrial/modbus-points.metasys-eltek-v1.3.json).
It is additive: the breaker/QDF base map at offsets 0–775 is unchanged, offsets 776–1023 remain
reserved, and the ELTEK/SNMP extension begins at 1024. The customer manifest uses the dedicated
pinned registry path `/data/modbus-registry-metasys-eltek-v1.3.json`.

Customer-facing transport contract:

- Modbus TCP, production/client port **502**; the local development host may map the internal bridge to another loopback port.
- Read-only **FC04 — Read Input Registers**.
- 0-based PDU/start-address convention with 4xxxx references shown for operator handoff.
- IEEE-754 **FLOAT32**, two value registers per point, ABCD / high-word-first.
- QDF-2 → Unit ID 1; QDF-4 → Unit ID 2; QDF-5 → Unit ID 3.
- Base schedule: 388 values per QDF, 1,164 values total.
- Base units: Voltage V, Current A, Power kW, Energy kWh.

The extension schedule is identical for all three Unit IDs:

| Start | 4xxxx reference | Point                  | Type    | Unit     |
| ----: | --------------- | ---------------------- | ------- | -------- |
|  1024 | 41025-41026     | Input A Rated Current  | FLOAT32 | A        |
|  1027 | 41028-41029     | Input A Voltage        | FLOAT32 | V        |
|  1030 | 41031-41032     | Input A Current        | FLOAT32 | A        |
|  1033 | 41034-41035     | Input A Power          | FLOAT32 | kW       |
|  1039 | 41040-41041     | Input B Rated Current  | FLOAT32 | A        |
|  1042 | 41043-41044     | Input B Voltage        | FLOAT32 | V        |
|  1045 | 41046-41047     | Input B Current        | FLOAT32 | A        |
|  1048 | 41049-41050     | Input B Power          | FLOAT32 | kW       |
|  1054 | 41055-41056     | Total Current          | FLOAT32 | A        |
|  1057 | 41058-41059     | Bus A Voltage          | FLOAT32 | V        |
|  1060 | 41061-41062     | Bus B Voltage          | FLOAT32 | V        |
|  1063 | 41064-41065     | Total Voltage          | FLOAT32 | V        |
|  1066 | 41067-41068     | Total Power            | FLOAT32 | kW       |
|  1069 | 41070-41071     | Total Energy           | FLOAT32 | kWh      |
|  1072 | 41073-41074     | Communication Status   | FLOAT32 | no-units |
|  1075 | 41076-41077     | Controller Alarm State | FLOAT32 | no-units |
|  1078 | 41079-41080     | Alarm Severity         | FLOAT32 | no-units |

Every governed extension point still reserves the bridge-internal quality slot at `start + 2`; this
is why the next customer value starts three registers later. The quality register is not one of the
two value registers listed in the workbook.

Status codes are numerically encoded as FLOAT32 values:

```text
Communication Status:   0 OFFLINE, 1 LIVE, 2 STALE, 3 ERROR
Controller Alarm State: 0 RESOLVED/CLEAR, 1 ACTIVE
Alarm Severity:         0 NONE, 1 INFO, 2 WARNING, 3 CRITICAL
```

The projection source is Site Mapper, not raw SNMP-to-Modbus passthrough:

- Rated Current comes from commissioned AccessPort configuration.
- Input A/B Voltage and Current come from accepted SNMP poll observations.
- Input A/B Power is derived as `I × abs(V)` and published in kW.
- Total Current, Bus A/B Voltage, Total Voltage and Total Power use the operational QDF projection
  and require complete, coherent expected inputs.
- Total Energy is derived durably by Site Mapper from accepted SNMP V/I history.
- Communication Status is derived from commissioned SNMP source/feed health.
- Controller Alarm State and Alarm Severity come from canonical Alarm Engine occurrences on the
  controller Equipment. Raw trap payloads and OIDs are not exported to Metasys.

The four `TOTAL_*` extension points set `legacyTotalMirror=false`, so the v1.3 extension cannot
overwrite the base client circuit 00 registers at 768–775.

## Local deployment

Set an **independent, private** random `MODBUS_BRIDGE_TOKEN` of at least 24 characters, a private `INDUSTRIAL_PROJECTION_TOKEN`, and the approved source map. The projection token is shared only between the Modbus sidecar and the Site Mapper internal projection endpoint.

For Docker Compose `docker-compose.telemetry.yml`, start the sidecar along with TimescaleDB. This compose profile publishes the TCP Modbus and internal HTTP ingestion ports on **127.0.0.1 only**. Do not expose HTTP ingestion publicly.

For a Next.js process running on the Docker host, set:

```sh
MODBUS_BRIDGE_URL=http://127.0.0.1:18082
MODBUS_BRIDGE_TOKEN=<same-private-token>
```

The sidecar listens for authenticated writes from Site Mapper at `POST /internal/accepted-breaker`. It is not a public telemetry endpoint. In a containerized Next.js deployment, configure this URL to the private sidecar service name instead.

Expose Modbus only through a customer-approved OT network route/firewall. Modbus TCP has no built-in authentication or encryption. Metasys commissioning and production network routing remain explicit acceptance gates.

## Alarm Engine extension points

Alarm publication is not inferred from breaker measurements and does not reuse occurrence UUIDs.
An operator-approved point in `MODBUS_POINTS_FILE` can declare a stable `logicalPointId` using:

```text
ALARM/<canonical-target-id>/<ALARM_CODE>/STATE
ALARM/<canonical-target-id>/<ALARM_CODE>/ACK
ALARM/<canonical-target-id>/<ALARM_CODE>/SEVERITY
ALARM/<canonical-target-id>/<ALARM_CODE>/CONFIDENCE
ALARM/<canonical-target-id>/<ALARM_CODE>/QUALITY
```

The bridge continues polling the authenticated Site Mapper projection endpoint. Site Mapper derives
these values from the canonical Alarm Engine and the bridge keeps only ephemeral Latest State; the
bridge still does not query MongoDB or TimescaleDB directly.

Current semantic codes are:

```text
STATE       0 clear/resolved, 1 active
ACK         0 unacknowledged/none, 1 all matching active occurrences acknowledged
SEVERITY    0 none, 1 info, 2 warning, 3 critical
CONFIDENCE  0 none, 1 suspected, 2 confirmed
QUALITY     1 governed projection valid
```

Generic pre-existing alarm publication registries remain backward-compatible: points that omit
`dataType` still default to FLOAT32 + adjacent quality. The Metasys Eltek v1.3 customer registry is a
new registry identity and explicitly declares its three customer status fields as UINT16; it does not
silently mutate any previously published alarm address or datatype.

These points remain **unassigned until commissioning explicitly adds them to the publication
registry**. No alarm address is guessed from topology, panel position, MQTT point, or SNMP OID.

## Verification

```sh
node --test infra/modbus-tcp/server.test.mjs
```

The GitHub full-stack E2E checks that Site Mapper's accepted MQTT breaker sample arrives via Modbus FC04 at Unit ID 1 and matches V/A/kW/kWh, and that Unit ID 2 is isolated. That run simultaneously verifies the TimescaleDB history.

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

The script reads approved source→Unit ID from **the running Modbus container**. It then polls the loopback TCP/1503 FC04 response (8 input registers, four network-order FLOAT32 values) and compares that tuple to **recent** rows for exactly the same source, point and breaker in the Site Mapper-owned `telemetry_samples` table. It never writes to MongoDB, TimescaleDB, MQTT, or Modbus. `MODBUS_CERT_PASS` certifies this local lab flow at the time of execution; `MODBUS_CERT_FAILED` or a timeout is **not** a pass. The sidecar's freshness policy may return zeros if no commissioned sample has arrived within 30 seconds.

This local validation does **not** certify external Metasys connectivity, wiring, BMS register offsets, quality flags, or behavior after a process restart. Do not expose the port beyond the approved OT network.

## Metasys deliverable and runtime synchronization

The single source for the four-variable register allocation is [`infra/modbus-tcp/register-map.mjs`](../../infra/modbus-tcp/register-map.mjs), shared by the server, [generator](../../scripts/operations/generate-metasys-register-map.mjs), and tests. See [Metasys handoff guide](./metasys-register-map.md) and [CSV](./metasys-register-map.csv), whose first four headings reproduce the supplied table format. The committed CSV uses **emulator/lab identities**, not production serials.

```sh
node scripts/operations/generate-metasys-register-map.mjs --check
```

For production mappings, generate the CSV privately with the approved `MODBUS_SOURCE_UNITS_JSON` and `MODBUS_POINT_LAYOUT`. Metasys integration still requires explicit local configuration and read-only field acceptance. The optional `MODBUS_MISSING_POLICY=exception` is not enabled in the default Docker Compose profile because partially commissioned panel reads can otherwise fail as an entire FC04 block. Confirm the desired missing-data behavior with the Metasys integrator before enabling it.
