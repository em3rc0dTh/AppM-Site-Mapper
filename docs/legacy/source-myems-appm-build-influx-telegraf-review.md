# Legacy MyEMS AppM Build — MQTT, Telegraf and InfluxDB Review

**Source repository:** `em3rc0dTh/myems`  
**Reviewed branch:** `feat/appM-build`  
**Branch head reviewed:** `3bde84c0114e2ad77d6ffbc15b0ccdf66c840a2f`  
**Review date:** 2026-09-24  
**Purpose:** Recover the actual MQTT + Telegraf + InfluxDB architecture used during the AppM/Telxius iteration and distinguish reusable design from implementation drift.

## 1. Correction to the previous branch review

The earlier review of `feat/mqtt-broker-no-encrypt` remains correct for that branch: it does not contain the InfluxDB/Telegraf integration.

However, `feat/appM-build` is 56 commits ahead of that branch and **does** contain both:

- an InfluxDB v2 service;
- a Telegraf service/configuration consuming MQTT and writing to InfluxDB.

Therefore the historical project architecture did include the pipeline remembered by the project owner.

## 2. Historical sequence

### 2.1 MQTT foundation — February 2026

The earlier branch introduced:

- project-controlled Eclipse Mosquitto;
- MQTT authentication;
- Python MQTT gateway;
- test/simulator tooling.

The final state of that earlier branch used unencrypted MQTT on 1883.

### 2.2 Telxius integration — 2026-03-20

Commit:

`805a748026f87c4ec25ac2e994fb186ecbdfb3e4`

Message:

`[Eduardo] add telxius to myems`

added:

- `myems-telxius/`;
- `others/telegraf/telegraf.conf`;
- InfluxDB to `others/docker-compose-on-linux.yml`;
- Telegraf to the same compose;
- Telxius dashboard wiring.

At that point the intended historical path was:

```text
hardware
   |
   | MQTT
   v
myems-mqtt-broker
   |
   +--------------------------+
   |                          |
   | live                     | historical
   v                          v
Telxius dashboard          Telegraf
                              |
                              v
                           InfluxDB
```

### 2.3 AppM EMS evolution — April 2026

The Telxius frontend was subsequently developed and renamed/evolved into `appm-ems`.

Commit:

`689d3d55af3b7b2421f1cb7dfe0afa6a243347bd`

introduced the full AppM EMS version and an AppM-specific compose with:

- MongoDB;
- InfluxDB;
- Mosquitto;
- Next.js AppM application.

The repository therefore ended with **two deployment definitions**:

1. global MyEMS Linux compose with broker + InfluxDB + Telegraf;
2. AppM-specific compose with MongoDB + InfluxDB + Mosquitto, but without a Telegraf service.

That is configuration drift and must not be reproduced in MK1.

## 3. Proven Telegraf pipeline

The committed `others/telegraf/telegraf.conf` contains:

```toml
[[inputs.mqtt_consumer]]
servers = ["tcp://myems-mqtt-broker:1883"]
topics = ["data/dev/#"]
data_format = "json_v2"
```

It authenticates to Mosquitto and parses the nested JSON object at:

```text
reported
```

with every nested key included.

The output is:

```toml
[[outputs.influxdb_v2]]
urls = ["http://influxdb:8086"]
token = "${INFLUX_TOKEN}"
organization = "${INFLUX_ORG}"
bucket = "${INFLUX_BUCKET}"
```

So the committed design is unequivocally:

```text
MQTT -> Telegraf mqtt_consumer -> InfluxDB v2
```

## 4. Original historical query contract

Before the later schema change, `appm-ems/app/api/history/route.ts` queried:

```text
_measurement == "mqtt_consumer"
```

and selected fields whose names ended in the requested electrical metric.

The code comment explicitly states that the measurement was written by Telegraf and that the JSON fields were flattened by `json_v2`.

This version is aligned with the committed Telegraf configuration.

The API also implemented:

- `24h` default range;
- adaptive aggregation;
- 7-day aggregation window;
- 30-day aggregation window;
- server-side Influx query;
- allow-list/regex checks for serial/range/field input to reduce Flux injection risk.

This is useful product/architecture evidence.

## 5. Later historical schema drift

Commit:

