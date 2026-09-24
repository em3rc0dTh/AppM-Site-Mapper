# Legacy MyEMS MQTT Broker Review

**Source repository:** `em3rc0dTh/myems`  
**Reviewed branch:** `feat/mqtt-broker-no-encrypt`  
**Branch head reviewed:** `9a8550bc3f65118400df7748adfcc4459664c202`  
**Review date:** 2026-09-24  
**Purpose:** Extract useful telemetry architecture lessons for Apana Air Site Mapper without copying legacy implementation debt.

## 1. Scope and source truth

This review is intentionally limited to what the referenced Git branch proves.

The branch is 18 commits ahead of `master`. Its MQTT-related additions include:

- `myems-mqtt-broker/`
- `myems-mqtt/`
- Docker Compose wiring in `others/docker-compose-on-linux.yml` and Windows equivalent.

The reviewed branch **does not contain InfluxDB or Telegraf configuration/code** and GitHub code search for that repository does not surface InfluxDB/Telegraf references.

Therefore:

- prior project/deployment experience may indeed have included InfluxDB + Telegraf;
- this specific branch does not prove or reproduce that part of the deployment;
- no Site Mapper decision should claim that this branch persisted MQTT data to InfluxDB through Telegraf.

The branch itself proves Mosquitto + Python MQTT gateway + MySQL integration.

## 2. Proven legacy data flow

The branch implements this flow:

```text
MQTT publisher / simulated hardware
        |
        | MQTT
        v
Eclipse Mosquitto container
        |
        | subscription
        v
myems-mqtt Python gateway
        |
        | JSON decode
        | data_source_id/device_id
        | point_id
        | value
        v
MySQL system database
tbl_points_values
```

Separately, the inherited MyEMS stack contains a more mature Modbus/historical pipeline:

```text
Modbus acquisition
        |
        +--> system DB for configuration
        |
        +--> historical DB
             tbl_analog_value
             tbl_analog_value_latest
             energy/digital equivalents
                    |
                    +--> cleaning
                    +--> normalization
                    +--> hourly aggregation
                    +--> energy DB
```

The MQTT handler in this branch did not mirror that historical path.

## 3. Broker implementation

### Container

`myems-mqtt-broker/Dockerfile` builds from `eclipse-mosquitto:latest`.

It creates:

- Mosquitto config;
- data directory;
- log directory;
- certificate directory;
- custom entrypoint.

### Persistence

Mosquitto persistence is enabled:

```text
persistence true
persistence_location /mosquitto/data/
```

Docker Compose binds the data and log directories to the host.

This is useful and should be preserved conceptually, but production must also define:

- durability expectations;
- backup/restore;
- disk-full behavior;
- corruption/recovery procedure;
- host-loss semantics;
- retention of queued messages.

### Authentication

Anonymous access is disabled and a password file is used.

This was better than an anonymous broker, but no topic ACL is configured in the reviewed `mosquitto.conf`.

Consequence: an authenticated client is not restricted by this configuration to only its intended publish/subscribe namespace.

### TLS history

Commit `36338067825da3122f1e34c9dcffc43356a18124` originally introduced a TLS listener on 8883 with a project-generated CA and server certificate.

Commit `9a8550bc3f65118400df7748adfcc4459664c202` explicitly changed the listener from TLS/8883 to unencrypted MQTT/1883.

The final reviewed branch therefore sends MQTT username/password and payload traffic without transport encryption when traffic leaves a trusted loopback/network boundary.

### Certificate generation

The entrypoint generates a long-lived private CA and broker certificate inside the mounted Mosquitto configuration directory when missing.

This is acceptable as development bootstrap evidence but is not a production PKI lifecycle.

Missing production controls include:

- external secret/certificate provisioning;
- certificate expiry monitoring;
- rotation;
- revocation;
- hostname/SAN policy;
- private-key backup/access policy;
- environment separation.

### Credentials

The branch contains default/shared/test credentials and test broker credentials in source-controlled scripts/examples.

Those values must be treated as compromised legacy test material and must never be copied into Site Mapper.

No legacy credential is an acceptable Site Mapper production credential.

## 4. MQTT gateway behavior

`myems-mqtt/gateway.py` uses Paho MQTT with MQTT v5.

A new client ID is generated from the current epoch time.

On connect, it subscribes to every configured topic.

Default topic configuration includes:

```text
myems/+/data
myems/+/ack
myems/#
```

The final wildcard makes the two narrower subscriptions redundant and broadens the consumer to the entire `myems` hierarchy.

### QoS

The gateway invokes `client.subscribe(topic)` without supplying a QoS.

Paho's default subscription QoS is 0.

Therefore even when a publisher sends at QoS 1/2, the gateway subscription can receive at effective QoS 0.

That permits message loss during disconnects and provides no persistent-session recovery contract.

### Session identity

The gateway creates a time-derived client ID for each run rather than a stable service identity.

This prevents using the client ID as a durable subscription/session identity.

### Reconnect

The gateway retries the initial connection every ten seconds and relies on Paho auto-reconnect after connection loss.

Useful intent, but the branch lacks a documented reconnect SLO, jitter/backoff policy, persistent-session contract and backpressure behavior.

