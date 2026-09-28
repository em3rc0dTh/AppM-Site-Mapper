# G10 Extension — BFDB MQTT Integration Receipt

Status: **PASS — REPOSITORY INTEGRATION CERTIFIED**

Date: 2026-09-28

## Scope

Integrate the BFDB MQTT wire contract into AppM without cloning emulator, broker or Modbus responsibilities.

## Certified revision

```text
PR: #31
Validated head: ef92ca11dc28e16c1b87c58dc44d5f49ac6d5fa0
GitHub Actions: CI #568
Result: SUCCESS
```

## Required evidence

```text
[x] typecheck
[x] lint
[x] format check
[x] unit tests — 35 passed / 14 files
[x] integration tests — 22 passed / 10 files
[x] system certification — 1 passed / 1 file
[x] production build
[x] production dependency audit — 0 vulnerabilities
[x] BFDB envelope validation test
[x] source serial -> local Device mapping test
[x] 0_<panel>_<position> -> breaker mapping test
[x] explicit breaker binding test
[x] missing != zero partial-update test
[x] holder is not promoted to breaker test
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

## Certified behavior

The repository now proves that AppM can:

1. accept the current BFDB MQTT envelope;
2. verify topic serial and payload `sn`;
3. map emulator source identities to existing AppM Device IDs;
4. map panelized MQTT points to existing breakers without replacing breaker identity;
5. preserve explicit zero values;
6. retain previous electrical metrics when a later BFDB packet omits them;
7. keep HOLDER endpoints distinct from BREAKER endpoints;
8. merge rotating BFDB batches into Latest State;
9. expose the resulting measurements through the authenticated SSE path;
10. render mapped V/I/P/E/state in the existing BDFB visual interface.

## Truth boundary

Passing this receipt proves repository-level BFDB MQTT consumption and presentation behavior.

It does not prove a real hardware mapping, production provider endpoint, Metasys commissioning or Timescale historical persistence.