`47e3bc6880701347471d94c2bbadf9fcac1eebcf`

Message:

`[Eduardo] add change to influx`

changed the historical API from:

```text
measurement = mqtt_consumer
flattened field names
```

to:

```text
measurement = energy
tags = port, sn, state
fields = U1, I1, P1, ...
```

The code says this was a “nuevo formato limpio de Starlark”.

However, in the reviewed branch:

- `others/telegraf/telegraf.conf` was not updated accordingly;
- no Starlark processor/configuration was found in the committed branch;
- no equivalent canonical transformation artifact appears in the branch comparison.

Therefore the final branch contains an **unproven schema handoff**:

```text
committed Telegraf output schema
             !=
final /api/history expected schema
```

The transformation may have existed in an external deployment artifact, but the repository does not prove it.

MK1 must keep the canonical normalization schema in version control and test producer-to-query compatibility in CI.

## 6. Live telemetry — first generation

The initial `myems-telxius` frontend connected directly from the browser to MQTT WebSockets.

It used:

- a public broker address;
- WebSocket MQTT;
- credentials embedded in client code;
- an ephemeral client ID;
- `clean: true`;
- subscription to `data/dev/#`.

Messages were parsed in the browser and correlated by payload `sn`.

The payload shape expected:

```json
{
  "sn": "...",
  "method": "...",
  "reported": {
    "0_1_1": {
      "U1": 48.0,
      "I1": 5.0,
      "P1": 240.0
    }
  }
}
```

This directly explains the Telegraf `json_v2` parser targeting `reported`.

### Reusable truth

- serial-number correlation existed;
- nested per-port/breaker telemetry existed;
- 24-port operational views existed;
- live data and historical data were separate paths.

### Non-reusable implementation

- broker credentials in browser;
- browser direct MQTT;
- external broker address hard-coded;
- source identity trusted from payload;
- broad subscription;
- no canonical server-side source binding.

## 7. Live telemetry — later AppM generation

The later `appm-ems` implementation moved browser live access behind:

```text
browser EventSource
    ->
Next.js SSE route
    ->
MQTT client
```

This was directionally better because the browser no longer needed direct TCP MQTT access.

However, the implementation created one MQTT client per SSE request and subscribed to both:

```text
data/dev/#
#
```

The wildcard `#` made the narrower subscription redundant and exposed all broker topics to each SSE bridge.

The route also retained hard-coded/default broker credentials and used an ephemeral MQTT client ID.

Therefore the later version fixed the browser protocol boundary but not the broker-consumer architecture.

## 8. Latest-value handling

The later AppM frontend stored current telemetry in React state and backed it up to:

```text
localStorage
```

This gave UI continuity across refreshes on one browser, but it is not a server-side latest-state system.

Consequences:

- different browsers can disagree;
- clearing browser state loses latest values;
- server restart semantics are unrelated;
- there is no authoritative freshness/quality model;
- stale data can appear current unless separately classified.

MK1 must keep latest state outside browser memory/localStorage.

## 9. InfluxDB deployment

InfluxDB v2 was explicitly deployed with:

- setup mode;
- organization;
- telemetry/energy bucket;
- persistent Docker volume;
- admin token used by the application/Telegraf.

This validates InfluxDB as an actually implemented historical-store choice, not merely a design idea.

However, the branch also contains hard-coded/default administrative credentials/tokens in compose examples and uses `influxdb:latest`.

Those legacy credentials/tokens must be treated as compromised test material and must not be reused.

MK1 must use:

- runtime secret provisioning;
- least-privilege tokens;
- separate writer/reader/admin identities;
- pinned versions;
- backup/restore;
- retention policy;
- health/readiness;
- operational metrics.

## 10. Telegraf strengths visible in the old implementation

The old design correctly separated:

```text
broker transport
from
historical persistence
```

Telegraf also provided:

- batching;
- buffering;
- periodic flushing;
- MQTT input abstraction;
- InfluxDB output abstraction;
- a declarative data path.

The committed agent settings included:

- batch size 1000;
- buffer limit 10000;
- 10-second flush interval.

These are useful concepts, but they were not backed by documented loss/backpressure SLOs.

## 11. Telegraf gaps in the old implementation

The committed configuration has several production gaps:

### Transport security

