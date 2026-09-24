# Telemetry & Time-Series Product Contract

**Product:** Apana Air Site Mapper  
**Status:** Proposed current product contract  
**Scope:** Hardware telemetry from connected QDF/BDFB circuit breakers and other telemetry-capable assets.

## 1. Objective

Site Mapper must represent the physical infrastructure and, where hardware telemetry exists, correlate operational measurements with the exact managed asset that produced them.

The platform must support both:

- **operational realtime state** — the latest valid measurement used by operators now;
- **historical time-series state** — durable measurements used for analytics over hours, days, weeks, months and longer horizons.

Realtime and historical telemetry are related but are not the same storage responsibility.

## 2. Physical/product context

The topology is managed independently from telemetry.

A topology can exist completely without connected hardware.

A telemetry-capable asset becomes observable only when an explicit telemetry source is configured and bound to the canonical domain entity.

### Current physical scenario

The immediate operating scenario includes three QDF/BDFB units.

A QDF/BDFB can occupy an entire Container/Rack, for example a 42U or 48U rack. This is a valid deployment configuration for the current scenario, not a universal product invariant.

Other devices can coexist in different physical arrangements in future configurations.

## 3. BDFB / Panel / Holder / Circuit Breaker semantics

A BDFB/QDF may contain Frames depending on the physical model.

Panels contain a configured number of component positions. The prior validated UI includes Panels with 24 positions.

A component position starts as a **Holder** when no circuit breaker is installed/configured.

When a circuit breaker occupies that position, the position exposes the breaker as an operational component.

Not every breaker is necessarily connected to telemetry hardware.

A telemetry-connected breaker must have an explicit TelemetrySource binding.

## 4. Provisioning relationship

A circuit breaker can be provisioned toward a target Device/Equipment, often located in another Container/Rack.

The relationship must be represented by the canonical Power domain and must not be inferred from telemetry.

Typical trace:

`BDFB/QDF → Frame → Panel → Circuit Breaker → PowerConnection/Path → Target Device`

A/B path semantics remain part of the power/provisioning domain.

Disconnecting or changing a provisioning relation must not silently erase historical telemetry.

## 5. Pinning

Pinning is generic.

Any asset declared pinnable by the application may be pinned to the Workspace, including but not limited to:

- BDFB/QDF;
- Device;
- Equipment;
- other supported operational entities.

Pinning means “operator wants this asset readily visible”.

It does not:

- change topology;
- change ownership;
- create telemetry;
- change telemetry retention;
- grant authorization.

## 6. Telemetry source identity

Telemetry identity must be explicit and independent from UI labels.

Each connected hardware producer must map to exactly one active TelemetrySource.

A TelemetrySource must declare at minimum:

- internal immutable source ID;
- bound canonical entity/component ID;
- source type;
- external hardware identity;
- topic binding/version;
- enabled/disabled state;
- expected cadence or heartbeat when known;
- stale threshold;
- schema version;
- allowed metric catalog/version.

Serial number may be used as an external identity where the integration requires it, but it must not become the platform primary key.

Duplicate active external identities are forbidden inside the same integration scope.

## 7. MQTT broker requirement

Site Mapper requires a broker under project/operator control.

Production broker requirements:

- MQTT over TLS;
- server certificate validation;
- no broker credentials exposed to browser clients;
- per-source or per-device credentials where practical;
- topic ACLs enforcing publish scope;
- restricted service subscriptions;
- credential rotation;
- connection and publish rate controls;
- payload size limits;
- observability of connection/rejection state.

The application must not require a browser to connect directly to MQTT.

## 8. Ingestion boundary

The target flow is:

```text
Hardware
  ↓ MQTT/TLS
Project-controlled MQTT Broker
  ↓
Telemetry Ingestion Worker
  ├─ validate topic/source identity
  ├─ validate payload/schema
  ├─ assign receivedAt
  ├─ normalize metric keys/units
  ├─ classify quality
  ├─ deduplicate/order where possible
  ├─ update latest-value store
  └─ persist historical readings
       ↓
Realtime fanout + Historical query API
       ↓
Authenticated Site Mapper UI
```

