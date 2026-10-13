# Local MongoDB inventory + live BFDB emulator MQTT

Unlike `npm run local:emulator`, this mode does **not** use memory, seed a
synthetic Network or change the existing Mongo topology.

## Repository integrity audit (read-only)

Before attempting any migration or trusting the Power Trace in an existing database, run:

```powershell
npm run audit:mongo
# Optional: stop with exit code 1 if the selected .env database is not the reviewed one
npm run audit:mongo -- --expect-db=appm_site_mapper
```

The effective `MONGODB_DB_NAME` can come from the process environment and
may override `.env.local`. On PowerShell inspect the intended name only
(`$env:MONGODB_DB_NAME` and the `MONGODB_DB_NAME=` entry in ignored
`.env.local`); never print or paste `MONGODB_URI` credentials.
Databases named like `site_mapper_crud_acceptance_01` are likely isolated
CRUD acceptance environments rather than the operational inventory.

The report distinguishes `canonicalPowerPaths` (both Access Port references
present) from `incompletePowerPaths` (historical or otherwise noncanonical
records). Incomplete paths are **not** checked for invalid endpoints or
duplicate targets because that would falsely compare `undefined` with
`undefined`. The report lists only field _names_, not the stored values;
those records require a separate evidence-backed migration review.

This connects to the configured `MONGODB_URI` / `MONGODB_DB_NAME` and reads
`topology_nodes`, active `power_paths`, and active `telemetry_bindings`.
It reports omitted/invalid Equipment arrays, broken parent links, AccessPort
ownership, missing endpoints, Feed mismatches and dangling telemetry targets.
**It never changes data or indexes.** Exit code 2 means the audit found violations.
Back up the database and review the reported IDs before any targeted migration.
A clean read-only report is not a substitute for real connection/field tests.

## 1. Read-only inspection FIRST

Configure ignored `.env.local` in Site Mapper:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=appm_site_mapper
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_TOPIC_FILTER=data/dev/#
MQTT_TOPIC_PREFIX=data/dev/
MQTT_EXPECTED_SOURCES=EMU-BFDB-01,EMU-BFDB-02,EMU-BFDB-03
BFDB_TELEMETRY_BINDING_MODE=explicit
```

Use the **actual** Mongo URI/database name and broker host reachable from
your local Site Mapper process. Never commit or paste real connection strings,
credentials or customer exports. Use `MQTT_USERNAME` and `MQTT_PASSWORD`
only if your broker requires them.

Stop the current Site Mapper server (same port) and run:

```powershell
npm ci
npm run local:mongo-mqtt -- --inspect
```

The inspection is read-only. It checks canonical `topology_nodes`, active
Networks, Power Paths, existing users and exact raw-point BFDB mappings.

If the canonical `topology_nodes` collection is empty, **do not seed** this
database or substitute the synthetic lab. Confirm the database name and
review `docs/migrations/legacy-to-mk1.md`: legacy export, dry-run, staged
materialization, backup and approved promotion are separate steps.

## 2. Review existing inventory

```powershell
npm run local:mongo-mqtt
```

Log in using an **existing Mongo-backed** Site Mapper user. The temporary
credentials printed by `local:emulator` exist only in its memory database
and cannot log in to MongoDB.

If Mongo contains zero application users, `local:mongo-mqtt` stops rather
than creating one automatically. After approving first-user creation only,
run `npm run local:mongo-mqtt -- --init-admin`; that mode creates only the
first application user (not inventory or synthetic data).

The command never seeds topology, changes device serials, creates geometry or
reorders breaker/panel connections. The layout shown is whatever canonical
geometry and rack inventory actually exists in MongoDB.

## 3. Mapping live MQTT to _existing_ physical devices

The subscriber uses the existing Mongo Device/Equipment `serialNumber`.
If the upstream emulated serial differs, set the exact, verified mapping
in ignored `.env.local`:

```dotenv
MQTT_SOURCE_DEVICE_MAP={"EMU-BFDB-01":"<existing-device-id>"}
```

Provide all mappings needed, without changing the canonical Mongo IDs.
`explicit` breaker mode requires existing `telemetry.rawPointId` evidence,
such as `0_1_1` on the corresponding breaker. The preflight reports how
many of the emulator's 96 raw points are explicitly bound. It deliberately
does not infer physical A/B panel order from the emulator. If your real
panelization differs, use documented evidence and the controlled migration
flow; do not override it with a synthetic fixture.

To fail rather than start with incomplete binding, use:

```powershell
npm run local:mongo-mqtt -- --strict
```

After logging in, inspect:

```text
http://127.0.0.1:3000/api/telemetry/diagnostics
http://127.0.0.1:3000/api/telemetry/latest
```

If diagnostics shows `connection: subscribed` but `rawMessages: 0`, verify the
actual subscription filter first: `data/dev/` is an **exact MQTT topic**, not a
wildcard subscription. Use `MQTT_TOPIC_FILTER=data/dev/#` for publications
such as `data/dev/EMU-BFDB-01`. The local launcher now refuses the bare
prefix to avoid displaying a misleading healthy connection. Verify the same
broker host/port and source publishing in MQTT Explorer or a read-only
`mosquitto_sub -h <broker-host> -p 1883 -t 'data/dev/#' -v` session
(adjust port/auth locally). Do not assume mapping or invent bindings while
`rawMessages` remains zero.

