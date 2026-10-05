# G10 — Telemetry Gateway Receipt

**Status:** PASS

## Delivered

- server-side MQTT adapter without browser broker exposure;
- mqtt/mqtts transport;
- CONNECT/SUBSCRIBE/PING/PUBLISH protocol handling;
- bounded reconnect strategy;
- topic allowlist;
- payload-size and JSON validation;
- legacy `reported` normalization;
- unique Device/Equipment telemetry identity resolution;
- latest-value telemetry hub;
- authenticated SSE stream;
- stream-capacity limit;
- heartbeat behavior;
- authenticated latest-value API;
- non-production authenticated ingestion hook;
- live Telemetry UI;
- protocol, normalizer and service tests;
- telemetry contract documentation.

## Security boundary

No MQTT secret value is committed.

Legacy MQTT credentials must be rotated before enabling production telemetry.

## Certification

The complete CI pipeline passed on the certified implementation head:

- typecheck;
- lint;
- format check;
- unit tests;
- integration tests;
- production build;
- production dependency audit.

## Gate verdict

**PASS — G11 Operational Workspace is authorized after this PR is integrated into `main`.**
