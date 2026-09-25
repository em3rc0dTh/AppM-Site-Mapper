# Telemetry Hardening Blueprint

**Product:** Apana Air Site Mapper  
**Status:** Proposed architecture for G16  
**Goal:** Preserve the useful MQTT + time-series model while reducing security, integrity, delivery and operational gaps as close to zero as practical.

## 1. Principle

The legacy system proved that MQTT is a good transport for the hardware use case.

The new system must not equate:

- MQTT with persistence;
- a broker login with source authorization;
- a payload `device_id` with trusted identity;
- QoS with end-to-end exactly-once storage;
- latest process memory with operational state;
- Telegraf with domain validation;
- InfluxDB with the Site Mapper domain model.

The design therefore has separate trust boundaries.

## 2. Reference architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Hardware                                                    │
│ telemetry-capable breakers / devices                        │
│                                                             │
│ unique source credential                                    │
│ QoS 1                                                       │
│ explicit source topic                                       │
│ LWT / heartbeat                                             │
└──────────────────────────┬──────────────────────────────────┘
                           │ MQTT over TLS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Project-controlled MQTT Broker                              │
│                                                             │
│ TLS only externally                                         │
│ anonymous disabled                                          │
│ unique clients/credentials                                  │
│ deny-by-default ACL                                         │
│ packet / queue / connection limits                          │
│ persistence                                                 │
│ observability                                               │
└──────────────────────────┬──────────────────────────────────┘
                           │ raw/source namespace
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Site Mapper Telemetry Ingestion Worker                      │
│                                                             │
│ stable service identity + persistent MQTT session           │
│ bind MQTT principal/topic -> TelemetrySource                 │
│ payload/schema validation                                   │
│ timestamp + sequence policy                                 │
│ metric/unit catalog                                         │
│ range/cardinality/resource limits                           │
│ dedupe / replay / ordering policy                           │
│ quality classification                                      │
│ canonical normalization                                     │
└───────────────┬───────────────────────────────┬─────────────┘
                │                               │
                │ latest durable upsert         │ canonical event
                ▼                               ▼
┌───────────────────────────────┐   ┌─────────────────────────┐
│ Latest Telemetry Repository   │   │ Internal MQTT namespace │
│ persistent                    │   │ service-only ACL        │
│ source + metric unique        │   │ normalized only         │
│ observedAt / receivedAt       │   └────────────┬────────────┘
│ quality / age                 │                │
└──────────────┬────────────────┘        ┌───────┴────────────┐
               │                         │                    │
               │                         ▼                    ▼
               │               ┌──────────────────┐  ┌─────────────────┐
               │               │ Historical sink  │  │ Realtime fanout │
               │               │                  │  │ service         │
               │               │ Telegraf or      │  │                 │
               │               │ app writer       │  │ one shared      │
               │               └────────┬─────────┘  │ subscription    │
               │                        │            │ per process     │
               │                        ▼            └────────┬────────┘
               │               ┌──────────────────┐           │
               │               │ Time-Series DB   │           │ SSE
               │               │ raw + rollups    │           ▼
               │               └────────┬─────────┘  ┌─────────────────┐
               │                        │            │ Authenticated UI│
               └────────────────────────┴───────────►│ + query API     │
                                                    └─────────────────┘
