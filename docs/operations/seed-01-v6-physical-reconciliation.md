# Seed-01 v6 · Physical topology reconciliation

## Authority and boundaries

The operator's local `seed-01` Mongo snapshot reported `runtime_seed_state.version=4` and 115 topology nodes (including archived nodes), all reachable from the Site Mapper NETWORK. This snapshot is the spatial reference for **active** topology of the Telxius Lurín test installation. This change does not claim to recreate the archival metadata or exact historical UUIDs on a virgin database.

The baseline v5 had a generic QDF Bay and fabricated rectangular footprints. A fresh v6 database instead creates:

```text
NETWORK Site Mapper
└── SITE Telxius Lurín Cable Landing Station
    └── STRUCTURE EDIFICIO PRINCIPAL
        └── LEVEL LEVEL 00
            └── ROOM SALA DE TRANSMISIONES
                ├── BAY Contained-Cluster-01
                │   └── POSITION QDF2 anchor (T42)
                │       └── RACK QDF2 42U 600x600 (24600,11400)
                ├── BAY Contained-Cluster-02 (empty)
                ├── BAY Contained-Cluster-03
                │   └── POSITION QDF4 anchor (Z42)
                │       └── RACK QDF4 42U 600x600 (24600,15000)
                └── BAY CONTAINED-CLUSTER-04
                    └── POSITION QDF5 anchor (AC42)
                        └── RACK QDF5 42U 600x600 (24600,16800)
```

The spatial polygon constants in `src/seeds/seed-01.ts` are derived from the operator snapshot. Existing BDFB Equipment, SNMP/MQTT controlled fixtures and the QDF-2/4/5 breaker schedules remain in the existing seeder.

## Upgrade behavior

- **Existing v4 DB with matching active spatial geometry:** reuse existing named nodes, racks, IDs, CAS, root Equipment and archives; apply any remaining seed-specific industrial changes.
- **Fresh DB:** create the active spatial topology represented above, then the BDFB hierarchy through the normal topology domain service. Generated IDs are new; **archived v4 Room and retired A1/B1 panel records are not recreated on a fresh DB**.
- **Existing synthetic v5 DB with incompatible layout:** fail with `SEED_01_PHYSICAL_CONFLICT`, without automatically moving racks or overwriting geometry. An explicitly reviewed migration is required.
- A rack's confirmed placement must match its authoritative coordinates; a missing placement is filled only for a newly created rack. Conflicting existing placement is rejected.
- No `down -v`, dropped collection, re-seeding command or destructive migration is part of this change.

## Acceptance gates before main/release

1. Back up the operator's Mongo volume, verify its readable restore, and retain the local full EJSON snapshot outside public GitHub.
2. On a separate empty database, compare active tree node counts, normalized names, kind/parent paths, polygons, Position coordinates, rack dimensions/placements, CAS occupancy, device/equipment types, and breaker aliases with the operator snapshot.
3. On an isolated copy of v4, confirm no existing ID, archived tombstone, revision history or telemetry relationships are lost.
4. For v5 synthetic installations, implement a separate deliberate data migration; don't bypass the conflict guard.
5. Validate UI visual parity, including an empty second Bay, rack location and panel order.
6. Preserve field-commissioning boundaries: controlled SNMP/MQTT observations are not physical acceptance evidence.

**Not included:** importing the full 115-node snapshot into source control or supplying a byte-identical historical clone. To achieve archival and UUID parity on a fresh installation, use a reviewed private snapshot import with collision/reference checks; do not publish site-specific operational details or lab credentials in the public repo.
