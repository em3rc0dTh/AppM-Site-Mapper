# Synthetic telemetry provider

This is a development/demo producer that behaves like an external hardware publisher. It is not a
mock inside the Site Mapper runtime and it must never contain production credentials or customer
data.

## Wire payload

The generator intentionally mirrors the observed legacy AppManager payload shape:

- `msgid`
- `method: "update"`
- real-shaped `sn`
- Unix-second `timestamp` and `sendtime`
- `version: 1`
- partial `reported` breaker maps
- breaker `state`
- `U1/U2/I1/I2/P1/P2/EP1/EP2`

A cycle is fragmented in the observed order:

1. `0_1_21 .. 0_1_24`
2. `0_1_1 .. 0_1_10`
3. `0_1_11 .. 0_1_20`

Breakers 1..12 carry synthetic electrical values. Breakers 13..24 are state-only, matching the
shape of the captured evidence. The values are deterministic for a given `SIM_SEED`.

No semantic unit is assigned to `EP1/EP2` here. The simulator preserves those raw keys without
inventing a meaning that has not yet been proven.

## Topic modes

### appmanager

Default. Publishes the legacy-shaped payload through the current G16 raw namespace:

```text
appmanager/v1/raw/<SIM_TOPIC_SOURCE>/telemetry
```

Use this mode to feed the current Site Mapper ingestion path now.

### legacy

Publishes the historical hardware topic exactly:

```text
data/dev/<SIM_SERIAL_NUMBER>
```

Site Mapper can consume this exact topic shape by selecting the matching runtime topic contract:

```env
MQTT_TOPIC_PREFIX=data/dev/
MQTT_TOPIC_SUFFIX=
MQTT_TOPIC_FILTER=data/dev/+
```

In legacy mode the source provisioner binds `topicSource` to the serial number, matching both the
topic segment and payload `sn`. The repository-owned secured Mosquitto reference profile still
authorizes hardware writes only in the reviewed `appmanager/v1/raw/%u/telemetry` namespace; do not
broaden that production ACL until the legacy publisher principal mapping is evidenced and reviewed.

## Local setup

Copy the example environment file:

```bash
cp .env.telemetry-simulator.example .env.telemetry-simulator
```

The current ingestor verifies both `topicSource` and payload `sn`. A matching
`telemetry_sources` record must therefore exist.

For an end-to-end demo with the simulator as a separate process, use Mongo persistence and point
`SIM_ENTITY_ID` at an existing Site Mapper Device or Equipment. Then provision the synthetic
source:

```bash
npm run telemetry:sim:provision
```

The provisioner is intentionally narrow: it creates only the telemetry source binding. It does not
invent topology.

Start the provider:

```bash
npm run telemetry:sim
```

Stop it with Ctrl+C.

## Current Site Mapper telemetry configuration

For the default `appmanager` mode, the application side remains:

```env
TELEMETRY_ENABLED=true
MQTT_TOPIC_PREFIX=appmanager/v1/raw/
MQTT_TOPIC_SUFFIX=/telemetry
MQTT_TOPIC_FILTER=appmanager/v1/raw/+/telemetry
```

The simulator and Site Mapper must connect to the same broker.

## What to inspect

While the simulator runs, inspect the application through the existing authenticated telemetry
surfaces:

- latest telemetry
- realtime SSE
- telemetry history/outbox operations

The synthetic publisher traverses the same MQTT ingestion, source/SN verification, durable
acceptance, latest-state and history delivery boundaries as any publisher accepted by that topic
profile.

## Latest snapshot behavior

The observed hardware sends partial breaker maps. Site Mapper keeps each accepted raw packet intact
for durable acceptance/history, while the operational latest projection incrementally merges
top-level `reported` entries from the same source/serial/protocol stream.

Each merged reported entry carries its own observation/receive recency metadata. A source or serial
change resets the operational snapshot instead of mixing readings from different hardware.

Synthetic source bindings are explicitly marked `simulated: true`; canonical metrics produced from
them use `SIMULATED` quality rather than being presented as physical hardware measurements.
