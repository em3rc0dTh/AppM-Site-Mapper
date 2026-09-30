# Local MongoDB inventory + live BFDB emulator MQTT

Unlike `npm run local:emulator`, this mode does **not** use memory, seed a
synthetic Network or change the existing Mongo topology.

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
