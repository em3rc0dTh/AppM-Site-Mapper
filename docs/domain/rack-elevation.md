# Device / Equipment Inventory and Rack Elevation

**Gate:** G8  
**Status:** Accepted

## Inventory

Device and Equipment remain direct siblings beneath Container/Rack.

```text
Container / Rack
├── Device
└── Equipment
```

Rack inventory queries return both kinds without nesting one beneath the other.

## Elevation

Rack Elevation is a read projection derived from:

- Rack totalU;
- authoritative CAS ranges;
- active Device/Equipment children.

It is not separately persisted.

U rows render from highest U to U1.

A non-available allocation distinguishes:

- physical Device/Equipment footprint;
- top/bottom clearance;
- RESERVED but not yet equipped capacity.

This allows the UI to show the physical rack accurately while preserving CAS as the source of occupancy truth.
