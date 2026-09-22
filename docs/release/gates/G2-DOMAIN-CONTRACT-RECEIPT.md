# G2 — Canonical Domain Contract Receipt

**Status:** PASS

## Inputs

- binding MK1 reconstruction contract;
- sealed G1 Product Truth evidence;
- explicit accepted topology decision;
- legacy external-information register.

## Accepted topology

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

## Sealed domain decisions

- Device and Equipment are sibling topology entities.
- Slash-pairs are same-level variants, not extra hierarchy.
- Zone is rejected.
- IDs are stable opaque UUIDv4 values.
- Lifecycle is ACTIVE / ARCHIVED.
- Movement preserves entity identity.
- CAS is owned by Container/Rack and is not a topology node.
- BDFB is a specialized Device capability/type.
- PowerPath is an explicit aggregate.
- Telemetry identity is an external binding to Device/Equipment identity.
- Generic dynamic CRUD is prohibited.

## Evidence

Authoritative documents:

- `docs/domain/topology-hierarchy.md`
- `docs/domain/domain-contract.md`
- `docs/domain/invariants.md`
- `docs/adr/ADR-001-domain-terminology.md`
- `docs/adr/ADR-005-identifiers.md`
- `docs/adr/ADR-010-cas-domain-ownership.md`
- `docs/adr/ADR-011-bdfb-power-domain.md`

## Gate verdict

**PASS — G3 Persistence Contract is authorized after this branch passes CI and is integrated into `main`.**

No persistence implementation was used to decide the domain.
