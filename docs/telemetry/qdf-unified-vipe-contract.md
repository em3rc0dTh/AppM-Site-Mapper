# Unified QDF V/A/P/E contractual projection

## Purpose

`qdf-vipe-v1` is the canonical application facade for the already-certified QDF totals. It closes
the RFP gap where Voltage, Current, Power and Energy existed independently but not as one explicit
contract.

## Invariants

- UNIFIED does not mean RECALCULATED.
- Voltage authority remains the coherent A/B voltage projector.
- Current authority remains the verified independent-input current projector.
- Power authority remains the verified paired V/I power projector.
- Energy authority remains E1 historical window energy.
- Per-metric quality remains independent.
- Per-metric timestamps/temporal scope remain independent.
- E1 Energy is never represented as a lifetime/live counter.
- Existing response fields remain present.
- Existing Modbus addresses and publication behavior remain unchanged.
- No Mongo or Timescale schema is added or changed.

## Live scope

The existing SNMP feed endpoint adds `qdfElectricalContract` with canonical V/A/P and an explicit
Energy entry marked `WINDOW_ONLY`. Contract status summarizes V/A/P availability only.

## Historical scope

The existing trends endpoint adds `qdfElectricalContract` with all V/A/P/E series, requested window,
voltage tolerance and E1 total kWh for that window. Contract status is COMPLETE only when all four
contractual metrics have canonical data.

## Compatibility

The pre-existing `totalCurrent`, `totalPower`, `totalVoltage`, `totalEnergy` and
`voltageContract` fields remain unchanged. Consumers may migrate to `qdfElectricalContract`
without a flag day.
