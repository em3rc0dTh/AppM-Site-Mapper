# G10 Extension — BFDB MQTT Integration Receipt

Status: **IMPLEMENTED / PR VALIDATION PENDING**

Date: 2026-09-28

## Scope

Integrate the BFDB MQTT wire contract into AppM without cloning emulator, broker or Modbus responsibilities.

## Required evidence

```text
[ ] typecheck
[ ] lint
[ ] format check
[ ] unit tests
[ ] integration tests
[ ] production build
[ ] BFDB envelope validation test
[ ] source serial -> local Device mapping test
[ ] 0_<panel>_<position> -> breaker mapping test
[ ] explicit breaker binding test
[ ] missing != zero partial-update test
[ ] holder is not promoted to breaker test
```

## Architecture invariants

```text
[x] MQTT credentials remain server-side
[x] AppM does not start/clone the BFDB emulator
[x] AppM does not implement the BFDB Modbus server
[x] Mongo Device/BDFB/Breaker identity remains independent of MQTT raw IDs
[x] Provider endpoint is runtime configuration
[x] Browser consumes authenticated SSE, not broker credentials
```

## Runtime inputs

```text
TELEMETRY_ENABLED
MQTT_BROKER_URL
MQTT_USERNAME
MQTT_PASSWORD
MQTT_TOPIC_PREFIX
MQTT_TOPIC_FILTER
MQTT_SOURCE_DEVICE_MAP
BFDB_TELEMETRY_BINDING_MODE
BFDB_POSITIONS_PER_PANEL
```

## Truth boundary

Passing this receipt proves repository-level BFDB MQTT consumption and presentation behavior.

It does not prove a real hardware mapping, production provider endpoint, Metasys commissioning or Timescale historical persistence.
