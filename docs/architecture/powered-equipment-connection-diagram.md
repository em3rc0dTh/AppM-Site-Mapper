# Powered Equipment & Connection Diagram — additive projection v14

**Status:** implemented as additive read-only projection  
**Current field source:** `Lista de Equipos NUEVO QDF-2-4-5  mop ver.19.11.2026.xlsx`  
**Date:** 2026-11-19

## Purpose

Site Mapper already stores declared electrical destinations on circuit breakers. The connection
diagram groups those endpoint declarations into the logical equipment they feed without creating a
second physical inventory model.

```text
Circuit Breaker
      │
      ▼
declaredPower.targetLabel / POWER_TARGET
      │
      ▼
Power endpoint / AID
      │
      ▼
PoweredEquipment projection
      │
      ▼
Connection Diagram
```

The projection remains read-only. No new MongoDB collection is introduced and no remote Equipment,
PDU, AccessPort or PowerPath is created merely because a spreadsheet names a destination.

## Identity versus display name

The 19.11 workbook demonstrates why display names must not be used as immutable identity.

Examples:

```text
Display source: GRTLUREM3
Canonical logical equipment: GRTLuren3
Projection key: grtluren3
```

```text
Current display: GX-LUR-02
Legacy display: GXLUR02
Projection key: gx-lur-02
```

A current display change therefore does not produce a second powered equipment.

The endpoint AID can legitimately change when the field endpoint notation changes. In that case the
new AID becomes current and the old AID remains in compatibility history.

```text
old: DTX-LUR-FP2-01::SH15::PEM::A1.1
new: DTX-LUR-FP2-01::SH15::NoSlot::PA1-1
```

## Supported current endpoint notation

The projection supports the current workbook patterns, including:

- `GRTLUREM3 PSU0 A0`
- `DTX-LUR-FP2-01 SH15 PA1-1` / `PB1-1`
- `DTN-LUR-FP4-01 SH1 PWR:A` / `PWR:B`
- `GX-LUR-02 SH01 PEM 1`
- `WS-LUR-04 PSU1`
- `CAR-LUR-01 PSA` / `PSB`
- `PL-LUR-FPN3-1 SH20 FEED A`
- `PDU1-A` / `PDU1-B`
- `Orion` with Feed A/B supplied by breaker context.

Shelf zero-padding is normalized for endpoint identity:

```text
SH01 → SH1
SH02 → SH2
SH04 → SH4
```

Spaced module notation is normalized:

```text
PEM 1 → PEM1
PEM 3 → PEM3
```

## Rack AID and PDU identity

`HUELLA` is carried as documentary rack association:

```text
010208.14 → RACK::010208.14
```

PDU identity is rack-scoped because `PDU 01` can repeat:

```text
RACK::010208.14::PDU01
├── RACK::010208.14::PDU01::A
└── RACK::010208.14::PDU01::B
```

The local field AID remains available:

```text
PDU01::NoShelf::NoSlot::A
PDU01::NoShelf::NoSlot::B
```

PDU POS-N lines remain documentary remarks only; they do not create telemetry endpoints.

## Orion

The current workbook adds a real A/B breaker pair:

```text
QDF-4 A3-07 → Orion
QDF-4 B3-07 → Orion
RackAID: RACK::010205.16
```

Because no lower-level endpoint is named, the projection derives a feed-specific documentary
endpoint from breaker context:

```text
Orion::NoShelf::NoSlot::FEED-A
Orion::NoShelf::NoSlot::FEED-B
```

This is an endpoint projection, not creation of remote Orion Equipment topology.

## Search and navigation

Ctrl/Cmd+K remains backward compatible:

1. `POWERED_EQUIPMENT` groups all current endpoints of the logical equipment.
2. Individual `POWER_TARGET` results remain searchable, including retained historical aliases.

The detached route remains:

```text
/workbench/powered-equipment?key={projection-key}
```

Power Path uses breaker identity:

```text
/workbench/powered-equipment?breakerId={breaker-id}
```

Using breaker identity avoids ambiguity for rack-scoped PDU targets.

## Diagram contract

The window is standalone and groups:

```text
QDF / BDFB
├── Feed A
│   ├── breaker → endpoint/AID
│   └── ...
└── Feed B
    ├── breaker → endpoint/AID
    └── ...
                         Powered Equipment / PDU
```

The header may expose documentary RackAID. Multiple QDF/BDFB sources remain supported by the model.

## Telemetry

The diagram reads existing breaker telemetry only:

- voltage,
- current,
- power,
- energy counter.

Rules:

- missing readings display unavailable, never invented zero;
- voltage and current are not aggregated;
- available breaker power can be summed and marked partial when coverage is incomplete;
- energy is displayed as counter sum, never mislabeled as 24-hour consumption.

Spreadsheet Fluke/AEMC/Thradex measurements are documentary field evidence and are not written into
live telemetry by seed-01.

## Seed-01 v14 additive upgrade

Seed v14 advances the documentary declaration contract to version 3:

```text
declaredPower.contractVersion = 3
declaredPower.sourceDocument
declaredPower.identitySourceDocument
declaredPower.targetLabel
declaredPower.targetEntityName
declaredPower.targetCanonicalEntityName
declaredPower.targetKind
declaredPower.targetAid
declaredPower.targetLocalAid
declaredPower.targetRackAid
declaredPower.targetBaseAid?          # PDU
declaredPower.targetAliases
declaredPower.targetAidAliases?
declaredPower.remarks
declaredPower.remarksSemantics
declaredPower.targetPlacement = RACK_ASSOCIATED_U_UNKNOWN
```

Upgrade behavior is intentionally asymmetric:

- if the current declaration still matches a known source alias, the 19.11 source updates it;
- if an operator has changed the target to something outside the source aliases, that correction wins;
- prior source labels remain breaker aliases;
- replaced AIDs remain `targetAidAliases`;
- source-managed PDU remarks can be normalized to SH01/SH04;
- operator-edited remarks are preserved;
- existing IDs, PowerPaths and commissioned protection are not replaced.

This is the non-breaking boundary for the Connection Diagram feature.
