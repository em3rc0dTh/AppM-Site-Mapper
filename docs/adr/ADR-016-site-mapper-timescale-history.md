# ADR-016 — Site Mapper owns telemetry history in TimescaleDB

**Status:** Accepted  
**Date:** 2026-10-01  
**Gate:** G10 telemetry persistence extension

## Context

The legacy product separated realtime telemetry and historical telemetry using an InfluxDB/Telegraf-oriented path.

MK1 already replaced the legacy realtime boundary with:

```text
MQTT
→ Site Mapper server adapter
→ validation / normalization / device resolution
→ Latest State
→ authenticated SSE
→ browser
```

The current BFDB emulator is temporary test infrastructure. Future physical BFDB devices can replace it while publishing the same or an adapted MQTT contract.

Historical telemetry therefore cannot be owned by the emulator repository or by a temporary gateway stack. If the emulator disappears, Site Mapper history must continue to exist.

## Decision

Site Mapper owns historical telemetry.

```text
field source / emulator
        ↓
       MQTT
        ↓
Site Mapper telemetry ingestion
        ↓
normalize + resolve + bind
        ├──────────────→ Latest State → SSE / LIVE
        │
        └──────────────→ history writer
                               ↓
                          TimescaleDB
                               ↓
                      Site Mapper history API
                               ↓
                     24H / 7D / 15D / 1M
```

MongoDB remains canonical for ordered application/domain state.

TimescaleDB is canonical for time-series telemetry history.

The BFDB emulator/gateway is only a replaceable source/integration environment and does not own Site Mapper historical truth.

## Write semantics

Only accepted, normalized electrical metrics are persisted.

A partial MQTT update persists only fields actually present in that accepted update.

```text
missing metric != zero
missing metric != copy previous Latest State value into history
explicit zero = real value
```

State-only updates do not create synthetic electrical samples.

HOLDER endpoints are never written as breaker telemetry.

The history writer receives the accepted patch before Latest State merge so historical data does not accidentally contain carried-forward values.

## Query semantics

Supported product windows:

```text
24h
7d
15d
1M
```

Historical aggregation groups each raw breaker point within a time bucket first, then averages across active breaker points. This prevents a point with more samples from dominating the panel/BDFB average.

Panel queries are restricted to the explicit raw-point bindings of that panel. BDFB queries use all configured breaker bindings. HOLDERs never contribute to numerator or denominator.

## Local development

Site Mapper owns a local telemetry persistence stack:

```text
docker-compose.telemetry.yml
├── timescaledb
└── telemetry-store
```

The adapter is bound to loopback only for local development.

The local MQTT launcher starts this stack automatically unless explicitly disabled.

The Timescale volume is durable across Site Mapper application restarts and is independent of the emulator lifecycle.

## Production consequence

Production may deploy TimescaleDB and its adapter separately for operational reasons, but they remain part of the Site Mapper platform boundary.

Replacing the field emulator with real devices must require no telemetry-history migration or UI architecture change.
