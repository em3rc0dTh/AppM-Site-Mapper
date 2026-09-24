# ADR-020 — Idempotency, durable acceptance, outbox and quarantine

- Status: **Accepted for G16 foundation**
- Date: 2026-09-24
- Product: **AppManager Site Mapper**

## Context

The V1 Telxius source evidence proves only a minimum raw contract of `sn` plus `reported`.
The historical parser does not prove that every hardware message contains a source timestamp,
message identifier or sequence.

MQTT QoS 1 can redeliver a publish. At the same time, treating two byte-identical legacy payloads as
duplicates would be unsafe because a device may legitimately report the same electrical values in
two consecutive observations.

G16 therefore needs a durable acceptance boundary without claiming idempotency that the source
protocol cannot support.

## Decision

Accepted telemetry is first written to the Mongo-backed `telemetry_outbox` ledger before the MQTT
handler resolves and a QoS 1 PUBACK may be emitted.

Each ledger row contains:

- a server-generated `eventId`;
- the validated raw-normalized sample;
- a SHA-256 fingerprint of the original payload;
- `acceptedAt`;
- history delivery state;
- an optional idempotency key.

The outbox is both the durable acceptance ledger and the future history-delivery queue. It removes
the need for a second dedupe collection and avoids a multi-document transaction on the ingestion hot
path.

After acceptance, latest state is updated. If the process fails after the outbox write but before
latest update/PUBACK, QoS 1 redelivery finds the same durable event and retries the latest projection.

## Idempotency hierarchy

Strong dedupe is enabled only when the raw producer provides reproducible identity:

1. `messageId`, when supplied; otherwise
2. `producerEpoch + sequence`, when both are supplied.

The idempotency key itself is SHA-256 hashed before storage.

A sequence without a producer/reboot epoch is not used for dedupe because sequence reuse after a
hardware restart has not been disproven.

The minimal V1 payload, with neither source message identity nor restart-safe sequence information,
is deliberately **not** deduplicated by payload hash. This avoids silently collapsing two legitimate
equal readings.

This leaves a known residual risk: a QoS 1 redelivery of a minimal V1 message can produce a duplicate
historical event. Closing that risk requires an upstream message identity, restart-safe sequence or
other hardware-supported replay contract.

## Collision/tamper handling

If the same idempotency key is observed with a different payload SHA-256 fingerprint, ingestion
returns `IDEMPOTENCY_CONFLICT`. The conflicting payload is not accepted as a second event and safe
metadata is written to quarantine.

## Quarantine

Rejected messages write bounded metadata to `telemetry_quarantine`:

- reason code;
- topic;
- receive timestamp;
- payload size;
- payload SHA-256;
- source id and claimed serial number when safely available.

Raw rejected payloads are **not** stored by this layer. This reduces the risk of persisting secrets
or unbounded hostile input in the operational database.

Mongo stores quarantine timestamps as BSON dates. A TTL index on `expiresAt` enforces the configured
retention rather than documenting a retention policy that does not execute.

If quarantine persistence itself fails, ingestion throws and QoS 1 is not acknowledged. The broker
may redeliver once storage recovers.

## Consequences

Positive:

- accepted data exists durably before MQTT acknowledgement;
- retry after a crash can repair latest state;
- strong producer identities dedupe safely;
- idempotency collisions become observable security/integrity events;
- minimal V1 payloads are not falsely collapsed;
- rejected raw payloads are not copied into Mongo;
- the future historical writer can drain one explicit pending outbox.

Remaining G16 work:

- canonical metric adapter backed by real V1 fixtures;
- history writer and TSDB delivery acknowledgement/retry;
- outbox backlog limits, metrics and alerting;
- broker-side QoS/session/ACL certification;
- audit events for administrative changes and DLQ replay;
- hardware replay contract for loss before broker acceptance.
