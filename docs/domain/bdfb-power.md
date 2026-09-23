# BDFB and Power Domain

**Gate:** G9  
**Status:** Accepted

## BDFB

BDFB is a Device specialization. It does not introduce a topology level.

```text
Device(BDFB)
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

BDFB structure is configured independently from rack placement/CAS.

IDs are unique inside the Device-owned structure. Panel endpoint labels are unique within a Panel.

## PowerPath

PowerPath is a separately persisted aggregate.

It contains:

- stable ID;
- source endpoint;
- target endpoint;
- optional A/B feed;
- optional label;
- lifecycle.

An endpoint always starts at an ACTIVE Device or Equipment.

Internal endpoint paths may only traverse a Device BDFB and must resolve in order:

```text
Device
→ Shelf
→ Frame
→ Panel
→ Breaker / Holder
```

A PowerPath may therefore represent a breaker feeding a sibling Equipment without nesting Equipment below Device.

## Truth boundary

UI overlays and labels render PowerPath. They never define or reconstruct electrical truth.
