# G10 — Telemetry Gateway Receipt

**Status:** READY FOR CI / REVIEW

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

## Gate verdict

Final PASS requires the complete CI pipeline to succeed on the final G10 head.
