# ADR-012 — Telemetry Transport, Latest State and Historical Time-Series

**Status:** Proposed  
**Date:** 2026-09-24  
**Product:** Apana Air Site Mapper

## Context

Site Mapper manages canonical infrastructure independently from telemetry. Some physical assets, including selected circuit breakers inside QDF/BDFB panels, are connected to hardware that publishes operational measurements.

The previous product demonstrated MQTT ingestion and realtime presentation, but its AS-IS implementation coupled an MQTT connection to browser-facing SSE flows and retained latest values in browser/process memory without a durable canonical history.

The current product requires:

- an operator-controlled MQTT broker;
- hardware publishing through MQTT;
- latest operational values;
- durable historical time-series;
- analytics over short, medium and long windows;
- authenticated realtime presentation;
- explicit security, auditing and observability;
- no dependency on browser memory or a single web process.

## Decision

Telemetry is separated into four distinct responsibilities:

1. **Transport** — MQTT broker and source connectivity.
2. **Ingestion and normalization** — trusted application boundary that validates and canonicalizes messages.
3. **Latest operational state** — low-latency latest-value store independent from browser/web-process memory.
4. **Historical time-series** — durable time-series-capable storage and query/aggregation layer.

The high-level flow is:

```text
Hardware
  ↓ MQTT/TLS
MQTT Broker
  ↓
Telemetry Ingestion Worker
  ├─ normalization / validation / quality
  ├─ latest-value update
  └─ historical write
        ↓
Telemetry Query / Realtime Boundary
        ↓
Authenticated Site Mapper UI
```

### Broker

Production requires MQTT over TLS, ACLs and rotatable credentials.

Browser clients never receive broker credentials and do not connect directly to MQTT.

### Ingestion

A dedicated ingestion runtime/worker owns MQTT subscriptions.

It is separated from the transactional Next.js request lifecycle so horizontal web scaling does not multiply broker subscriptions by browser connection.

### Latest values

Latest values are not authoritative when stored only in browser or process memory.

The selected deployment must provide latest-state continuity outside a single web process. The exact technology is a deployment decision; Redis or an equivalent distributed cache is one admissible option, not a frozen dependency.

### Historical storage

Historical telemetry is persisted in a time-series-capable datastore.

The historical store is accessed behind a Site Mapper repository/query interface.

Vendor-specific APIs and query languages do not enter the domain or UI layers.

### Technology selection

Prior experience with InfluxDB and Telegraf is retained as evidence.

This ADR does not yet select InfluxDB, TimescaleDB, MongoDB time-series collections or another engine.

A follow-up architecture decision must compare candidate technologies against measured ingestion/query/retention/operations requirements before production selection.

Telegraf, if used, is an infrastructure adapter and not the application/domain boundary.

## Canonical source binding

A telemetry source binds explicitly to a canonical entity or internal component.

Hardware identity and topic identity are external references, not Site Mapper primary keys.

Duplicate active hardware identities in the same integration scope are prohibited.

## Canonical time model

Every accepted reading has:

- `observedAt` when provided/trusted by source;
- `receivedAt` assigned by the ingestion boundary;
- optional sequence/message identity;
- canonical metric keys;
- explicit units;
- quality classification.

## Current/History separation

Realtime UI reads latest state.

Historical views query the time-series layer.

Long-window requests must use server-side aggregation/downsampling and must not load an unbounded raw event history into the browser.

## Failure behavior

Telemetry failure never mutates or deletes the canonical physical topology.

Missing telemetry is represented as unavailable/stale rather than by inventing measurements.

Historical-store or broker outages are observable operational states.

## Security

Telemetry data is external untrusted input.

Before entering trusted application state it must pass:

- source/topic authorization;
- payload size bounds;
- schema validation;
- metric/unit validation;
- timestamp validation;
- rate/backpressure controls.

Production requires secure secret storage, TLS, credential rotation and audit of telemetry-source configuration.

## Consequences

### Positive

- eliminates MQTT connection-per-browser behavior;
- allows web tier horizontal scaling;
- supports historical analytics;
- makes latest/realtime semantics explicit;
- isolates vendor choices;
- improves security and observability;
- permits independent scaling of ingestion and queries.

### Cost

- adds one or more deployable infrastructure components;
- requires backup/restore and retention policy for historical data;
- requires distributed latest-state strategy for multi-instance deployments;
- requires load testing and capacity planning.

## Required follow-up

Before implementation is sealed:

1. define expected connected source count;
2. define normal and peak publish cadence;
3. capture representative sanitized MQTT payloads;
4. define metric catalog;
5. define target query windows and chart resolutions;
6. estimate raw and aggregated storage growth;
7. compare time-series engines;
8. select broker implementation/deployment;
9. define retention/downsampling;
10. certify broker ACL/TLS;
11. define backup/restore and RTO/RPO;
12. load-test end-to-end ingestion and query paths.

## Supersedes / resolves

This ADR fills the telemetry-transport decision gap identified by the MK1 reconstruction plan while preserving the legacy product behavior as evidence rather than reusing its accidental runtime architecture.
