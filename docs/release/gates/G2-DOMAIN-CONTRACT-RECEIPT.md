# G2 — Canonical Domain Contract Receipt

**Status:** IN PROGRESS — TOPOLOGY SEALED

## Inputs

- binding MK1 reconstruction contract;
- sealed G1 Product Truth evidence;
- explicit product hierarchy decision;
- legacy external-information register.

## Sealed topology decision

The following hierarchy is accepted:

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room / Substructure
                └── ContainerCluster / Bay
                    └── Position
                        └── Container / Rack
                            ├── Device
                            │   └── Shelf
                            │       └── Frame
                            │           └── Panel
                            │               └── Breaker / Holder
                            └── Equipment
```

Key decision:

> Device and Equipment are siblings at the same hierarchy level beneath Container / Rack.

The prior `Zone` proposal is removed.

## Current deliverables

- accepted topology hierarchy;
- accepted ADR-001 terminology/hierarchy decision;
- canonical domain contract updated to reflect the decision;
- module/domain boundaries;
- lifecycle and identity principles;
- rejected domain-drift rules;
- remaining decision register.

## Non-goals

G2 still does not implement:

- MongoDB collections;
- Prisma models;
- repositories;
- authentication;
- MQTT;
- Blueprint renderer;
- CAS persistence;
- UI migration.

## Remaining gate work

G2 remains open for:

- lifecycle/delete/archive rules;
- identifier strategy;
- movement semantics;
- CAS ownership;
- BDFB aggregate details;
- PowerPath semantics;
- any required technical naming resolution for slash-pairs.

## Gate rule

The topology itself is now sealed.

G2 as a whole remains IN PROGRESS until its remaining invariants are sufficient for G3 Persistence Contract without guessing.
