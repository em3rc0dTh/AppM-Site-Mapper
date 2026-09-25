# MK1 Known Limitations

These limitations are part of the release truth boundary.

## Production environment not certified by repository CI

CI does not prove connectivity or behavior for a specific production MongoDB instance, MQTT broker, TLS terminator or hosting provider.

## Production customer-data migration not executed here

G13 certifies migration tooling and staging behavior. No production customer dump is committed or migrated from this public repository.

## Production telemetry history is not yet selected/wired

G16 persists canonical latest telemetry in MongoDB production mode and durably records accepted
telemetry/history-outbox state. Authenticated realtime fan-out remains process-local.

The product still does **not** have a selected and production-certified historical TSDB/query path.
The 24H/7D/30D breaker History experience used by the demo is synthetic and must remain labeled as
such until the history-store gate is closed.

## MQTT QoS

The native MQTT adapter subscribes at QoS 0.

QoS 1 publish acknowledgement is handled where applicable; a complete QoS 2 state machine is not claimed.

## Content Security Policy

Baseline browser security headers are configured, but a full CSP is not currently defined.

CSP should be designed and validated against the actual deployment and allowed asset origins before production security sign-off.

## Load/scalability

The repository has functional/system certification, not a production load benchmark.

Limits such as concurrent users, topology scale and event throughput require environment-specific testing.

## Physical/field certification

The software model represents physical infrastructure, but G14 does not claim certification against a live customer facility or physical telemetry hardware.

## Migration aliases

Legacy aliases exist only inside migration tooling. Runtime support for legacy collection names is intentionally absent.

## Backward compatibility

MK1 is a clean reconstruction. The project does not promise runtime API compatibility with the legacy repository unless explicitly documented by a future compatibility contract.