A successful subscription alone is not proof of device mapping. Look at
`acceptedMessages`, `rejectedMessages`, `mappedDeviceId`,
`mappedBreakerCount` and `unmappedPointCount`.

## 4. Verify the gateway writes TimescaleDB

In the **separate** `thradexIT/bfdb-telemetry-gateway` checkout run:

```powershell
docker compose ps
docker compose logs --tail 80 telemetry-gateway
docker compose exec -T timescaledb psql -U bfdb -d bfdb -c "SELECT gateway_serial, COUNT(*) AS samples, MAX(observed_at) AS latest FROM telemetry_samples GROUP BY gateway_serial ORDER BY gateway_serial;"
```

The SQL example uses the Compose **default** database/user; replace
`bfdb` if your gateway was configured differently. Look for three
nonempty sources and a progressing latest timestamp. Also check gateway logs
for `TSDB_CONNECTED`, `MQTT_RX`, `GATEWAY_ERROR` and
`TSDB_CONNECT_RETRY`. Site Mapper's own 288/288 LIVE result does **not**
prove the gateway has written rows to TimescaleDB.

Data ownership remains:

- MongoDB: persistent actual physical topology and power-path context.
- MQTT: live normalized data, transient in Site Mapper's process.
- Gateway Latest State: current merged measurement set.
- Gateway TimescaleDB: historical electrical updates; Modbus never polls it.
- Historical caveat: the gateway currently persists merged wide values in
  partial electrical updates. See the gateway's ingestion policy before
  interpreting its historical charts as new measurements for every field.

## Automatic BFDB source discovery from the inventory

On MQTT `data/dev/<serial>`, Site Mapper validates `payload.sn == topic serial` and
attempts an explicit persisted SOURCE binding first. Without one it can discover
a single active physical inventory serial matching a BDFB Device or its ACTIVE
root CHASSIS (the owner must be an ACTIVE BDFB Device). This creates one durable
MQTT `SOURCE` binding to the owning Device. Duplicate serials, archived items,
nested Breaker SNs or invalid owners fail closed; no UUID is guessed. Stored
auto-discovery bindings are rechecked against current topology on ingestion.

Legacy `MQTT_SOURCE_DEVICE_MAP` is optional compatibility configuration, not
required for new devices. Remove stale local mappings instead of copying UUIDs
from another MongoDB database.

**Identity is not circuit mapping.** Raw `reported` keys cannot be mapped to
breaker serials by SN alone. Only explicit, verified per-point bindings
(`sourceIdentity`, `sourcePointId`, `metric`, target Breaker Equipment ID)
produce breaker readings and TSDB rows. Unmapped raw circuit points stay
UNMAPPED until a physical register/position contract is provided.

Production prerequisites: set `APP_ENV=production`, authenticated
`mqtts://` broker credentials, broker topic ACLs, `TELEMETRY_STORE_TOKEN`
shared with the history store, and private network reachability. Production
store must set `STORE_ENV=production`; unauthenticated local compose settings
must never be deployed to a publicly accessible network.
