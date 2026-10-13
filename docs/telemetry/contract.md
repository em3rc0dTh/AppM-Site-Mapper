# Telemetry Contract

**Gate:** G10 extension  
**Status:** Accepted — independent Equipment identity and BFDB point projections (2026-10-12)

## Product boundary

AppM Site Mapper is the visual and ordered application surface for telemetry obtained through the configured MQTT data provider.

The data provider is replaceable. Today it may be the BFDB emulator/broker environment; later the broker URL, credentials or provider infrastructure may change without moving emulator logic into this repository.

AppM does **not** clone or own:

- the BFDB field emulator;
- the BFDB Telemetry Gateway Modbus server;
- the broker lifecycle;
- Metasys commissioning logic.

AppM consumes MQTT.

## Flow

```text
BFDB emulator / future provider
→ MQTT broker
→ AppM server-side native MQTT adapter
→ topic + payload validation
→ source identity resolution
→ BFDB breaker binding
├→ accepted electrical patch → Site Mapper history writer → TimescaleDB
└→ in-process Latest State → authenticated SSE → AppM interface
```

The browser never receives MQTT credentials and never connects directly to the broker.

TimescaleDB is part of the Site Mapper persistence boundary. It is not owned by the emulator or BFDB gateway repository. The field source may disappear or be replaced without changing Site Mapper historical ownership.

## BFDB wire envelope

The BFDB profile accepts the gateway/emulator envelope:

```text
topic: data/dev/<serial>
```

```json
{
  "msgid": "2289",
  "method": "update",
  "sn": "EMU-BFDB-01",
  "timestamp": 1790580000,
  "sendtime": 1790580001,
  "version": 1,
  "reported": {
    "0_1_1": {
      "state": "ONLINE",
      "U1": "13.82",
      "I1": "3.46",
      "P1": "47.83",
      "EP1": "0.5074"
    }
  }
}
```

Rules:

- `method` must be `update`;
- topic serial and payload `sn` must match;
- malformed timestamps are rejected;
- source observed time, source send time and AppM receive time remain distinct;
- raw payload state remains inspectable;
- V/I/P/E are normalized only when present.

## MongoDB remains the ordered application structure

Existing MongoDB topology remains authoritative for AppM structure:

```text
Device(BDFB)
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

MQTT does not create or rename that hierarchy.

The source identity resolves to an ACTIVE Device/Equipment either by:

1. matching MQTT serial to the stored `serialNumber`; or
2. `MQTT_SOURCE_DEVICE_MAP`, mapping an external source serial to an AppM Device ID.

Example:

```text
MQTT_SOURCE_DEVICE_MAP={"EMU-BFDB-01":"<device-id>"}
```

This is useful when local MongoDB contains a stable customer/device identity while the emulator uses `EMU-BFDB-01`.

## Breaker binding

MQTT raw point identity is a binding, not the breaker primary identity.

Only explicit, active `TelemetryBinding` records are authoritative: source identity, raw point ID, target Equipment ID and metric. Physical panel order, a free-form `rawPointId` attribute or `BFDB_TELEMETRY_BINDING_MODE=panel-order-24` do not certify a mapping. Unmapped points remain visible as unmapped; they never become invented breaker readings.

## Latest State and partial MQTT updates

The BFDB source may rotate batches and may send partial point updates.

AppM merges Latest State by breaker and metric.

Therefore:

```text
missing field != zero
missing field = not updated
explicit "0.00" = real zero
```

A state-only patch does not erase the last accepted V/I/P/E values.

Each normalized electrical metric retains the source observation time from the MQTT envelope.

The raw `reported` object is also merged per point so rotating 24-point batches accumulate into the current source state instead of replacing previous panels.


## Historical telemetry persistence

Historical electrical telemetry is durable Site Mapper data.

The accepted normalized MQTT patch is persisted before Latest State carry-forward can alter its meaning.

Therefore:

```text
accepted MQTT patch
├→ TimescaleDB historical sample
└→ Latest State merge
```

Only metrics present in the accepted patch are written historically.

A state-only patch does not create an electrical history row. A missing V/I/P/E value never causes the previous Latest State value to be copied into a new historical sample.

The canonical local table is `telemetry_samples`, keyed operationally by source identity, AppM device/breaker identity, raw point identity and observation time.

Historical UI/query windows are:

```text
24h
7d
15d
1M
```

Panel history includes only BREAKER bindings that belong to that panel. Whole-BDFB history includes all configured BREAKER bindings. HOLDER endpoints are excluded.

The query path is owned by Site Mapper:

```text
AppM history API
→ Site Mapper telemetry-store adapter
→ Site Mapper TimescaleDB
```

It does not query a gateway/emulator-owned database.

## Browser realtime transport

`GET /api/telemetry/stream`:

- requires `telemetry:read`;
- emits an initial Latest State snapshot;
- emits merged `telemetry` SSE events;
- sends heartbeat comments every 15 seconds;
- rejects additional streams above `TELEMETRY_MAX_STREAMS`.

The BDFB chassis consumes this authenticated stream and presents MQTT values on the already-existing breakers.

## MQTT transport

The native server adapter supports `mqtt://` and `mqtts://` using Node TCP/TLS.

