# BDFB and Power Domain

**Gate:** G9  
**Status:** Canonical for Domain Contract v1.2

## BDFB

BDFB is a Device specialization:

```text
Device.deviceType = BDFB
```

It does not introduce a topology level or its own persisted child schema.

### Physical composition

All physical composition uses recursive Equipment.

A valid real installation may be:

```text
Device(BDFB)
└── CHASSIS
    └── SHELF
        └── FRAME
            └── PANEL
                └── CIRCUIT_BREAKER
```

but these shorter paths are equally valid when they reflect the real hardware:

```text
Device → CHASSIS → PANEL → CIRCUIT_BREAKER
Device → CHASSIS → SHELF → PANEL → CIRCUIT_BREAKER
```

No Shelf or Frame may be invented merely to normalize appearance.

Every non-root Equipment obeys:

```text
child.parentEquipmentId = parent.id
parent.children contains child.id
```

For POSITIONAL Equipment:

```text
children.length = configured physical child capacity
children[index] = EquipmentId | null
```

A free position is `null`. There is no Holder entity.

### BDFB presentation

The BDFB physical view is a specialized read projection over canonical Equipment. It may
group direct-mounted panels for presentation, but presentation metadata must never
re-parent Equipment or create authoritative physical nodes.

There is no BDFB-specific structure-write endpoint. Users create/configure/move Equipment
through the canonical Topology/Warehouse Equipment flows.

## PowerPath

PowerPath is separately persisted and connects physical AccessPorts:

```text
sourceAccessPortId → targetAccessPortId
```

For a breaker source:

```text
Equipment(CIRCUIT_BREAKER)
└── AccessPort(POWER, OUTPUT)
```

For a load:

```text
Equipment(...)
└── AccessPort(POWER, INPUT)
```

Optional Feed A/B semantics belong to PowerPath and explicit redundancy policy. They are
not inferred from Equipment names or visual placement.

## Truth boundary

Topology/Equipment owns physical containment.
CAS owns Rack U occupancy.
PowerPath owns electrical connectivity.
TelemetryBinding owns source-to-domain observation mapping.
BDFB UI is a projection of those truths and never an alternate source of truth.
