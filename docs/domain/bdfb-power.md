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

### Canonical Frame / physical presentation rule

A Frame always exists in the canonical data model. Customer equipment may, however, expose no distinct physical frame. In that case the Frame remains the parent of its Panels and retains its stable identity for PowerPath resolution, but presentation marks it as physically implicit:

```ts
frame.presentation = {
  physicalFrameVisible: false
}
```

The UI then renders the Panels directly under the Shelf while preserving the canonical hierarchy:

```text
canonical truth              physical presentation

Shelf                        Shelf
└── Frame (implicit)   ->     ├── Panel A
    ├── Panel A               └── Panel B
    └── Panel B
```

This is presentation metadata only. It must never re-parent Panels, change endpoint IDs, or create a second BDFB schema.

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
