# QDF power target AID + RackAID — 19.11.2026 reconciliation contract

**Current field source:** `Lista de Equipos NUEVO QDF-2-4-5  mop ver.19.11.2026.xlsx`  
**Previous reconciliation source:** `Lista de Equipos QDF mop v2 AID + RackAID.xlsx`  
**Captured:** 2026-11-19

## Authoritative facts

The 19.11 workbook contains **76 breaker feed endpoints** after QDF migration:

- QDF-2: 26 breaker endpoints,
- QDF-4: 14 breaker endpoints,
- QDF-5: 36 breaker endpoints.

Compared with the previous AID/RackAID reconciliation:

- 26 endpoints are unchanged,
- 32 endpoints have a new endpoint label/AID,
- 16 endpoints have display/format changes without creating a new logical equipment identity,
- 2 endpoints are new: Orion Feed A/B at QDF-4 A3-07/B3-07.

The current workbook provides the breaker schedule, current display labels, HUELLA, ratings,
documentary status and field-current measurements. The previous reconciliation remains
historical evidence for prior target labels/AIDs and the rack-scoped PDU identity rule.

## Identity policy

`HUELLA` continues to identify the documentary destination rack:

```text
HUELLA 010208.14
→ RACK::010208.14
```

Display-name changes do not create new logical equipment.

Examples:

```text
Current display: GRTLUREM3
Canonical logical identity: GRTLuren3
Equipment key: grtluren3

Current display: GX-LUR-02
Legacy alias: GXLUR02
Equipment key: gx-lur-02

Current display: GX-LUR-01
Legacy alias: GXLUR01
Equipment key: gx-lur-01
```

For renamed electrical endpoints, the 19.11 label/AID becomes the current declaration and the
previous target/AID is retained as compatibility evidence.

Examples:

```text
DTX-LUR-FP2-01 SH15 PEM A1.1
→ DTX-LUR-FP2-01 SH15 PA1-1

old AID: DTX-LUR-FP2-01::SH15::PEM::A1.1
new AID: DTX-LUR-FP2-01::SH15::NoSlot::PA1-1
```

```text
DTN-LUR-FP4-01 SH1 A
→ DTN-LUR-FP4-01 SH1 PWR:A

old AID: DTN-LUR-FP4-01::SH1::NoSlot::A
new AID: DTN-LUR-FP4-01::SH1::NoSlot::PWR:A
```

## Rack association map

| QDF | HUELLA | Rack AID | Type | Canonical equipment / PDU | Current display / aliases |
| --- | --- | --- | --- | --- | --- |
| QDF-2 | 010202.10 | `RACK::010202.10` | PDU | PDU 01 | Rack CDN PDU-1A/B |
| QDF-2 | 010202.09 | `RACK::010202.09` | EQUIPMENT | GRTLuren3 | GRTLUREM3 |
| QDF-2 | 010202.11 | `RACK::010202.11` | EQUIPMENT | DTX-LUR-FP2-01 | DTX-LUR-FP2-01 |
| QDF-4 | 010206.20 | `RACK::010206.20` | EQUIPMENT | BB-LUR-04 | BB-LUR-04 |
| QDF-4 | 010206.19 | `RACK::010206.19` | EQUIPMENT | PL-LUR-FPN3-1 | PL-LUR-FPN3-1 |
| QDF-4 | 010206.15 | `RACK::010206.15` | EQUIPMENT | DTN-LUR-FP4-01 | DTN-LUR-FP4-01 |
| QDF-4 | 010205.20 | `RACK::010205.20` | EQUIPMENT | BB-LUR-FPN3-3 | BB-LUR-FPN3-3 |
| QDF-4 | 010205.16 | `RACK::010205.16` | EQUIPMENT | Orion | Orion |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPMENT | WS-LUR-04 | WS-LUR-04 |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPMENT | WS-LUR-01 | WS-LUR-01 |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPMENT | WS-LUR-02 | WS-LUR-02 |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPMENT | CAR-LUR-01 | CAR-LUR-01 |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPMENT | WS-LUR-03 | WS-LUR-03 |
| QDF-5 | 010208.13 | `RACK::010208.13` | EQUIPMENT | GX-LUR-02 | legacy: GXLUR02 |
| QDF-5 | 010208.13 | `RACK::010208.13` | EQUIPMENT | GX-LUR-01 | legacy: GXLUR01 |
| QDF-5 | 010208.13 | `RACK::010208.13` | PDU | PDU 01 | PDU1-A/B |
| QDF-5 | 010208.14 | `RACK::010208.14` | PDU | PDU 01 | PDU1-A/B |
| QDF-5 | 010208.16 | `RACK::010208.16` | EQUIPMENT | DTX-LUR-FP2-1 | DTX-LUR-FP2-1 |
| QDF-5 | 010207.20 | `RACK::010207.20` | EQUIPMENT | PL-LUR-FPO1-1 | PL-LUR-FPO1-1 |

## PDU contract

PDU identity remains rack-scoped because a local `PDU 01` name can repeat:

```text
RACK::010202.10::PDU01
├── RACK::010202.10::PDU01::A
└── RACK::010202.10::PDU01::B

RACK::010208.13::PDU01
├── RACK::010208.13::PDU01::A
└── RACK::010208.13::PDU01::B

RACK::010208.14::PDU01
├── RACK::010208.14::PDU01::A
└── RACK::010208.14::PDU01::B
```

The local AID is retained for field cross-checking:

```text
PDU01::NoShelf::NoSlot::A
PDU01::NoShelf::NoSlot::B
```

For `RACK::010208.13::PDU01`, the current documentary remarks use zero-padded shelves:

- Feed A: `Pos-1: MTC-9 SH01 PEM A`, `Pos-2: MTC-9 SH04 PEM A`
- Feed B: `Pos-1: MTC-9 SH01 PEM B`, `Pos-2: MTC-9 SH04 PEM B`

Those POS-N values remain remarks only and do not create individually telemetered endpoints.

## Orion

The 19.11 workbook supersedes the previous “rack association only” interpretation. Orion now
has an explicit A/B breaker pair:

```text
QDF-4 A3-07 → Orion → RACK::010205.16
QDF-4 B3-07 → Orion → RACK::010205.16
```

Because the source gives only the equipment name, Site Mapper derives feed-specific documentary
endpoint AIDs:

```text
Orion::NoShelf::NoSlot::FEED-A
Orion::NoShelf::NoSlot::FEED-B
```

The breakers are documented as 80 A, OFF, with proposed replacement 60 A. This remains
documentary status, not live telemetry.

## Persistence rule

Seed-01 v14 applies the new source additively:

- current source target becomes `declaredPower.targetLabel` when the previous declaration is
  still source-managed;
- previous breaker aliases remain in `aliases[]`;
- previous AIDs are retained in `declaredPower.targetAidAliases`;
- operator-corrected targets that no longer match source aliases are preserved;
- source-managed PDU remarks are updated from SH1/SH4 to SH01/SH04, while operator-edited remarks
  remain untouched;
- no remote Equipment/PDU topology or rack-U placement is materialized from the spreadsheet alone.