```

## 3. Broker posture

### Production listener

Externally reachable MQTT must use TLS.

Plaintext port 1883 is not a production hardware listener.

If an internal plaintext listener is ever retained for an isolated container-only path, it must be:

- unreachable from outside the private network namespace;
- explicitly documented;
- justified by threat model;
- prohibited for credentials that leave the host boundary.

### Authentication

Preferred order:

1. mutual TLS per hardware client when device capability and certificate operations permit;
2. otherwise unique high-entropy username/password per TelemetrySource;
3. never one shared fleet credential.

Credentials must be provisioned outside Git.

### Authorization

Authorization is deny by default.

A hardware source can publish only to its own source namespace.

Example logical pattern:

```text
apana/v1/source/{sourceId}/telemetry
apana/v1/source/{sourceId}/status
```

Hardware does not receive wildcard read access.

Hardware may not publish into the internal normalized namespace.

Service accounts get separate roles.

Mosquitto Dynamic Security or an equivalent audited ACL mechanism is preferred over a single shared password file because clients/roles/ACLs need independent lifecycle and revocation.

### Broker control plane

Administrative/control topics are restricted to a dedicated broker-admin principal.

The Site Mapper web application does not receive broker-admin rights.

### Image/version policy

Container images use an explicitly pinned tested version or immutable digest.

`latest` is forbidden in production manifests.

## 4. Device/source identity

Source identity is not trusted from the JSON body.

The authoritative chain is:

```text
TLS/client credential
    -> authenticated MQTT principal
    -> authorized topic
    -> TelemetrySource
    -> canonical Site Mapper component/entity
```

The payload may repeat `sourceId`, but if it conflicts with the authenticated/topic binding, the message is rejected and security telemetry is emitted.

## 5. Topic design

The topic tree should carry routing identity, not arbitrary domain state.

Recommended categories:

```text
apana/v1/source/{sourceId}/telemetry
apana/v1/source/{sourceId}/status

apana-internal/v1/telemetry/{sourceId}
apana-internal/v1/rejected/{sourceId}
```

No hardware principal can access `apana-internal/#`.

The browser never receives MQTT credentials and does not connect to either namespace.

## 6. QoS and delivery semantics

### Hardware -> broker

Default target: QoS 1.

Rationale:

- QoS 0 is insufficient for the required operational history;
- QoS 2 adds protocol complexity but still does not create end-to-end exactly-once persistence in the time-series database;
- QoS 1 plus idempotency is easier to reason about and test.

A different QoS requires an ADR backed by hardware behavior tests.

### Persistent sessions

Critical consumers use:

- stable client IDs;
- persistent sessions;
- QoS 1 subscription;
- bounded broker queues.

Ephemeral time-based client IDs are prohibited for durable ingestion consumers.

### Idempotency

Every source should provide one of:

- message ID;
- monotonic sequence;
- both.

If hardware cannot provide either, the ingestion layer defines a documented bounded deduplication strategy.

Duplicate delivery is expected and safe.

The persistence layer must be idempotent where a stable event identity exists.

### Exactly-once statement

MQTT QoS 2 means exactly-once delivery at the MQTT protocol hop, not exactly-once business persistence.

Site Mapper must never advertise end-to-end exactly-once unless a persistence-level proof exists.

## 7. Offline behavior

Connected hardware should support:

- Last Will and Testament for unexpected disconnect;
- retained online/offline status where appropriate;
- heartbeat/cadence expectations;
- source-specific stale threshold.

The UI derives:

- `VALID`;
- `LAST_KNOWN`;
- `STALE`;
- `UNAVAILABLE`

from explicit timestamps/health rules, not from whether a browser currently receives events.

## 8. Ingestion worker

The ingestion worker is the application trust boundary.

It performs, in order:

1. receive bounded packet;
2. resolve authenticated source;
3. verify topic/source binding;
4. decode payload;
5. validate schema version;
6. validate message ID/sequence;
7. validate source timestamp;
8. validate metric keys;
9. validate numeric types;
10. validate units;
11. validate value bounds where approved;
12. normalize;
13. classify quality;
14. enforce dedup/order policy;
15. update latest durable state;
16. hand canonical event to historical path;
17. emit observability counters.

Malformed input never reaches trusted domain/history tables unchanged.

## 9. Payload bounds

Limits must exist at multiple layers:

- broker packet limit;
- ingestion payload-byte limit;
- maximum metrics/message;
- maximum string length;
- maximum topic length/depth;
- numeric range/precision;
- maximum accepted future/past timestamp skew.

Values are chosen from representative hardware payloads and load testing.

