# BFDB derived electrical contract

## Decision

For BFDB/QDF MQTT telemetry, voltage and current are the authoritative operational measurements.

Device-reported power and energy fields (`P1/P2`, `EP1/EP2`) remain preserved in the raw MQTT envelope for diagnostics and audit, but they do not drive LIVE state, alarms, history, or Modbus projection.

## Operational metrics

For each commissioned circuit and channel:

- `voltageV`: SOURCE from `U1/U2`.
- `currentA`: SOURCE from `I1/I2`.
- `powerW`: DERIVED by Site Mapper as the positive magnitude `abs(V * I)`.
- `energyKwh`: DERIVED by Site Mapper by trapezoidal integration of positive derived power over real receive intervals and exposed as a non-negative accumulated value.

Power is derived only when voltage and current belong to the same observed frame.

An explicit numeric zero is a valid measurement. Missing voltage or current is not converted to zero and does not produce derived power or energy.

## Energy integration

The default maximum eligible integration gap is 120 seconds.

For two consecutive accepted samples:

```
deltaEnergyKwh =
  ((previousPowerW + currentPowerW) / 2)
  * deltaTimeMs
  / 3_600_000_000
```

Intervals larger than the maximum gap are not interpolated. The accumulator is carried forward without inventing consumption for the missing interval.

The accumulator is restored after application restart from the latest historian-backed Equipment sample only when that sample is explicitly tagged as Site Mapper-derived. Legacy/source `EP` values are never adopted as the derived baseline.

When historian recovery is unavailable, LIVE power remains available and a new derived energy baseline starts locally.

## Signed voltage/current and positive consumption metrics

Site Mapper preserves the sign of authoritative voltage and current measurements, but derived consumption metrics are normalized to positive magnitude:

```
powerW = abs(voltageV * currentA)
```

No implicit correction is applied to the SOURCE voltage or current values themselves. Their sign remains visible for diagnostics and wiring validation.

Derived energy integrates the positive power magnitude and is always exposed as a non-negative accumulated value. When historian recovery encounters an older negative Site Mapper-derived accumulator, its absolute value becomes the restored baseline.

## Propagation

The canonical derived metrics are published before downstream consumers:

```
MQTT RAW
  -> normalize / bind V,I
  -> derive P,E
  -> LIVE / UI
  -> alarm evaluator
  -> historian
  -> Modbus bridge
```

The Modbus bridge must consume the canonical Equipment/Breaker metrics. It must not re-read raw `P/EP` values after derivation.

## Raw evidence invariant

The original MQTT payload is preserved unchanged in the source-level telemetry/capture path. Derived metrics supplement operational state; they never rewrite the raw packet.

This keeps field evidence auditable while allowing AppManager Site Mapper to provide stable electrical semantics across gateways whose power or energy implementation is incomplete or unreliable.
