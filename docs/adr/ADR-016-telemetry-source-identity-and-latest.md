# ADR-016 — Telemetry source identity and durable latest state

- Status: **Accepted for G16 foundation**
- Date: 2026-09-24
- Product: **AppManager Site Mapper**

## Context

The MK1 telemetry runtime originally resolved every MQTT message by scanning all Device and Equipment
nodes and comparing the topic identity with `serialNumber`. Latest telemetry then lived only inside an
in-process `Map`.

The V1 Telxius evidence and owner clarification establish that:

- `sn` is the real Serial Number of the Device/Equipment;
- `reported` contains the raw device payload;
- breaker addresses such as `0_1_1` mean Panel 1 / Circuit Breaker 1 and
  `0_2_24` means Panel 2 / Circuit Breaker 24;
- the first address segment remains opaque until the hardware protocol explicitly defines it;
- a Holder is a physical free position for installing a Circuit Breaker, not a breaker with missing data;
- Circuit Breaker slots are proven as 1..24 for this protocol;
- the universal maximum number of Panels per Device is **not yet proven** and therefore is not hard-coded.

## Decision

G16 introduces an explicit `TelemetrySource` registry. The raw topic source segment resolves to one
registered source with an expected Device/Equipment serial number.

The trust chain is:

```text
broker-authenticated publisher
        ↓ broker ACL
source-scoped raw topic
        ↓
TelemetrySource.topicSource
        ↓
TelemetrySource.expectedSerialNumber
        ↓ must equal
payload.sn
        ↓
Device / Equipment
```

`sn` remains domain truth and integration identity, but a payload string is not by itself network
authentication.

The production raw namespace is shaped as:

```text
appmanager/v1/raw/{topicSource}/telemetry
```

The exact source-to-principal ACL is broker configuration and is not exposed to the browser.

## Raw versus canonical

G16 does **not** replace the hardware wire format with an invented `metrics[]` payload.

The normalizer accepts the proven V1 shape (`sn`, `reported`, breaker addresses and raw keys such as
`u`, `se`, etc.) and preserves those fields. Semantic metric conversion belongs to a later,
versioned adapter backed by fixture evidence.

Unknown raw metric meanings are never guessed.

## Latest state

Latest telemetry is durable repository state, not process memory. The current implementation stores
one atomic latest packet per mapped entity so values from one hardware observation cannot become a
mixed-time projection.

Updates are monotonic by `observedAt` and then `receivedAt`. Source sequence values are preserved
when present but are not yet used as the primary ordering authority because restart/epoch semantics
have not been proven for the hardware protocol.

The in-process `TelemetryHub` is fanout only.

## Production configuration

When telemetry is enabled in production:

- the broker URL must use TLS (`mqtts://`);
- raw topic prefix/suffix/filter must be explicit;
- the ingestion MQTT client ID must be explicit and stable;
- MQTT receive buffering is bounded before packet materialization;
- QoS 1 acknowledgements are not sent until the application handler resolves successfully.

The current native MQTT implementation remains transitional debt. G16 still requires replacement by
a maintained MQTT client library, or protocol-level fuzz certification if it remains.

## Consequences

Positive:

- removes O(N) topology scans from the ingest hot path;
- separates serial-number truth from broker authentication;
- survives process restart when Mongo persistence is selected;
- prevents late packets from moving the latest projection backwards;
- makes production topic/TLS configuration fail closed;
- preserves V1 product/protocol truth without inventing missing semantics.

Remaining G16 work:

- broker ACL/device credential provisioning and rotation;
- runtime/storage validators for all telemetry persistence;
- idempotency ledger, outbox, bounded DLQ and canonical event adapter;
- metric registry backed by real V1 fixtures;
- historical TSDB benchmark and implementation;
- multi-instance realtime certification and session-revocation handling;
- audit subsystem, observability, backup/restore and failure drills;
- replacement/fuzz certification of the native MQTT client;
- real browser + Mongo + MQTT + SSE + TSDB end-to-end certification.
