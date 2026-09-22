# ADR-004 — MongoDB Aggregate Boundaries

**Status:** Accepted  
**Gate:** G3

## Collections

### topology_nodes

Stores the accepted navigable hierarchy:

- Network;
- Site;
- Structure;
- Level;
- Room / Substructure;
- ContainerCluster / Bay;
- Position;
- Container / Rack;
- Device;
- Equipment.

Every document has one stable domain `id`, one `kind`, lifecycle metadata and its canonical `parentId`.

### Embedded aggregate state

- CAS is embedded within Container/Rack because it is rack-owned occupancy state.
- Shelf -> Frame -> Panel -> Breaker/Holder is embedded within Device because it is Device-owned BDFB structure.

### Separate aggregates

`power_paths` is separate because PowerPath has independent identity and references endpoints across Device/Equipment/internal electrical structures.

Later gates add dedicated identity/session/audit and telemetry collections without changing the topology model.

## Prohibited

- duplicate PascalCase/lowercase collection aliases;
- separate legacy collections for each historical noun;
- embedding Equipment beneath Device;
- persisting Zone;
- UI-shaped persistence documents.
