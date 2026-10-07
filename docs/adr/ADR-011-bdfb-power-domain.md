# ADR-011 — BDFB and Power Domain

**Status:** Accepted — aligned with Canonical Domain Contract v1.2  
**Gate:** G9  
**Supersedes:** the earlier Device-owned BDFB sub-schema interpretation.

## BDFB decision

BDFB is a specialized `DeviceType`, not a topology level and not a second physical
persistence model.

Its physical composition is expressed exclusively through canonical recursive Equipment:

```text
Device(BDFB)
└── Equipment(CHASSIS)
    └── Equipment*
        └── Equipment*
            └── ...
```

Typical physical Equipment types include `SHELF`, `FRAME`, `PANEL` and
`CIRCUIT_BREAKER`, but no intermediate type is mandatory unless the represented hardware
actually contains it.

Fixed child positions use:

```text
childMode = POSITIONAL
children[index] = EquipmentId | null
```

There is no runtime `Holder` entity.

The BDFB application surface is a read/projection layer over this Equipment graph. It
must never materialize a parallel BDFB hierarchy.

## PowerPath decision

PowerPath is an explicit aggregate with stable identity and physical AccessPort endpoints:

```text
AccessPort → AccessPort
```

A circuit breaker is Equipment and owns its POWER OUTPUT AccessPort. Loads own their
POWER INPUT AccessPorts.

Feed A/B is PowerPath/domain metadata; the UI renders it but does not infer electrical
truth from visual placement.

## Consequences

- BDFB composition uses the same recursive Equipment write path as all other hardware.
- There is no BDFB-specific structure-write API or materialization service.
- Shelf and Frame are optional physical Equipment.
- Rack CAS remains independent from internal Equipment composition.
- BDFB projection may specialize presentation without changing canonical parent/child links.
- PowerPath persistence references AccessPorts, not presentation-only endpoint paths.
- TelemetryBinding observes Device/Equipment/AccessPort identity without redefining it.
