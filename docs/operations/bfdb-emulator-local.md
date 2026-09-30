# Site Mapper ↔ BFDB emulator: local commissioning

## Verified contract

Source: `thradexIT/bfdb-telemetry-gateway`, `config/devices.yaml`,
`config/emulator.yaml` and `docs/03-contracts/mqtt-wire-contract.md`.

- Three sources: `EMU-BFDB-01`, `EMU-BFDB-02`, `EMU-BFDB-03`.
- Native MQTT TCP 3.1.1 on the lab broker, usually `127.0.0.1:1883`.
- Subscribe to `data/dev/#`, with topics `data/dev/<serial>`.
- Four synthetic panel groups `A1,A2,B1,B2`, 24 positions each: 96 per BFDB.
- Point format `0_<panelIndex>_<position>` (`1..4`, `1..24`).
- `reported[point]` contains `state,U1,I1,P1,EP1`; numeric strings are valid.
- Partial 24-point batches must accumulate; omitted metrics do not reset prior data.
- MQTT ingestion stays **server-side**. This app never replaces or clones the
  emulator's Modbus projection or TimescaleDB persistence.

## 1. Start your existing emulator

In the `bfdb-telemetry-gateway` checkout (plain anonymous *local* broker):

```bash
docker compose up -d --build
docker compose ps
bash scripts/observe-raw-mqtt.sh
```

Watch for `data/dev/EMU-BFDB-01`, `-02` and `-03`. For the authenticated
remote-review profile, use `make remote-up` and credentials from
`make remote-creds` **locally**. Never commit or paste those passwords.

## 2. Configure Site Mapper

In the Site Mapper checkout, put the connection in ignored `.env.local`:

```dotenv
MQTT_BROKER_URL=mqtt://127.0.0.1:1883
MQTT_TOPIC_PREFIX=data/dev/
MQTT_TOPIC_FILTER=data/dev/#
# Only if using the authenticated review broker:
# MQTT_USERNAME=bfdb-reviewer
# MQTT_PASSWORD=<local read-only reviewer credential>
```

For WSL, containers or a remote tunnel, replace only the broker host/port
with the address reachable **from the process running Site Mapper**. Pinggy
host/port are ephemeral. Never assume an old tunnel is still active. This
laboratory `mqtt://` transport is not the final encrypted production design.

## 3. Start the opt-in synthetic lab (preserves the ZIP demo)

```bash
npm ci
npm run local:emulator
```

`local:dev` remains a visual-only mode with MQTT disabled. `local:emulator`:

1. Starts the development app in memory mode and seeds the original visual demo.
2. Creates a separate **synthetic, unsurveyed** MQTT emulator network with
   three BFDB nodes, four explicit 24-breaker panels each (288 breakers total).
3. Connects to your *running* broker, verifies CONNACK and SUBACK.
4. Requires **live measured source data**, 96/96 points and 96/96 mapped
   breaker readings for **each** of the three serials before reporting success.
5. Prints a local login and diagnostic endpoint. If any source fails, it exits
   nonzero with safe diagnostic counts. It never invents LIVE metrics.

Do not copy synthetic lab layouts, units or device IDs into customer physical
inventory. Persistent MongoDB onboarding requires matching actual
`Device.serialNumber`, explicit `breaker.telemetry.rawPointId` or an approved
`MQTT_SOURCE_DEVICE_MAP`, and surveyed geometry independent of this lab.

## 4. Observe the real ingestion

After signing in:

```text
http://127.0.0.1:3000/api/telemetry/diagnostics
http://127.0.0.1:3000/api/telemetry/latest
```

Diagnostics are authenticated and never return MQTT credentials. Expected
values after a complete emulator cycle:

```text
connection         subscribed
rawMessages        increasing
acceptedMessages   increasing
rejectedMessages   0
EMU-BFDB-01         96 raw points, 96 mapped breakers, LIVE
EMU-BFDB-02         96 raw points, 96 mapped breakers, LIVE
EMU-BFDB-03         96 raw points, 96 mapped breakers, LIVE
```

If raw messages arrive but `acceptedMessages=0`, check the source serials
and existing device identities. If raw data is accepted but breaker mapping is
incomplete, inspect your actual BDFB hierarchy/bindings; do not silently
assign the upstream synthetic group numbers to unverified real panels.
