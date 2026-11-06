# Site Mapper — Metasys Modbus TCP register map (read only)

This document is the runtime companion to the approved **Modbus_TCP_v1.2.xlsx** client schedule.
The Excel allocation is authoritative for the Site Mapper -> Metasys Modbus surface.

## Frozen contract

| Field                 | Value                                              |
| --------------------- | -------------------------------------------------- |
| Transport             | Modbus TCP (MBAP)                                  |
| Function code         | **04 — Read Input Registers**                      |
| TCP production port   | 502 after authorized OT publication                |
| Unit IDs              | 1 = QDF-2, 2 = QDF-4, 3 = QDF-5                    |
| Breaker labels        | 01-A…48-A and 01-B…48-B                            |
| Total label           | 00 = Entire QDF                                    |
| Measurements          | Voltage (V), Current (A), Power (kW), Energy (kWh) |
| Value representation  | IEEE-754 FLOAT32, two 16-bit registers             |
| Word/byte order       | High word first; network big-endian bytes          |
| Scaling               | 1 on wire; internal power W is published as kW     |
| Breaker block         | offsets 0…767                                      |
| Total block           | offsets 768…775                                    |
| Registers per Unit ID | 776                                                |
| Points per Unit ID    | 388                                                |
| Total points          | 1,164                                              |
| Access                | Read-only                                          |

The documentary 4xxxx reference is one-based: offset 0 = 40001. The actual Modbus request uses the
zero-based start address unless the Metasys driver is configured for another addressing convention.

## Breaker allocation

The runtime keeps a stable internal ordinal only to calculate register offsets. It is not exposed as
a client breaker number.

| Client breaker | Internal ordinal | Start block |
| -------------- | ---------------: | ----------: |
| 01-A           |                1 |           0 |
| …              |                … |           … |
| 48-A           |               48 |         376 |
| 01-B           |               49 |         384 |
| …              |                … |           … |
| 48-B           |               96 |         760 |

Each breaker consumes eight registers:

| Measurement | Relative offset | Example 01-A |
| ----------- | --------------: | ------------ |
| Voltage     |              +0 | 40001-40002  |
| Current     |              +2 | 40003-40004  |
| Power       |              +4 | 40005-40006  |
| Energy      |              +6 | 40007-40008  |

## QDF total 00

The four QDF totals occupy the eight registers immediately after the breaker block.

| 00 measurement | Reference   | Start address | Unit |
| -------------- | ----------- | ------------: | ---- |
| Voltage        | 40769-40770 |           768 | V    |
| Current        | 40771-40772 |           770 | A    |
| Power          | 40773-40774 |           772 | kW   |
| Energy         | 40775-40776 |           774 | kWh  |

Voltage, Current and Power can be mirrored from the commissioned canonical QDF projections. Total
Energy is the sum of the latest accepted 96 breaker energy counters after every breaker has supplied
an Energy value. Missing measurements are never manufactured.

## Real Acrel MQTT normalization

Field Acrel frames use slave/group identifiers **1, 3, 5 and 7**. Measured objects 1..12 carry two
physical channels:

- channel 1: U1 / I1 / P1 / EP1;
- channel 2: U2 / I2 / P2 / EP2.

Site Mapper resolves these to the client breaker space before the Modbus sidecar sees them:

- group 1 -> A3 -> A positions 01..24;
- group 3 -> A2 -> A positions 25..48;
- group 5 -> B3 -> B positions 01..24;
- group 7 -> B2 -> B positions 25..48.

Objects 13..24 observed as state-only in the field profile are connectivity shadows and do not create
additional breaker measurements.

## Generated CSV

The committed CSV is generated from the same register-map module used by the runtime:

```sh
node scripts/operations/generate-metasys-register-map.mjs
node scripts/operations/generate-metasys-register-map.mjs --check
```

The public CSV uses emulator identities. Field source-to-Unit-ID mapping remains runtime
configuration; the OFFICE/FIELD template maps the approved serials to Unit IDs 1/2/3.

## Data validity

Only accepted commissioned breaker measurements populate the register image. The configured
`MODBUS_MISSING_POLICY` controls missing/stale reads. The default `zero` policy is compatible with
the existing deployment but makes an unavailable value indistinguishable from a legitimate zero.
The optional `exception` policy returns exception 04 for an FC04 request containing unavailable
registers and must be agreed with the Metasys integrator.

This interface is read-only and is not a safety-control channel.
