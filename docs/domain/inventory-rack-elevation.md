# Device / Equipment and Rack Elevation

**Gate:** G8

## Hierarchy

Device and Equipment remain sibling inventory nodes beneath Container / Rack.

```text
Container / Rack
├── Device
└── Equipment
```

Neither kind may be normalized into the other.

## Identity versus placement

Inventory identity is stable across movement. Placement is expressed by the topology parent relationship and rack CAS allocation.

Moving inventory does not create a new identity.

## Metadata

Both Device and Equipment support:

- stable domain ID;
- name;
- optional serial number;
- optional category;
- optional type;
- pinned state;
- lifecycle.

Type remains kind-specific internally: `deviceType` for Device and `equipmentType` for Equipment.

## Rack Elevation

Rack Elevation is a projection of the authoritative Rack CAS state.

It does not maintain a second occupancy model.

The renderer displays U values top-down while the CAS coordinate contract keeps U1 at the physical bottom.

Each U is projected as:

- AVAILABLE;
- PHYSICAL portion of a RESERVED/EQUIPPED allocation;
- CLEARANCE portion of a RESERVED/EQUIPPED allocation.

An EQUIPPED allocation must resolve to an active Device or Equipment child of the same rack.
