# Site Mapper MK1 — Accepted Topology Hierarchy

**Status:** ACCEPTED  
**Gate:** G2 — Canonical Domain Contract  
**Decision date:** 2026-09-22

## Authoritative hierarchy

The Site Mapper MK1 topology preserves the following hierarchy:

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

This hierarchy is a product/domain decision and supersedes the earlier G2 proposal that introduced `Zone`.

## Slash notation

A slash does **not** introduce another hierarchy level.

The following pairs occupy one and the same hierarchical slot:

- `Room / Substructure`;
- `ContainerCluster / Bay`;
- `Container / Rack`;
- `Breaker / Holder`.

The persistence and implementation naming strategy may later define one technical identifier for each accepted concept, but it must preserve this domain hierarchy and its product vocabulary.

No extra intermediary level may be inserted merely to normalize these paired labels.

## Device and Equipment

`Device` and `Equipment` are at the **same hierarchical level**.

Both are direct children of:

```text
Container / Rack
```

Therefore this is correct:

```text
Container / Rack
├── Device
└── Equipment
```

and this is incorrect:

```text
Container / Rack
└── Device
    └── Equipment
```

### Device internal structure

A Device may own the confirmed internal hierarchy:

```text
Device
└── Shelf
    └── Frame
        └── Panel
            └── Breaker / Holder
```

That internal structure does not change the fact that `Device` and `Equipment` have equal topology rank beneath `Container / Rack`.

## Persistence rule

G3 must design persistence around this hierarchy.

Persistence is not allowed to:

- move Equipment beneath Device;
- insert a Zone between Room/Substructure and ContainerCluster/Bay;
- flatten Position away;
- collapse Container/Rack into Position;
- promote Shelf, Frame, Panel or Breaker/Holder into the same topology rank as Device/Equipment without a later explicit domain amendment.

## Migration rule

Legacy records must be transformed to this hierarchy.

Compatibility aliases may be handled inside migration tooling, but the resulting MK1 domain relationships must resolve to this accepted structure.

## Change control

Changing this hierarchy requires an explicit G2/domain-contract amendment.

It must not change implicitly because of a database schema, route structure, UI component or legacy collection name.