No unbounded JSON structure is accepted.

## 10. Canonical event

Canonical event identity is independent of vendor payload format.

Minimum model:

```text
schemaVersion
messageId?
sourceId
entityId/componentId
observedAt
receivedAt
sequence?
metrics[]
quality
ingestionVersion
```

Each metric has:

```text
key
value
unit
quality
derivation?   # RAW or documented CALCULATED
```

## 11. Latest state

Latest values must survive:

- browser reload;
- web process restart;
- horizontal web scaling.

The repository key is conceptually:

```text
(sourceId, metricKey)
```

with:

- value;
- unit;
- observedAt;
- receivedAt;
- quality;
- sequence/message ID.

### Initial MK1 storage choice

Using the existing transactional datastore for a small persistent latest-value collection is acceptable if latency/load tests pass.

A separate Redis-like cache should be added only when measured fanout/read scale or multi-instance coordination requires it.

This avoids adding infrastructure without evidence.

## 12. Historical path

The historical sink receives **canonical normalized events**, never arbitrary device JSON.

### If Telegraf is selected

Telegraf is placed after the validation boundary.

Preferred pattern:

```text
validated canonical internal MQTT
        ->
Telegraf mqtt_consumer
        ->
time-series datastore
```

Use:

- TLS for broker connection where network boundary requires it;
- stable Telegraf client ID;
- QoS 1;
- persistent session;
- bounded `max_undelivered_messages`;
- output batching;
- explicit output retry/buffer behavior;
- secrets from runtime secret store.

Telegraf's MQTT consumer supports persistent sessions for QoS 1/2 and tracking undelivered messages until outputs accept them. That is useful for reducing data-loss gaps.

Telegraf is **not** responsible for:

- domain authorization;
- canonical entity lookup;
- breaker-to-device semantics;
- metric business rules;
- Site Mapper audit decisions.

### If Telegraf is not selected

The ingestion/historical writer must provide equivalent:

- batching;
- retry;
- bounded buffer;
- backpressure;
- idempotency;
- failure metrics.

## 13. Time-series datastore

InfluxDB remains a valid candidate because the workload is naturally time-series and the team has prior operating experience.

It is not automatically selected.

The G16 benchmark must compare at least the chosen InfluxDB deployment model against one practical alternative using:

- writes/sec at expected and peak load;
- 24h/7d/30d/custom query latency;
- aggregation/downsampling;
- retention;
- backup/restore;
- HA/failure recovery;
- authentication/authorization;
- operational complexity;
- storage growth;
- export/migration path;
- cost.

The Site Mapper API remains vendor-neutral.

## 14. Historical schema/cardinality

Avoid uncontrolled high-cardinality tags.

Stable dimensions may include:

- source ID;
- site ID if needed;
- metric key;
- hardware model/version where analytically useful.

Do not create uncontrolled tag dimensions from:

- arbitrary labels;
- human descriptions;
- raw payload keys;
- request IDs;
- message IDs.

Message ID/sequence can be fields/columns used for integrity rather than query dimensions.

## 15. Raw and rollup retention

Retention is policy, not a hard-coded constant.

A likely model is:

- fine raw points: shorter retention;
- minute/hour rollups: longer retention;
- daily/monthly analytical rollups: long retention where required.

Exact periods require business/storage evidence.

No retention period is declared production-ready before backup/restore and capacity tests.

## 16. Realtime browser path

Browser realtime remains server mediated.

SSE is appropriate while the flow is primarily server -> browser.

Rules:

- user session authorization at connect;
- scope authorization for requested assets;
- session expiry/revocation handling;
- heartbeat;
- reconnect;
- bounded subscribers;
- idempotent cleanup;
- latest-state recovery after reconnect.

The web process may have one shared internal telemetry subscription per process.

There is never one MQTT connection per browser SSE connection.

## 17. Audit

Administrative changes generate audit events:

