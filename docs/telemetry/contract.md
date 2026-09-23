# Telemetry Contract

**Gate:** G10  
**Status:** Accepted

## Flow

```text
MQTT broker
→ server-side native MQTT adapter
→ topic allowlist
→ payload validation/normalization
→ Device/Equipment identity resolution
→ in-process latest-value hub
→ authenticated SSE
→ browser
```

The browser never receives MQTT credentials and never connects directly to the broker.

## Identity

The first topic segment after `MQTT_TOPIC_PREFIX` is treated as the external telemetry identity.

That identity must resolve uniquely to one ACTIVE Device or Equipment `serialNumber`.

Ambiguous and unknown identities are rejected.

## Payload

JSON objects are accepted up to `TELEMETRY_MAX_PAYLOAD_BYTES`.

If the payload contains an object-valued `reported` field, that object is the normalized reported state. Otherwise the root object is used.

Malformed, oversized or non-object payloads are rejected.

## Realtime browser transport

`GET /api/telemetry/stream`:

- requires `telemetry:read`;
- emits an initial snapshot;
- emits `telemetry` SSE events;
- sends heartbeat comments every 15 seconds;
- rejects additional streams above `TELEMETRY_MAX_STREAMS`.

## MQTT

The production adapter supports `mqtt://` and `mqtts://` using Node TCP/TLS.

It performs CONNECT, SUBSCRIBE, PING and PUBLISH parsing, acknowledges QoS 1 messages and reconnects with bounded exponential backoff.

QoS 2 delivery is parsed but not acknowledged as a complete QoS 2 state machine; production broker subscriptions are requested at QoS 0.

## Secrets

Broker URL and credentials exist only as runtime environment values.

Credentials committed in the legacy repository are considered compromised and must be rotated outside this repository before production use.

## Development ingestion

`POST /api/telemetry/ingest` exists only outside production and requires `settings:write`. It provides deterministic local/integration validation without bypassing the same normalizer and identity resolver used by MQTT.