It performs CONNECT, SUBSCRIBE, PING and PUBLISH parsing, acknowledges QoS 1 messages and reconnects with bounded exponential backoff.

Changing providers should normally require changing runtime configuration:

```text
MQTT_BROKER_URL
MQTT_USERNAME
MQTT_PASSWORD
MQTT_TOPIC_PREFIX
MQTT_TOPIC_FILTER
```

rather than changing the BDFB UI or copying provider code into AppM.

## Secrets

Broker URL and credentials exist only as runtime environment values.

Never expose them to browser code or commit them.

## Development ingestion

`POST /api/telemetry/ingest` exists only outside production and requires `settings:write`.

It exercises the same normalization, source mapping, BFDB binding and Latest State path as a real MQTT message.

## Current truth boundary

This integration certifies the AppM MQTT-consumer path and breaker presentation contract.

It does not claim:

- real AMC/AWT physical identity has been commissioned;
- a production MQTT endpoint has been approved;
- Metasys has been commissioned;
- AppM implements the Modbus server from `bfdb-telemetry-gateway`;
- the field emulator is a production dependency;
- the BFDB gateway owns Site Mapper historical telemetry.


## Independent Equipment telemetry — current rule

[ADR-017](../adr/ADR-017-independent-equipment-telemetry.md) is authoritative for independent identities, source authentication, transition and aggregation. Every active Equipment can own a source, including a nested module or breaker. Matching a unique SN binds to that exact Equipment, not its owning Device. Own measurements and explicit gateway point measurements are available through the reusable inspector.

`GET /api/telemetry/entity` provides authenticated exact-target LIVE/history. `telemetry_entity_samples` stores generic patches with original target and source identity; existing `telemetry_samples` remains the BDFB electrical projection. History does not infer attribution from the current serial number. BDFB aggregates explicitly select canonical breaker readings across source Equipment while retaining per-reading provenance.


## Telemetry on every breaker bar (2026-10-12)

In the BDFB chassis, opening a panel renders a separate LIVE status and four values
(V, A, W and kWh) **inside each existing Circuit Breaker bar**. Selecting the
breaker opens its per-breaker inspector with the same exact source identity,
raw point (when applicable), timestamp and available metrics. The whole-BDFB
average remains a separate aggregate and never replaces an individual reading.

The display accepts exactly two proven attribution paths:

1. **Explicit BFDB gateway binding:** a canonical Breaker Equipment ID has
   active source identity + raw point + metric bindings. The BDFB projection
   attaches the resulting measurement to that breaker only.
2. **Independent Equipment SOURCE:** the breaker itself owns a verified
   Equipment target binding (for example through its unique serial number)
   and reports canonical scalar fields `voltageV`, `currentA`, `powerW`,
   `energyKwh`. Reported units must agree with V/A/W/kWh.

A raw panel payload such as `0_1_1`, `0_1_2` **does not** prove which
physical breaker owns each point. There is no automatic panel-order
assignment and no copying of the panel payload to its children.
Explicit commissioning/bindings remain required if the publisher reports
the whole panel and its individual breakers do not have their own source.

Metric values are only labeled LIVE while fresh (30 seconds).
An explicitly mapped breaker without a fresh accepted measurement shows
`MAPPED · NO LIVE READING`. An unbound breaker shows
`UNMAPPED · NO BREAKER BINDING` and four placeholders.
An empty Holder position is not treated as a breaker and never shows readings.
Source serial, raw point and last packet time remain visible on the bar.

This UI change does not create missing persisted bindings, import a new
source or certify the physical correspondence of points in the field.


## Equipment Composition breaker readouts (2026-10-12)

The canonical Equipment page at `/device/<panel-equipment-id>` now uses the
same authenticated Latest State transport as the BDFB chassis. Every installed
CIRCUIT_BREAKER occupying a positional slot displays a compact readout with
Voltage (V), Current (A), Power (W), Energy (kWh), data freshness, MQTT publisher
identity, raw point where applicable, and receive timestamp. A free/empty
position remains a pure capacity slot, with no invented metrics.