- TelemetrySource create/update/disable;
- hardware principal binding;
- credential rotation/revocation;
- topic ACL changes;
- metric catalog changes;
- stale threshold changes;
- integration/broker configuration changes;
- breaker provisioning/PowerConnection changes.

High-volume telemetry readings remain time-series data, not one audit event per reading.

## 18. Observability

Required broker/ingestion metrics:

- connected sources;
- connection attempts/rejections;
- auth failures;
- ACL denials;
- messages/sec;
- bytes/sec;
- accepted/rejected messages;
- invalid schema;
- unknown source;
- source/topic mismatch;
- duplicate/out-of-order count;
- ingestion lag;
- stale sources;
- queue depth;
- broker persistence/disk usage;
- historical output failures;
- latest write latency;
- historical write latency;
- realtime subscribers;
- SSE disconnect/reconnect rates.

Critical conditions create alerts.

## 19. Security logging

Never log:

- passwords;
- tokens;
- private keys;
- full authorization headers;
- raw secrets.

Rejected telemetry logs use bounded/sanitized metadata.

Raw payload logging is disabled in production by default.

## 20. Secrets and certificate lifecycle

Production provisioning includes:

- source credential issue;
- source credential rotation;
- source disable/revoke;
- broker service credential rotation;
- CA/server certificate rotation;
- emergency revocation;
- expiry monitoring.

No credential lifecycle may require source-code modification.

## 21. Durability boundaries

The project must define the tolerated loss budget.

Minimum target:

- no silent loss caused by a routine web restart;
- no silent loss caused by a routine ingestion-worker restart when MQTT persistent-session conditions are met;
- no duplicate corruption;
- gaps are observable;
- outage recovery is tested.

If the business requires survival of complete broker-host destruction with zero unacknowledged hardware data loss, hardware-side buffering or an additional durable event-log layer becomes necessary.

The system cannot claim zero telemetry loss if the source hardware itself cannot replay data that never reached the broker.

## 22. Failure matrix

Every production certification tests:

- hardware temporarily offline;
- network interruption;
- wrong credential;
- revoked credential;
- wrong topic;
- oversized packet;
- malformed JSON;
- unsupported schema;
- duplicate message;
- out-of-order sequence;
- future timestamp;
- broker restart;
- ingestion restart;
- latest repository outage;
- historical store outage;
- Telegraf restart if used;
- full web restart;
- session revocation during SSE;
- disk nearly full;
- certificate expiration simulation/rotation;
- secret rotation.

## 23. CI/security tests

Automated tests include:

- ACL matrix;
- anonymous rejection;
- cross-source spoof rejection;
- topic/source mismatch;
- QoS/persistent-session recovery;
- duplicate idempotency;
- payload bounds;
- schema fuzzing;
- timestamp bounds;
- metric/unit mismatch;
- stale transition;
- reconnect;
- historical retry;
- latest/history consistency;
- authorization of historical queries;
- no secrets in repository;
- dependency/security scan.

## 24. Gap register

Every remaining production risk receives:

- ID;
- description;
- severity;
- affected component;
- exploit/failure condition;
- mitigation;
- residual risk;
- owner;
- evidence;
- acceptance/closure date.

"Known and acceptable" is allowed.

"Unknown and undocumented" is not.

## 25. G16 exit criteria

G16 cannot pass on architecture diagrams alone.

Required evidence:

- broker configured with TLS;
- deny-by-default ACL proof;
- per-source identity proof;
- no shared fleet credential;
- canonical source binding;
- QoS/persistent-session recovery test;
- malformed/oversized payload rejection;
- cross-source spoof test;
- dedup/order test;
- persistent latest-state test;
- historical write/retry test;
- 24h/7d/30d query test;
- stale/offline test;
- browser SSE reconnect/revocation test;
- broker/worker restart test;
- backup/restore test;
- credential rotation test;
- certificate rotation procedure;
- measured load test;
- observability dashboard/alerts;
- security review;
- runbook;
- release receipt tied to exact commit and environment.
