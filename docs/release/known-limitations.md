# MK1 Known Limitations

These limitations are part of the release truth boundary.

## Production environment not certified by repository CI

CI does not prove connectivity or behavior for a specific production MongoDB instance, MQTT broker, TLS terminator or hosting provider.

## Production customer-data migration not executed here

G13 certifies migration tooling and staging behavior. No production customer dump is committed or migrated from this public repository.

## Conditional persisted telemetry history

The runtime maintains latest telemetry values in-process and streams them to authenticated browser clients.
When `TELEMETRY_HISTORY_ENABLED=true`, the optional HTTP telemetry-store writer and history
API can persist/query history in a separately deployed Timescale-backed service.
This capability does not prove that a particular deployment has the store enabled, available,
backed up, or monitored. The in-process LIVE hub remains distinct from historical storage.

## Internal history service connectivity and data gaps

The 2026-10-15 lab experienced `HISTORY_STORE_UNAVAILABLE` because requests/writes from Site Mapper to its history adapter returned `fetch failed`. The operator later confirmed the 7D UI displayed history again. That recovery is **not evidence of uninterrupted historical writes**, nor replay of any samples missed while the path was unavailable. The connectivity, writer and TimescaleDB recency checks are documented in [history-connectivity](../operations/history-connectivity.md).

## MQTT QoS

The native MQTT adapter subscribes at QoS 0.

QoS 1 publish acknowledgement is handled where applicable; a complete QoS 2 state machine is not claimed.

## Content Security Policy

A nonce-based CSP is configured in the application proxy, including `strict-dynamic` and
`frame-ancestors 'none'`. Production validation is still required against actual deployed
asset origins, browser behavior and all frontend interactions before security sign-off.

## Load/scalability

The repository has functional/system certification, not a production load benchmark.

Limits such as concurrent users, topology scale and event throughput require environment-specific testing.

## Modbus TCP quality and external BMS acceptance

The optional Site Mapper Modbus sidecar has a locally verified one-breaker FC03 FLOAT32 output, matched against exact recent TimescaleDB measurements from a synthetic MQTT emitter. This does not certify a full 96-circuit BFDB, three sources, a customer field installation or Metasys.

Modbus value freshness currently uses in-process Latest State. After a sidecar restart it starts empty until new accepted samples arrive. Missing, expired, or not-yet-commissioned metrics read as **zero**, which is indistinguishable from a legitimate zero. A quality/status register contract and external BMS handling are required before using these values for safety-related monitoring or controls. Do not expose the unauthenticated Modbus TCP service to a public network.

The current lab Compose chooses an explicit four-24-point mapping while the stand-alone legacy server keeps its two-48-point default. The mapping must be confirmed for each provider and approved source-to-Unit-ID table. See `docs/operations/mqtt-modbus-lab.md`.

## Physical/field certification

The software model represents physical infrastructure, but G14 does not claim certification against a live customer facility or physical telemetry hardware.

## Migration aliases

Legacy aliases exist only inside migration tooling. Runtime support for legacy collection names is intentionally absent.

## Backward compatibility

MK1 is a clean reconstruction. The project does not promise runtime API compatibility with the legacy repository unless explicitly documented by a future compatibility contract.