## 5. Payload processing

`myems-mqtt/acquisition.py`:

1. decodes UTF-8;
2. parses JSON;
3. accepts `data_source_id` or `device_id`;
4. reads `point_id`;
5. reads `value`;
6. writes a row to MySQL.

### Identity trust gap

The handler derives source identity from payload fields.

The MQTT authenticated principal and topic are not used as authoritative source identity.

Therefore an authenticated publisher with sufficient broker access could claim another `device_id`, `data_source_id` or `point_id` in the payload.

This is incompatible with the Site Mapper trust model.

### Topic-binding gap

There is no enforced relationship such as:

```text
authenticated MQTT client
    -> allowed topic
    -> TelemetrySource
    -> canonical Site Mapper entity/component
```

Site Mapper must enforce that chain.

### Schema gap

Only three payload fields are checked for presence.

Missing controls include:

- schema version;
- message ID;
- sequence;
- type validation;
- numeric bounds;
- metric catalog;
- units;
- observed timestamp;
- source timestamp trust policy;
- payload cardinality;
- payload byte limit at application boundary;
- duplicate handling;
- replay handling;
- out-of-order handling;
- unknown metric handling.

### Time semantics

The simulator includes an `utc_date_time`, but the MQTT acquisition handler ignores it and inserts `UTC_TIMESTAMP()`.

This loses the distinction between:

- time the hardware observed the measurement;
- time the platform received the message.

Site Mapper must preserve `observedAt` and `receivedAt` separately.

## 6. Persistence behavior

The MQTT handler opens a new MySQL connection for every message, inserts one row, commits, closes cursor and closes connection.

Risks:

- connection churn;
- poor throughput;
- unbounded latency inside MQTT callback;
- broker/client backpressure not defined;
- database outage blocks callback handling;
- no batching;
- no durable application spool;
- no idempotency key;
- no atomic latest/history update contract.

### Historical integration gap

The MQTT handler writes `tbl_points_values` in the system DB.

The inherited Modbus implementation instead writes raw measurements to the historical DB and maintains dedicated latest tables.

The normalization and aggregation services read from the historical DB.

Therefore this reviewed MQTT path is not proven to participate correctly in the full historical cleaning/normalization/aggregation pipeline.

## 7. Simulator/test inconsistencies

The simulator publishes to a bare hardware-like topic while the gateway defaults to `myems/#`.

Without an environment override these do not form one internally consistent default integration.

The simulator publishes with QoS 2, but the gateway subscription defaults to QoS 0.

The test scripts also contain public test broker credentials and broad publish/subscribe behavior.

These files are useful as experiments, not as a certification suite.

## 8. Authorization gap

The broker has authentication but no reviewed ACL policy.

There is no demonstrated rule equivalent to:

```text
breaker-001 may publish only:
apana/v1/telemetry-source/TS-001/raw

breaker-001 may not:
- subscribe to other device telemetry
- publish as TS-002
- read internal normalized topics
- publish broker control topics
```

This becomes mandatory for Site Mapper.

## 9. Resource-protection gap

The reviewed broker config does not define an explicit production policy for:

- maximum packet size;
- maximum inflight messages;
- maximum queued messages;
- maximum connections;
- per-client message rate;
- connection rate;
- topic depth/cardinality;
- client ID policy.

The application handler also has no explicit JSON/body cardinality or metric-count limit.

## 10. Operational gap

The branch has logs and container restart policies, but no evidence of:

- health/readiness checks for broker + gateway;
- metrics/Prometheus export;
- alert thresholds;
- broker connection dashboards;
- invalid-message counters;
- ingestion lag;
- stale source detection;
- disk capacity alerting;
- backup/restore drill;
- certificate expiry alert;
- credential rotation runbook;
- broker ACL regression test;
- load test;
- chaos/restart recovery test.

## 11. What is worth preserving

The following ideas remain useful:

- project-controlled broker;
- Mosquitto as a candidate broker;
- no anonymous production access;
- broker persistence;
- dedicated acquisition process separate from the UI;
- environment-based configuration;
- MQTT v5 client support;
- reconnect behavior;
- dedicated historical processing concept;
- data cleaning and aggregation as explicit responsibilities;
- simulation tooling.

## 12. What must not be copied

Do not copy these legacy behaviors into Site Mapper:

- unencrypted production listener;
- `latest` container image tags;
- shared/default credentials;
- credentials committed in examples/tests;
- no topic ACL;
- wildcard `#` consumer without explicit reason;
- payload-declared source identity as authoritative identity;
- QoS 0 implicit subscription;
- ephemeral gateway client ID;
- connection-per-message database writes;
- direct raw payload persistence without canonical validation;
- lost source timestamp;
- no idempotency/deduplication;
- no bounded resource policy;
- no certified historical path;
- no audit/observability contract.

## 13. Relevance to Site Mapper

This legacy branch validates the **business/operational idea** of owning the MQTT ingestion path.

It does not provide a production-ready telemetry architecture to transplant.

For Site Mapper the correct reuse is:

```text
reuse the concept
reject the accidental implementation
prove every trust boundary
```
