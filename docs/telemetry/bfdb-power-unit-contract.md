# BFDB power unit contract — raw source compatibility and canonical W

## Current decision

For BFDB/QDF operational telemetry, Site Mapper no longer treats device-reported
`P1/P2` as the authority for breaker power.

The field evidence that originally motivated the old BFDB v1 assumption remains useful:
a sample such as `U1=14.95 V`, `I1=3.72 A`, `P1=55.62` is dimensionally consistent
with watts. However, the field devices/gateways do not provide sufficiently reliable
P/EP semantics across installations for those values to govern the product.

The current operational contract is therefore:

```text
MQTT RAW
U1/U2  -> authoritative voltage
I1/I2  -> authoritative current
P1/P2  -> preserved RAW evidence only
EP1/EP2 -> preserved RAW evidence only

Site Mapper
powerW    = voltageV * currentA
energyKwh = trapezoidal integral of derived power over accepted real intervals
```

See [BFDB derived electrical contract](./bfdb-derived-electrical-contract.md).

## Canonical units

Site Mapper keeps breaker power canonically in watts:

```text
powerW = W
presentation / contractual kW = powerW / 1000
```

The presentation conversion remains exactly:

```text
kW = W / 1000
```

Derived energy is stored/presented in kWh.

## Raw source compatibility

Legacy POWER bindings and the helper that can normalize a declared source power unit
(`W` or `kW`) may remain in the codebase for compatibility, historical evidence and
non-operational tooling. They do not make BFDB `P1/P2` authoritative for LIVE breaker
power.

Existing persisted POWER/ENERGY bindings are not deleted or rewritten by this change.
New automatic BFDB reconciliation creates only VOLTAGE and CURRENT source bindings.
Canonical POWER and ENERGY are generated after those source measurements are accepted.

## Invariants

1. Raw MQTT payloads are preserved unchanged for audit.
2. Operational BFDB voltage/current come from the commissioned U/I channel.
3. Operational BFDB power is derived from same-frame V/I.
4. Operational BFDB energy is derived from accepted power intervals; source EP is never used as its baseline.
5. Missing V or I does not become zero and does not create new derived P/E.
6. Explicit numeric zero is a valid measurement.
7. Canonical internal power stays W; operator/RFP presentation stays kW.
8. No UI-scaled kW value is persisted back as W.
9. Existing source P/EP bindings may remain as compatibility metadata but do not override derived metrics.
10. A source/gateway change does not require a database schema migration.

## Historical note

The previous contract interpreted `P1/P2` as source power and normalized it into
`powerW`. That behavior is superseded for the BFDB/QDF operational path by the derived
electrical contract above. Historical records already written under the former contract
remain historical evidence and are not silently rewritten.
