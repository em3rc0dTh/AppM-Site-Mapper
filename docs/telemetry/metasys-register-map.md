# Site Mapper — Metasys Modbus TCP register map (read only)

The provided Vertiv UXIM/UXTM reference is used **only as a table presentation example**. Site Mapper does not implement Vertiv's Modbus ASCII transport, battery-specific registers, scaling or control commands.

## Frozen baseline

| Field                  | Value                                             |
| ---------------------- | ------------------------------------------------- |
| Transport              | Modbus TCP (MBAP)                                 |
| Function code          | 03, Read Holding Registers                        |
| Supported measurements | Voltage (V), Current (A), Power (W), Energy (kWh) |
| Value representation   | IEEE-754 FLOAT32, two 16-bit registers            |
| Word/byte order        | High word first; network big-endian bytes         |
| Scaling                | 1, no transformation                              |
| First circuit          | Addresses 0..7; references 40001..40008           |
| Last circuit           | Addresses 760..767; references 40761..40768       |
| Unit IDs               | Unit 1/2/3 for lab emulator sources only          |
| Access                 | Read-only: no FC04, FC06, FC16 or remote control  |

The reference prefix `4xxxx` is documentary (e.g. 40001 = wire offset 0); an integration tool might instead ask for 0 or 1. **Enter the actual zero-based start offset or adjust the point entry according to the driver's addressing convention.** Never send 40001 as the wire offset.

## Table columns (following the supplied reference format)

The generated CSV starts with `CATEGORY`, `NAME/DESCRIPTION`, `REFERENCE` and `DATA ADDRESS`, like the Vertiv reference, and explicitly adds `START ADDRESS (0-BASED)`, `UNIT ID`, `SOURCE ID`, `CIRCUIT`, `RAW POINT`, `FUNCTION`, `DATA TYPE`, `REGISTER COUNT`, `ENGINEERING UNIT`, `SCALE`, `WORD ORDER`.

Each Unit ID contains 96 circuits × 4 quantities = 384 FLOAT32 values = 768 16-bit holding registers. The three lab Unit IDs together yield **1,152 documented measurements** and 2,304 16-bit registers.

| Circuit 1 / Unit 1 | Reference   | Wire offsets | Format / unit |
| ------------------ | ----------- | ------------ | ------------- |
| Voltage            | 40001-40002 | 0-1          | FLOAT32 / V   |
| Current            | 40003-40004 | 2-3          | FLOAT32 / A   |
| Power              | 40005-40006 | 4-5          | FLOAT32 / W   |
| Energy             | 40007-40008 | 6-7          | FLOAT32 / kWh |

The CSV is generated from `infra/modbus-tcp/register-map.mjs`, also used by the runtime. No manual editing of row offsets is supported.

```sh
node scripts/operations/generate-metasys-register-map.mjs
node scripts/operations/generate-metasys-register-map.mjs --check
```

The committed CSV uses **synthetic lab source identities** `EMU-BFDB-01/02/03` and layout `panels-4x24`. To generate a deployment-specific table without publishing client identities, set the approved private `MODBUS_SOURCE_UNITS_JSON` and `MODBUS_POINT_LAYOUT` in your environment and run `--stdout` with private redirection. Do not commit that output to this public repository.

## Data validity (commissioning gate)

Only explicitly commissioned breaker bindings populate the sidecar. In the current release, missing or expired data (default 30 s) reads zero with the backward-compatible `MODBUS_MISSING_POLICY=zero`. A real zero is indistinguishable from unavailable telemetry. The optional `MODBUS_MISSING_POLICY=exception` instead returns Modbus exception **04 (Server Device Failure)** if any requested register lacks a fresh value. Since an exception invalidates the entire FC03 block request, the Metasys integrator must agree on polling granularity (ideally one circuit/8 registers per read) and certify its handling before enabling that policy in production.

The table is a **register allocation**, not evidence that 288 circuits are active. Site Mapper does not expose an additional quality/status measurement within the four-variable-only customer contract. It must not be used for interlocks or safety-critical decisions until missing-data semantics are signed off.

## Metasys handoff checklist

Confirm FC03, Unit IDs, IP/OT route, TCP port (standard 502 after approved deployment; local lab 1503), 0/1 addressing offset, IEEE-754 FLOAT32 word order (high-first), engineering units and poll grouping. Verify circuit 1 and circuit 96, no cross-Unit-ID leakage, actual values vs accepted telemetry, restart/staleness behavior and unavailable-point response. Creating/configuring native Metasys point entries is still required; no custom translator is part of this solution.
