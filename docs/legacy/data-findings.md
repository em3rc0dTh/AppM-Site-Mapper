# Legacy Data Findings

Status: evidence only. No MK1 persistence decision is made here.

## Competing representations observed

The legacy repository contains at least three overlapping persistence representations:

1. A Prisma MongoDB reference schema.
2. Raw MongoDB runtime access using PascalCase collection names.
3. Raw MongoDB legacy access using lowercase collection names.

`lib/data-service.ts` and `lib/actions/crud.ts` explicitly contain compatibility reads across names such as:

- `Device` and `devices`;
- `Container` and `containers`;
- `ContainerCluster` and `clusters`;
- `Position` and `positions`;
- `Substructure` and `rooms`;
- `Level` and `levels`;
- `Structure` and `structures`;
- `Site` and `sites`.

This is migration debt, not a canonical MK1 pattern.

## Prisma reference hierarchy

The Prisma file models the following reference chain:

`Site -> Structure -> Level -> Room -> Cluster -> Position -> Container -> Device -> Shelf -> Frame -> Panel -> Breaker`.

The schema also carries fields that are relevant as evidence:

- legacy/original identifiers on several topology entities;
- polygons on Site, Structure, Room and Cluster;
- grid coordinates on Position;
- width and height on Container;
- serial number, category and pinned state on Device;
- panel capacity/usage;
- breaker target-equipment index.

## Runtime drift

Runtime code increasingly treats some device/BDFB structures as nested documents while the Prisma file models many of them as separate referenced models.

Therefore MK1 must not implement repositories until G2/G3 explicitly decide:

- aggregate boundaries;
- embedded versus referenced data;
- identifier strategy;
- collection names;
- indexes and uniqueness;
- lifecycle and deletion behavior;
- audit/version fields.

## Migration rule

Legacy aliases may exist only inside `scripts/migrations/legacy/`.

Runtime MK1 modules must never need to ask whether a device lives in `Device` or `devices`.
