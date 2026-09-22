# Legacy Domain Findings

Status: G1 evidence for the future canonical domain contract. This document records observed legacy vocabulary and behavior; it does not freeze MK1 terminology.

## Observed hierarchy

The strongest recurring hierarchy across routes, data access and reference schemas is:

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room / Substructure
                └── Cluster / ContainerCluster / Bay
                    └── Position
                        └── Container / Rack
                            └── Device
```

Device internals observed in the BDFB path include:

```text
Device
└── Shelf
    └── Frame
        └── Panel
            └── Holder / Breaker
```

## Confirmed domain concepts

Evidence supports the existence of these concepts as product vocabulary or implemented behavior:

- physical sites, structures, levels and rooms;
- room polygons and grid-based spatial placement;
- rack/container positions;
- devices with serial/category identity;
- rack capacity measured in U;
- CAS occupancy states and reserved ranges;
- shelves, frames, panels and breakers/holders for BDFB-like equipment;
- A/B provisioning concepts;
- source-to-target power-path relationships;
- pinned devices;
- realtime device telemetry;
- user roles named Superadmin, Admin and Standard.

## Naming conflicts that G2 must resolve

### Room vs Substructure

Runtime code uses both terms. G1 does not assume they are synonyms by product intent, even though compatibility code maps between them.

### Cluster vs ContainerCluster vs Bay

Legacy naming is inconsistent across persistence, components and product language. G2 must select one canonical noun and define whether a Bay is the same concept or a different physical grouping.

### Container vs Rack

Legacy UI and routes often say Container while operational behavior represents rack-like physical equipment. G2 must decide whether Rack is the canonical entity, whether Container remains a broader abstraction, or whether both are distinct.

## Aggregate-boundary conflicts

The legacy code does not provide one consistent aggregate model.

Examples:

- Prisma models many Device -> Shelf -> Frame -> Panel -> Breaker relationships as referenced entities.
- Runtime device/BDFB creation can construct nested structures as part of one action.
- CAS mounting is coupled to both rack occupancy and device construction.
- Power relationships are partly represented through nested UI-facing data.

These conflicts are evidence for G2/G3; they are not candidates for direct persistence migration.

## Lifecycle questions not answered by GitHub evidence

G2 requires explicit decisions for:

- archive versus hard delete;
- parent deletion with children;
- moving a rack between positions;
- moving a device between racks;
- whether device identity survives placement changes;
- whether CAS is persisted state or derived from rack/device placement;
- whether electrical paths are persisted graphs or derived projections;
- uniqueness scope for serial numbers and labels;
- audit/version behavior.

## G2 entrance condition

G2 may begin once:

1. confirmed legacy concepts are separated from naming conflicts;
2. external unknowns remain explicitly registered;
3. no persistence assumption is treated as domain truth;
4. every candidate domain concept can be traced to legacy evidence or a later explicit MK1 decision.
