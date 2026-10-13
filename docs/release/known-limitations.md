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

## Physical/field certification

The software model represents physical infrastructure, but G14 does not claim certification against a live customer facility or physical telemetry hardware.

## Migration aliases

Legacy aliases exist only inside migration tooling. Runtime support for legacy collection names is intentionally absent.

## Backward compatibility

MK1 is a clean reconstruction. The project does not promise runtime API compatibility with the legacy repository unless explicitly documented by a future compatibility contract.
