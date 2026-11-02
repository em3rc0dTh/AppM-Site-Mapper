# BFDB power unit contract — W internally, kW contractually

## Decision

For BFDB v1 payloads shaped as `U1/I1/P1/EP1` and `U2/I2/P2/EP2`, Site Mapper currently treats
`P1/P2` as watts. This decision is intentionally revisable when stronger protocol or field
evidence becomes available.

The current evidence includes the representative observation:

```text
U1 = 14.95 V
I1 = 3.72 A
P1 = 55.62

14.95 × 3.72 = 55.614
```

That is dimensionally consistent with approximately 55.62 W. The value alone is never used to
infer a unit; the evidence only supports the default profile decision.

## Canonical boundary

```text
FIELD / MQTT
P1/P2
  |
  | source unit from POWER binding
  | default BFDB v1 = W
  v
POWER NORMALIZER
  W  -> ×1
  kW -> ×1000
  ?  -> reject POWER
  |
  v
CANONICAL INTERNAL
powerW / power_w = W
  |
  +--------------------------+
  |                          |
  v                          v
history / Energy         presentation
W authority              W / 1000
                             |
                             v
                         kW contract
```

## Invariants

1. Source unit is declared by profile/binding, never guessed from magnitude.
2. Missing BFDB v1 POWER unit defaults to W for backward compatibility.
3. Explicit `unit=kW` is supported and normalized to canonical W before Latest State/history.
4. Unsupported units fail only the POWER metric closed; other valid metrics remain usable.
5. Timescale `power_w`, breaker `powerW`, historical calculations and Energy semantics stay W-based.
6. Operator/RFP surfaces present Power in kW.
7. Presentation conversion is exactly `kW = W / 1000`.
8. No UI-scaled kW value is ever persisted back as W.
9. A future evidence-backed unit change is a source-profile/binding change, not a database migration.

## Change procedure if P1/P2 are later proven to be kW

Do not rename `powerW` or rewrite stored history blindly. Instead:

1. capture the authoritative protocol/manual or field evidence;
2. set the affected POWER TelemetryBinding source unit to `kW`;
3. verify a live sample normalizes `0.05562 kW -> 55.62 W`;
4. verify contractual presentation remains `0.05562 kW`;
5. assess historical data separately before any backfill or correction;
6. record the commissioning/evidence revision.

This preserves one canonical internal unit while allowing source-specific wire units.
