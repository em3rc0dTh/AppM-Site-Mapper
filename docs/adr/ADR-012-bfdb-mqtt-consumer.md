# ADR-012 — BFDB MQTT consumer and breaker binding

**Status:** Accepted  
**Date:** 2026-09-28

## Context

AppM Site Mapper must visually organize BFDB telemetry received from an MQTT provider.

The current source is the BFDB emulator environment. The provider endpoint is expected to change later.

The BFDB emulator/gateway repository also contains Modbus projection and emulator behavior, but those responsibilities must not be cloned into AppM.

Existing AppM MongoDB data already owns the ordered BDFB hierarchy and stable breaker identities.

## Decision

AppM remains an MQTT consumer.

```text
provider
→ MQTT
→ AppM server adapter
→ normalization
→ Device/BDFB resolution
→ breaker binding
→ Latest State
→ authenticated SSE
→ interface
```

Provider URL and credentials are runtime configuration.

The MQTT source identity resolves to an AppM Device using either the Device `serialNumber` or an explicit `MQTT_SOURCE_DEVICE_MAP`.

Breaker identity remains the AppM breaker `id`.

MQTT `rawPointId` is only a telemetry binding.

The BFDB emulator profile supports:

1. explicit `breaker.telemetry.rawPointId`; and
2. a compatibility binding based on stored panel order plus 1-based endpoint position, bounded by 24 positions by default.

Explicit binding wins.

Holders never become breakers because telemetry arrives.

## Partial updates

Latest State merges BFDB updates by point and by electrical metric.

Missing values do not overwrite previous accepted values.

Explicit zero remains a real value.

## Consequences

Positive:

- AppM can consume the current emulator without cloning it;
- the provider URL can change independently from UI/domain code;
- existing Mongo BDFB structure remains usable;
- breaker IDs remain stable and provider-independent;
- rotating MQTT batches accumulate into one current-state view;
- future explicit field mappings can replace emulator ordering without migrating breaker identity.

Trade-offs:

- `panel-order-24` assumes stored panel order intentionally matches the emulator group order;
- field commissioning should prefer explicit evidence-backed point bindings;
- historical persistence is owned by Site Mapper's telemetry module and is specified separately in ADR-016; the MQTT provider/emulator never owns Site Mapper history.
