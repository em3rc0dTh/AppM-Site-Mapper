# QDF power target AID + RackAID — final workbook contract

**Source:** `Lista de Equipos QDF mop v2 AID + RackAID.xlsx`  
**Worksheets:** `Despues migra`, `Hoja1`  
**Captured:** 2026-11-19

## Authoritative facts

The workbook contains **74 breaker feed endpoint rows** after the QDF migration:

- QDF-2: 26 breaker endpoints,
- QDF-4: 12 breaker endpoints,
- QDF-5: 36 breaker endpoints.

`Hoja1` adds **19 rack associations**: 16 ordinary equipment associations and 3 rack-scoped PDU associations.

The workbook states:

1. `HUELLA` identifies the physical rack.
2. Rack AID is `RACK::<HUELLA>`.
3. `PDU 01` is a local rack name and can repeat in distinct racks.
4. A/B are two feeds of the same PDU.
5. `POS-N` values are editable remarks and do not generate individual telemetry.

## Rack association map

| QDF | HUELLA | Rack AID | Type | Equipment / PDU | PDU base AID |
| --- | --- | --- | --- | --- | --- |
| QDF-2 | 010202.10 | `RACK::010202.10` | PDU | PDU 01 | `RACK::010202.10::PDU01` |
| QDF-2 | 010202.09 | `RACK::010202.09` | EQUIPO | GRTLuren3 | — |
| QDF-2 | 010202.11 | `RACK::010202.11` | EQUIPO | DTX-LUR-FP2-01 | — |
| QDF-4 | 010206.20 | `RACK::010206.20` | EQUIPO | BB-LUR-04 | — |
| QDF-4 | 010206.19 | `RACK::010206.19` | EQUIPO | PL-LUR-FPN3-1 | — |
| QDF-4 | 010206.15 | `RACK::010206.15` | EQUIPO | DTN-LUR-FP4-01 | — |
| QDF-4 | 010205.20 | `RACK::010205.20` | EQUIPO | BB-LUR-FPN3-3 | — |
| QDF-4 | 010205.16 | `RACK::010205.16` | EQUIPO | Orion | — |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPO | WS-LUR-04 | — |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPO | WS-LUR-01 | — |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPO | WS-LUR-02 | — |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPO | CAR-LUR-01 | — |
| QDF-5 | 010208.12 | `RACK::010208.12` | EQUIPO | WS-LUR-03 | — |
| QDF-5 | 010208.13 | `RACK::010208.13` | EQUIPO | GXLUR02 | — |
| QDF-5 | 010208.13 | `RACK::010208.13` | EQUIPO | GXLUR01 | — |
| QDF-5 | 010208.13 | `RACK::010208.13` | PDU | PDU 01 | `RACK::010208.13::PDU01` |
| QDF-5 | 010208.14 | `RACK::010208.14` | PDU | PDU 01 | `RACK::010208.14::PDU01` |
| QDF-5 | 010208.16 | `RACK::010208.16` | EQUIPO | DTX-LUR-FP2-1 | — |
| QDF-5 | 010207.20 | `RACK::010207.20` | EQUIPO | PL-LUR-FPO1-1 | — |

## PDU contract

The three PDUs resolve as:

```text
RACK::010202.10::PDU01
├── ::A
└── ::B

RACK::010208.13::PDU01
├── ::A
└── ::B

RACK::010208.14::PDU01
├── ::A
└── ::B
```

The workbook also carries the local feed form:

```text
PDU01::NoShelf::NoSlot::A
PDU01::NoShelf::NoSlot::B
```

Site Mapper keeps both: the rack-scoped AID is the unambiguous projected identity, while the local AID remains available for field cross-checking.

## Documentary remarks

For `RACK::010208.14::PDU01`:

- Feed A: `Pos-1: MTC-9 SH10 PEM A`, `Pos-2: XTM-LUR01 PEM A`
- Feed B: `Pos-1: MTC-9 SH10 PEM B`, `Pos-2: XTM-LUR01 PEM B`

For `RACK::010208.13::PDU01`:

- Feed A: `Pos-1: MTC-9 SH1 PEM A`, `Pos-2: MTC-9 SH4 PEM A`
- Feed B: `Pos-1: MTC-9 SH1 PEM B`, `Pos-2: MTC-9 SH4 PEM B`

These remain remarks only. Site Mapper must not generate individual telemetry from those positions.

## Orion

`Orion` is associated to `RACK::010205.16` in `Hoja1`, but the breaker worksheet does not provide a corresponding power feed row. The association is retained as documentary truth only. No breaker, AccessPort, PowerPath or telemetry binding may be inferred from it.

## Persistence rule

This workbook enriches `declaredPower` only. It does not authorize creation or relocation of remote topology.

Seed-01 v13 records the RackAID/AID facts additively and preserves operator-reviewed data.