The transactional Next.js web process must not be the only owner of telemetry ingestion state.

## 9. Canonical telemetry envelope

The transport-specific payload may differ by hardware generation.

After ingestion, Site Mapper must normalize messages to a canonical internal envelope similar to:

```json
{
  "schemaVersion": 1,
  "messageId": "uuid-or-source-message-id",
  "sourceId": "telemetry-source-id",
  "entityId": "canonical-domain-id",
  "observedAt": "2026-09-24T12:00:00Z",
  "receivedAt": "2026-09-24T12:00:01Z",
  "sequence": 12345,
  "metrics": [
    {
      "key": "voltage_v",
      "value": 48.1,
      "unit": "V",
      "quality": "VALID"
    }
  ]
}
```

`sequence` may be absent when unsupported by hardware.

`observedAt` should come from the source when trustworthy; `receivedAt` is always assigned by the ingestion boundary.

## 10. Metric catalog

Expected breaker telemetry includes, when supplied by hardware:

- voltage;
- current/amperage;
- electrical load;
- active power;
- energy when supplied;
- other hardware-specific metrics approved in the integration catalog.

Metrics are versioned definitions, not arbitrary UI keys.

Each metric definition must include:

- canonical key;
- display name;
- unit;
- numeric type/precision;
- expected range when meaningful;
- aggregation rules;
- whether it is raw or calculated.

### Calculated metrics

A calculated value is allowed only when:

- the formula is documented;
- required source metrics are known;
- units are compatible;
- quality is propagated;
- the resulting value is explicitly marked `CALCULATED`.

For example, power must not be fabricated merely because voltage and current fields happen to exist if the electrical model/formula required for that source has not been approved.

## 11. Quality and freshness

At minimum support:

- `VALID`
- `LAST_KNOWN`
- `STALE`
- `UNAVAILABLE`
- `INVALID`
- `CALCULATED`
- `SIMULATED` for non-production/demo data only

The UI must never make stale or simulated data visually indistinguishable from fresh hardware data.

## 12. Latest-value contract

The latest-value path is optimized for operational reads.

For each source/metric, expose the most recent accepted value plus:

- observedAt;
- receivedAt;
- quality;
- age/freshness;
- unit.

Latest state must live outside browser memory and outside any single ephemeral web instance.

A process restart must not permanently destroy the latest operational state if historical storage already contains valid data.

## 13. Historical time-series contract

Accepted telemetry readings are stored durably in a time-series-capable datastore.

Required query horizons include:

- current/latest;
- intraday/current day;
- 24 hours;
- seven days;
- approximately one month;
- arbitrary bounded historical ranges allowed by retention policy;
- longer-term analytics where retained data exists.

The API must support downsampled/aggregated responses for large windows.

The browser must not fetch raw high-frequency points for long periods when an aggregate representation is sufficient.

## 14. Aggregation

The telemetry query layer should support appropriate aggregations such as:

- min;
- max;
- average;
- last;
- count;
- energy integration or domain-specific aggregate only where mathematically valid.

Aggregation periods may include:

- raw/fine-grained;
- minute;
- 5/15 minute;
- hourly;
- daily;
- longer rollups when required.

Aggregation policy is metric-specific.

## 15. Retention

Retention must be explicit and environment/customer configurable.

The system may retain:

- fine-grained raw telemetry for a shorter period;
- downsampled rollups for longer periods.

Retention policy must be decided from:

- hardware frequency;
- number of connected sources;
- expected growth;
- customer/business requirement;
- query latency;
- storage budget;
- legal/contractual requirements.

No arbitrary retention value is frozen by this document.

## 16. Time-series technology

The previous implementation experience used InfluxDB and Telegraf.

