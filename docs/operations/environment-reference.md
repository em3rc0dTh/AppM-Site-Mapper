# Site Mapper MK1 — Runtime environment reference

This document describes **current** configuration for the Next.js application, the independent TimescaleDB telemetry store and the Site Mapper-owned Modbus TCP sidecar. Values containing secrets belong in an ignored local environment file or a deployment secret manager, never in this public repository.

## Deployment environment vs Next.js runtime

- `APP_ENV`: `development | test | staging | production`. This is the explicit deployment security boundary.
- `NODE_ENV=production` is expected when running the **optimized Next.js build**, including in the local Docker laboratory. It does **not** by itself mean that the deployment is a production environment if `APP_ENV` is explicitly configured.
- In the absence of `APP_ENV`, production `NODE_ENV` triggers production security requirements. `APP_ENV=production` always enforces them.
- `APP_PERSISTENCE`: `memory` or `mongodb`; production requires `mongodb`.
- `MONGODB_URI`, `MONGODB_DB_NAME`: canonical MongoDB connection and database (default `appm_site_mapper`).
- `BOOTSTRAP_ADMIN_TOKEN`: private one-time initialization secret.

## MQTT consumer

- `TELEMETRY_ENABLED=true` enables the server-side subscriber; `false` disables it.
- `MQTT_BROKER_URL`: `mqtt://` for an explicitly isolated development lab, `mqtts://` **required** by `APP_ENV=production`.
- `MQTT_USERNAME`, `MQTT_PASSWORD`: private credentials; both are mandatory for MQTT in production.
- `MQTT_TOPIC_PREFIX`: default `data/dev/`.
- `MQTT_TOPIC_FILTER`: default `data/dev/#`.
- `MQTT_EXPECTED_SOURCES`: optional comma-separated serial identities for diagnostics only.
- `TELEMETRY_MAX_STREAMS`: default 100.
- `TELEMETRY_MAX_PAYLOAD_BYTES`: default 262144.
- `TELEMETRY_REJECTION_LOG_INTERVAL_MS`: default 60000.
- `MQTT_SOURCE_DEVICE_MAP`: **legacy optional** JSON object that maps source serial to a Device ID. Avoid it when the physical Device/Equipment already has the correct unique source serial. It is not a breaker binding mechanism.

A unique active `Device.serialNumber` or `Equipment.serialNumber` can resolve a publisher **to that exact inventory node**. A breaker reading is attributed only by explicitly accepted, active source/point/metric-to-Equipment bindings. The panel commissioning API requires operator confirmation; **neither physical position nor a prefix automatically binds a breaker**.

Do not use the old `BFDB_TELEMETRY_BINDING_MODE=panel-order-24` proposal as an active runtime contract; the current runtime does not consume it. Likewise `BFDB_POSITIONS_PER_PANEL` does not commission a circuit.

## Historical telemetry — independent persistence

- `TELEMETRY_HISTORY_ENABLED=true`: write accepted telemetry to the Site Mapper-owned history adapter.
- `TELEMETRY_STORE_URL`: private adapter URL. Compose uses `http://telemetry-store:8080`; host-local examples can use `http://127.0.0.1:18081`.
- `TELEMETRY_STORE_TIMEOUT_MS`: default 5000.
- `TELEMETRY_STORE_TOKEN`: private bearer token; mandatory when the Next.js deployment security policy is production. Ensure the history adapter also validates the same secret.
- `TIMESCALE_DSN`: private PostgreSQL DSN of the standalone history adapter; never expose in the browser.

`telemetry_entity_samples` preserves exact Equipment patches; `telemetry_samples` stores projected electrical breaker rows when supported. Their row counts need not be identical.

History window query values are **case sensitive**: `LIVE`, `24h`, `7d`, `15d`, `1M`.

## Modbus TCP — Site Mapper-owned optional output

- `MODBUS_SOURCE_UNITS_JSON`: required **explicit approved** mapping of source serial to Modbus Unit ID (1–247). No serial-to-unit assignment is inferred from the UI or topology.
- `MODBUS_BRIDGE_TOKEN`: private bearer token of at least 24 characters, shared only between the Next.js backend and private sidecar.
- `MODBUS_BRIDGE_URL`: backend-to-sidecar **private** URL, e.g. `http://modbus-tcp:18082` in Compose.
- `MODBUS_POINT_LAYOUT`: `blocks-2x48` (legacy stand-alone default) or `panels-4x24` (current BFDB laboratory Compose default). The latter maps `0_1_1..24`, `0_2_1..24`, `0_3_1..24`, `0_4_1..24` across 96 distinct circuits. Confirm actual provider addressing before switching.
- `MODBUS_STALE_MS`: default 30000.
- `MODBUS_BIND_HOST`, `MODBUS_BIND_PORT`: TCP Modbus listener; Compose container listens on 1502 and binds host-only port 1503.
- `MODBUS_INGEST_HOST`, `MODBUS_INGEST_PORT`: private authenticated HTTP ingest listener; Compose container listens on 18082.

Do not publish the ingest listener or Modbus TCP publicly. Modbus FC03 provides **no native authentication**. Missing or stale registers currently read zero, so **Metasys safety control is not certified** without explicit quality semantics.

## Lab start

See [MQTT → TimescaleDB → Modbus local operation](./mqtt-modbus-lab.md) for start, verification, isolation, rollback and exact CB-01 evidence. The laboratory's `APP_ENV=development` and host loopback ports are not a production deployment template.
