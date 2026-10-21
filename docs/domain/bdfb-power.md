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

## DC input feeds and SNMP

An incoming BDFB feed is represented by a distinct external
`AccessPort(POWER, INPUT)` on real BDFB Equipment. Separate feeds are independent
electrical connections; their measured current must not be inferred from the
A/B placement of panels or the number of installed breaker positions.

Commissioned `TelemetryBinding(protocol=SNMP, sourcePointId=OID,
targetType=ACCESS_PORT)` connects controller readings to the exact input feed.
Do not create a parallel BDFB tree. The shunt rating may be recorded as
measurement metadata and does not require a physical SHUNT Equipment in MK1.

Only complete, fresh, non-overlapping feeder measurements can be aggregated
as whole-BDFB input current. This total **does not** become an individual
panel/breaker measurement, and does not replace breaker MQTT history or the
canonical Breaker OUTPUT → Load INPUT PowerPath.

See [SNMP input feed integration](../telemetry/snmp-feed-ingestion.md).

## Hardware profile · ELTEK_BDCBB_CONFIG_4 (2026-10-21 addendum)

The canonical Device/Equipment/AccessPort/PowerPath hierarchy **does not change**.
A verified BDCBB Configuration 4 cabinet contains four independent DC incoming
terminal/shunt paths: Side A → **A1, A2** and Side B → **B1, B2**, each connected
to its own physically inventoried PANEL. Each panel's breakers are downstream
of its own bar/shunt; panel current cannot be inferred from an aggregate input.
The presentation may display A2/B2 above A1/B1 without changing Equipment parentage.

Manufacturer profile facts (validate on each installed cabinet): **800 A rated
input/panel**, **1000 A/60 mV shunt**, initial **640 A overload warning
threshold** (configurable). The installation's full breaker-position count is
not inferred merely from the simplified electrical schematic. No assumption of
two physically separate plants, N+1 redundancy, four independent SNMP agent
addresses, or real Delta OID accessibility is encoded.

An authorized operator explicitly selects `ELTEK_BDCBB_CONFIG_4` for the BDFB
Device; every active SNMP input AccessPort must then declare its unique
`feedPosition=A1|A2|B1|B2`, the matching A/B `feed` side, rated/shunt
measurements and exactly one distinct `servedPanelIds` reference.
Site Mapper refuses duplicate feeder identities or a panel wired to two
input profiles. Missing or unverified inputs keep the total null even if
two reported values happen to sum correctly. The raw manufacturer diagram and
field electrical schedule, not panel names or visual positions, determine
how the real inputs map to AccessPorts.

This section appends to the accepted G9 contract. See the full domain addendum
in [Canonical v1.2](contracts/v1.2/domain-contract.md) and the runtime
[SNMP contract](../telemetry/snmp-feed-ingestion.md).
