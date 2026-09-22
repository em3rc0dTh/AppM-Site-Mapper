# Legacy Telemetry Findings

Status: G1 evidence. No legacy credential value is copied into MK1 documentation.

## Observed flow

The legacy runtime implements the conceptual path:

`MQTT broker -> Next.js route -> SSE -> EventSource -> React context`.

The server route subscribes to the MQTT topic pattern:

`data/dev/#`

and exposes a `text/event-stream` response.

The client context opens an `EventSource` and maintains latest data keyed by device/serial identity.

## Security evidence

The frozen telemetry route does not reference the authoritative session/auth mechanism before opening the stream.

Historical and current inspection also established that broker credentials existed directly in committed legacy application code. Their values are intentionally not reproduced here.

Those credentials must be treated as exposed and rotated outside this public repository.

## MK1 classification

Preserve:

- server-side MQTT connection;
- browser-safe realtime fan-out;
- device-keyed latest telemetry concept;
- reconnect behavior as a requirement to re-evaluate.

Reimplement:

- credential handling;
- authentication;
- authorization;
- topic allowlisting;
- payload validation;
- normalization;
- subscription lifecycle;
- connection limits;
- logging and error behavior.

## Required evidence still missing

Before the telemetry contract is frozen we need sanitized examples of:

- real topic names;
- representative payloads;
- serial/device mapping;
- `reported` semantics;
- expected update frequency;
- offline detection;
- reconnect expectations;
- whether history is required or realtime-only.