This is deliberately **not** an automatic 24P point allocator. The parent Panel
having serial `EMU-BFDB-03` only authenticates/resolves the Panel source.
To show `0_1_1` on its existing child Circuit Breaker, create explicit ACTIVE
MQTT TelemetryBindings for that breaker Equipment ID, source serial, raw point
ID and each supported electrical metric. Alternatively the breaker itself can
publish canonical scalar telemetry from an independently bound SOURCE SN.
The server supplies active breaker bindings to the client only for users with
`telemetry:read`, and the UI rejects raw parent readings as attribution
evidence.

With an explicit binding but no usable sample, the bar says `NO DATA`.
Without a binding, it says `UNMAPPED`. Data between 30 seconds and 5
minutes old says `STALE`; older data says `OFFLINE`. Incompatible metric
units are ignored, and multiple competing sources produce `CONFLICT`.
Historical data, Device power paths and Mongo Equipment topology are
unchanged. No data migration is required.

## Incident: Panel LIVE but child Circuit Breaker NO DATA (2026-10-13)

Observed in Equipment Composition: the panel Equipment publishes MQTT source
`EMU-BFDB-03` with raw `0_1_1` values (U1/I1/P1/EP1), while its occupied
Circuit Breaker slot shows `MQTT · NO DATA`.

The original fanout assumed that a BDFB power-path presentation exists and
includes that breaker. Its `breakerView` requires an active `POWER OUTPUT`
AccessPort. Thus a physical inventory breaker could have a verified telemetry
point mapping but still fail to receive its own projected sample before its
electrical wiring was commissioned. Recognizing the parent SN does not
authenticate an individual circuit-to-breaker relationship.

The accepted BFDB ingest path now **also** derives a canonical individual
Equipment patch for an ACTIVE, physically valid CIRCUIT_BREAKER with an
explicit and unambiguous `TelemetryBinding` tuple:
`MQTT / sourceIdentity / sourcePointId / EQUIPMENT / breakerId / metric`.
The Equipment must belong to the source's owning Device; its ancestor chain
must remain valid. The parent still retains its original raw payload;
the child patch contains only its bound scalar metrics and its own target ID.
This path does not require an AccessPort or a BDFB electrical-path projection.
Competing targets, duplicate metric claims and breakers owning an independent
SOURCE binding are excluded. Existing history writes retain their original
source, target, raw point, and timestamps. No automatic positional inference
has been introduced.

For the observed values, when the physical relationship is **verified** and
the four bindings target the actual installed breaker ID, the child patch
contains `voltageV=13.78 V`, `currentA=1.93 A`, `powerW=26.64 W` and
`energyKwh=0.2795 kWh`. Values are an observed example, not defaults.

If the breaker still shows NO DATA after updating, the bar displays the
expected source/point (or independent SN). A missing, stale, wrong-target or
wrong-source binding must be corrected at the inventory/telemetry binding
level; a panel SN alone never assigns `0_1_1` to position 01.
To diagnose using the authenticated application, inspect:
`GET /api/telemetry/entity?targetId=<breakerEquipmentId>&window=LIVE`,
and `GET /api/telemetry/diagnostics`. Verify the source's accepted packets
and the broker ACL separately.

This change is additive. No topology changes, schema migrations, fabricated
power paths or implicit binding reassignments are performed.

## Equipment MQTT point prefix commissioning

For an Equipment with `childMode=POSITIONAL`, the operator may declare
`telemetryPointPrefix` when the Equipment is created or later through
**Configure Equipment**. Example: `0_2` on a 24-position Panel describes
candidate external point labels `0_2_1` ... `0_2_24`. A 22-slot or 48-slot
Equipment may use its own independent prefix. Prefix is not derived from
the Equipment's position among siblings and is never forced to `0_1`.

- `telemetryPointPrefix` is optional; existing Equipment remain valid.
- The field is stored on the canonical Equipment in MongoDB and returned by
  existing Topology GET endpoints. It is not a Warehouse template default.
- Create routes, root/child Warehouse instantiation, and authenticated
  `PATCH /api/topology/<equipment-id>` (`action=configure-equipment`) use
  the same validation. Blank input clears the prefix. For a non-empty prefix,
  `childMode=POSITIONAL` is mandatory.
- Allowed prefix syntax: 1-80 ASCII letters/digits joined by underscores.
  Topic wildcards, paths, whitespace and raw JSON are rejected.
- Changing prefix never rewrites existing breaker TelemetryBindings or migrates
  source/historical data. The UI clearly identifies the prefix as an **address
  declaration**, not a certified source/Breaker identity.
- To display individual breaker values, commission the exact source SN,
  `sourcePointId`, metric and breaker Equipment target with verified bindings.
  The operator-defined prefix provides the candidate raw-point group but does
  not authorize silently inferring the physical wiring.
- Panel slot count does not establish that every numbered point actually
  exists in the source payload. Source/group range must be verified independently.

No data migration is required to add this optional field to existing Equipment.