Broker connection:

```text
tcp://...:1883
```

No TLS.

### Credential handling

MQTT credentials are committed directly in `telegraf.conf`.

### Identity

Telegraf consumes a wildcard topic and parses payload values, but it does not establish the Site Mapper trust chain:

```text
authenticated principal
-> topic
-> TelemetrySource
-> canonical breaker/device
```

### Source metadata

The parser focuses on `reported`.

The top-level `sn` is not clearly mapped by the committed config into the canonical Influx schema expected by later queries.

The initial history API attempted to filter by `sn`, but the committed Telegraf configuration does not provide strong evidence that `sn` was stored as an Influx tag.

This is a schema-contract gap.

### Version drift

`telegraf:latest` was used.

### Health/certification

No committed evidence was found for:

- Telegraf health check;
- end-to-end MQTT-to-Influx certification test;
- schema compatibility test;
- replay/deduplication test;
- broker-restart recovery;
- Influx outage buffering behavior;
- loss accounting.

## 12. Mosquitto/AppM compose drift

The AppM-specific `mosquitto.conf` later allowed anonymous access on both:

- MQTT 1883;
- WebSocket 9001.

The AppM-specific compose exposed both ports and also exposed InfluxDB 8086.

This differs from the earlier authenticated broker container.

The final branch therefore does not have one authoritative broker security posture.

MK1 must have exactly one canonical production deployment contract per environment.

## 13. Secret exposure route

The AppM branch contains a server route that returns MQTT URL, username and password to the client.

Even if it was intended to make rotation easier, returning the secret to the browser makes it a browser credential.

That pattern is prohibited in MK1.

Secrets may rotate without rebuild, but they remain server-side.

## 14. Historical architecture reconstructed

The strongest evidence-supported architecture from the prior system is:

```text
Hardware
   |
   | MQTT payload
   | sn + reported[port metrics]
   v
Mosquitto
   |
   +---------------------+
   |                     |
   | realtime            | historical
   v                     v
MQTT consumer         Telegraf
/SSE bridge              |
   |                     | json_v2 flatten
   v                     v
Browser               InfluxDB v2
                         |
                         | Flux query
                         v
                    /api/history
                         |
                         v
                      Browser
```

This architecture explains the previous working product behavior described by the project owner.

## 15. What MK1 should preserve

Preserve:

- MQTT as hardware transport;
- operator-controlled broker;
- separate realtime and historical paths;
- InfluxDB as a serious candidate because it was actually used;
- Telegraf as a serious candidate for canonical-event -> time-series persistence;
- per-port/breaker electrical metrics;
- `sn`/hardware identity as an external mapping attribute;
- 24h / 7d / 30d history;
- adaptive server-side aggregation;
- buffered historical writes;
- durable Influx volume;
- premium live + history UI behavior.

## 16. What MK1 must change

Replace:

```text
browser/direct MQTT
```

with:

```text
dedicated ingestion/realtime services
```

Replace:

```text
payload sn == trusted identity
```

with:

```text
credential + ACL topic -> TelemetrySource -> canonical entity
```

Replace:

```text
raw hardware -> Telegraf
```

with:

```text
raw hardware
-> validated canonical ingestion
-> canonical event
-> Telegraf/time-series writer
```

Replace:

```text
localStorage latest truth
```

with:

```text
server-side durable latest repository
```

Replace:

```text
implicit schema compatibility
```

with:

```text
versioned canonical telemetry schema + contract tests
```

Replace:

```text
shared/static credentials
```

with:

```text
per-source identity + rotation/revocation
```

## 17. Main lesson

The previous system had the right architectural intuition:

```text
MQTT for transport
Telegraf for collection/buffering
InfluxDB for history
separate live UI path
```

The largest problem was not the technology selection.

The largest problem was the absence of a single certified contract across:

- identity;
- broker ACL;
- normalized schema;
- latest state;
- Telegraf schema;
- Influx schema;
- query API;
- deployment manifests;
- secrets;
- failure/recovery behavior.

For MK1 the target is therefore not “replace Influx/Telegraf because they were old”.

The target is:

```text
keep the useful pipeline
+ put a trusted canonical ingestion boundary in front of it
+ make deployment/schema/security evidence enforceable
```
