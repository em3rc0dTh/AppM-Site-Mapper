# ADR-018 — Durable latest state and authenticated realtime fanout

- Status: **Accepted for G16 foundation**
- Date: 2026-09-24
- Product: **AppManager Site Mapper**

## Context

AppManager Site Mapper needs two different realtime concerns:

1. a durable answer to "what is the latest accepted telemetry for this entity?"; and
2. low-latency delivery of newly accepted telemetry to connected browsers.

The legacy implementation and the first MK1 runtime kept latest telemetry in process/browser memory.
That is not sufficient for restart recovery or multiple web replicas.

G16 already introduced a durable latest repository and server-mediated SSE. The remaining risk was
session lifetime: the telemetry stream authorized the user only when the connection was opened, so a
session revoked afterwards could continue receiving data until the connection ended.

## Decision

### Durable latest is authoritative

The `TelemetryLatestRepository` is the source of truth for current telemetry state.

- production persistence is Mongo-backed;
- process memory is permitted only for non-production/test modes;
- latest updates are monotonic according to the accepted telemetry ordering policy;
- restart recovery reads latest from durable storage;
- an SSE connection is never considered a persistence boundary.

The process-local `TelemetryHub` remains a delivery optimization only.

### Browser realtime uses SSE

Browser clients receive telemetry through authenticated server-side SSE.

The browser:

- never receives MQTT credentials;
- never connects directly to the hardware MQTT namespace;
- may reconnect and recover state from the durable latest snapshot.

WebSocket is not introduced until the product has a proven bidirectional realtime requirement.

### Session authorization is revalidated

The SSE route captures the authenticated session token at connection time and reauthorizes that same
token against `telemetry:read` every 30 seconds.

The stream closes fail-closed when:

- the session expires;
- the session is revoked;
- the user is archived;
- the user's role no longer grants `telemetry:read`;
- password-change policy makes the session unauthorized; or
- the authorization store cannot be revalidated.

The route emits only a bounded session status code before closing; it does not expose the session
token or repository details.

Heartbeat and authorization timers are cancelled together with the hub subscription when the stream
ends.

### No automatic Redis dependency

G16 does not introduce Redis merely to distribute SSE events.

For the current scale, durable latest plus the existing project-controlled broker provide enough
primitives to test a service-only internal canonical fanout path when multiple web replicas are
introduced.

Redis Pub/Sub or Redis Streams remains an admissible future option only if load/failure testing shows
that the broker-backed/internal fanout is insufficient or operationally more expensive.

## Consequences

Positive:

- revoking a session no longer relies on a browser reconnect;
- latest state survives web-process restarts;
- browser delivery is decoupled from MQTT authentication;
- the architecture can add web replicas without changing the latest-state authority;
- no new cache infrastructure is introduced without evidence.

Residual/open G16 work:

- certify revocation with a real browser E2E test;
- certify multi-instance fanout with at least two web replicas;
- define the internal canonical fanout namespace after the broker ACL contract is frozen;
- measure reconnect behavior and stream count limits under load;
- include realtime authorization failures and reconnects in observability;
- keep session-revocation latency within the final G16 SLO.