That experience is useful evidence, but the current MK1 contract deliberately does **not** freeze InfluxDB, Telegraf or another time-series vendor until an architecture decision compares:

- ingestion throughput;
- query patterns;
- retention/downsampling;
- backup/restore;
- HA requirements;
- operational complexity;
- cost;
- integration with the chosen deployment target;
- migration/export capability;
- security support.

Whatever technology is selected must sit behind the Telemetry application boundary.

No UI or domain service may depend directly on vendor-specific query syntax.

## 17. Realtime transport to the browser

The initial browser realtime contract may use SSE because the flow is predominantly server → browser.

Requirements:

- authenticated;
- authorization checked for the requested scope;
- bounded connections;
- session expiry/revocation handling;
- heartbeat;
- reconnect support;
- no MQTT credentials in browser;
- no broker wildcard exposed to browser.

WebSocket is not required unless bidirectional realtime behavior becomes a real requirement.

## 18. Invalid messages and backpressure

Invalid or suspicious messages must not poison latest/history state.

The ingestion boundary must handle:

- malformed JSON/binary payloads;
- unknown source;
- unauthorized topic;
- oversized payload;
- invalid metric/unit;
- invalid timestamp;
- duplicate message;
- out-of-order sequence;
- impossible values where a range exists;
- rate anomalies.

Rejected data should be observable through metrics/logging and, where operationally useful, a bounded quarantine/dead-letter mechanism.

## 19. Security boundary

Telemetry hardware is untrusted external input.

Required controls include:

- TLS;
- ACL;
- secret management;
- source identity validation;
- schema validation;
- input bounds before buffering;
- rate limits;
- secure logging;
- no secret-bearing payload logs;
- audit of source configuration changes;
- rotation/revocation procedure;
- production separation from simulation/demo traffic.

## 20. Audit requirements

Configuration changes must create audit events, including:

- TelemetrySource created/changed/disabled;
- hardware identity changed;
- topic binding changed;
- stale threshold changed;
- metric catalog changed;
- broker/integration configuration changed;
- breaker provisioning changed;
- PowerConnection changed.

High-volume telemetry readings themselves are time-series data and are not individual administrative audit events.

## 21. Observability

Minimum telemetry-platform metrics:

- broker connection state;
- connected publishers when available;
- messages/sec;
- accepted/rejected messages;
- payload size;
- ingestion lag;
- observedAt vs receivedAt delay;
- duplicate/out-of-order counts;
- stale sources;
- latest-store latency;
- time-series write latency/errors;
- fanout subscribers;
- historical query latency;
- queue/backpressure depth where applicable.

## 22. Availability behavior

A temporary failure of the historical store must not cause the web UI to invent values.

The target design must explicitly define what happens when:

- broker is unavailable;
- ingestion worker restarts;
- latest store is unavailable;
- historical store is unavailable;
- browser reconnects;
- a hardware source goes offline.

Where buffering/queueing is enabled, limits and data-loss semantics must be documented.

## 23. Non-goals

This contract does not declare:

- that every holder has a breaker;
- that every breaker has telemetry;
- that every BDFB occupies a full rack;
- that all hardware uses the same publish frequency;
- that InfluxDB/Telegraf is already selected;
- that a browser connects directly to MQTT;
- that power can always be derived from voltage/current;
- that latest in-memory values constitute historical retention.

## 24. Acceptance criteria for the telemetry milestone

The telemetry/time-series milestone is not complete until evidence demonstrates:

- TLS broker connection;
- ACL isolation;
- hardware/source identity mapping;
- malformed/oversized message rejection;
- canonical normalization;
- latest-value persistence/recovery;
- historical persistence;
- current/24h/7d/month query paths;
- aggregation correctness;
- stale-state handling;
- authenticated realtime fanout;
- session revocation behavior;
- load test against agreed source/message targets;
- backup/restore of historical data;
- observability;
- security review;
- operational runbook;
- no production secrets committed.
