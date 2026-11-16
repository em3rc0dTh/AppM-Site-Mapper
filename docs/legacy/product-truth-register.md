# Product Truth Register

Status: G1 working register.

This file records what is confirmed, conflicted or still unknown. It prevents future implementation from converting assumptions into architecture.

## Confirmed by current legacy code

- Hierarchical navigation exists from Site down through room/rack/device contexts.
- Blueprint contains real spatial calculations, not only mock rendering.
- The physical tile constant is 600 mm.
- CAS has AVAILABLE, RESERVED and EQUIPPED states.
- CAS supports split, free and device mount workflows.
- Rack elevation visualizes physical/reserved/clearance concepts.
- BDFB internal structure includes Shelf, Frame, Panel and Breaker/Holder concepts.
- Power Path UI represents a source breaker/panel/device toward target equipment.
- MQTT data is proxied server-side into an SSE stream consumed through EventSource.
- The runtime contains both PascalCase and lowercase MongoDB collection conventions.
- A Prisma MongoDB schema exists but is not the sole runtime persistence authority.
- Role names Superadmin, Admin and Standard exist.

## Confirmed architectural conflicts

### Session documentation versus code

Historical security documentation states that the active session resolves the authoritative role from MongoDB.

The frozen current implementation does not support that statement: session identity/role data is derived from cookies.

MK1 treats the code-level behavior as the current legacy fact and the historical statement as stale documentation.

### Prisma schema versus runtime data model

The Prisma file describes a reference-oriented model, while runtime code also reads/writes raw MongoDB collections and increasingly nested structures.

There is no single legacy persistence contract to carry forward.

### Canonical terminology

Legacy code and documents use overlapping terms such as:

- Room / Substructure;
- Cluster / ContainerCluster / Bay;
- Container / Rack.

G1 records the conflict. G2 resolves it.

## Known but not yet externally verified

- production collection counts;
- production data consistency;
- real MQTT event rate;
- current operational deployment environment;
- required concurrent-user scale;
- backup/recovery objectives;
- telemetry retention;
- final RBAC permission matrix.

## Truth rule

A future MK1 implementation decision may rely on this register only where the item is marked confirmed.

Unknowns must remain explicit inputs or be resolved by an accepted ADR/domain contract.
