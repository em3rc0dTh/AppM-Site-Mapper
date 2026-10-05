# Telemetry Contract

**Gate:** G10 extension  
**Status:** Accepted — BFDB MQTT consumer integration

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
→ in-process Latest State
→ authenticated SSE
→ AppM interface
```

The browser never receives MQTT credentials and never connects directly to the broker.

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

Two modes are supported.

### panel-order-24

Default emulator mode:

```text
0_1_1 .. 0_1_24  → first stored panel, positions 1..24
0_2_1 .. 0_2_24  → second stored panel, positions 1..24
...
```

The panel and endpoint arrays already stored in the BDFB structure are used in their canonical order.

The default is:

```text
BFDB_TELEMETRY_BINDING_MODE=panel-order-24
BFDB_POSITIONS_PER_PANEL=24
```

Only endpoints whose variant is `BREAKER` receive breaker telemetry. A `HOLDER` remains a holder even if an MQTT point exists for that physical position.

### explicit

A breaker may carry:

```json
{
  "id": "breaker-id",
  "variant": "BREAKER",
  "label": "CB-01",
  "telemetry": {
    "rawPointId": "0_1_1"
  }
}
```

With:

```text
BFDB_TELEMETRY_BINDING_MODE=explicit
```

AppM uses only explicit bindings. Duplicate explicit point bindings are rejected by BDFB validation.

An explicit breaker binding takes precedence over panel-order resolution.

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
- Timescale historical persistence is implemented by this change.
