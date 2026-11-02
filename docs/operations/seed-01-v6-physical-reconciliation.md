# Seed-01 v6 · Physical topology reconciliation

## Authority and boundaries

The operator's local `seed-01` Mongo snapshot reported `runtime_seed_state.version=4` and 115 topology nodes (including archived nodes), all reachable from the Site Mapper NETWORK. This snapshot is the spatial reference for **active** topology of the Telxius Lurín test installation. This change does not claim to recreate the archival metadata or exact historical UUIDs on a virgin database.

The baseline v5 had a generic QDF Bay and fabricated rectangular footprints. A fresh v6 database instead reconstructs 115 reference topology nodes, including seven archived nodes (one Room and six A1/B1 panels):

```text
NETWORK Site Mapper
└── SITE Telxius Lurín Cable Landing Station
    └── STRUCTURE EDIFICIO PRINCIPAL
        └── LEVEL LEVEL 00
            ├── ROOM SALA DE TRANSMISIONES (ARCHIVED, historical irregular polygon)
            └── ROOM SALA DE TRANSMISIONES (ACTIVE)
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
- **Fresh DB:** create the active spatial topology represented above, then the BDFB hierarchy through the normal topology domain service. Generated IDs are new; the archived v4 Room geometry and six retired A1/B1 panel records are recreated as archived reference nodes. Their domain UUIDs and retirement actor/event metadata remain generated/unspecified on a fresh DB; use private snapshot restore for historical identity.
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

## Private exact-identity laboratory reproduction

Use the private `seed-01-topology-full.json` exported on the operator workstation, not a checked-in fixture. This **only** restores the 115-node topology and `runtime_seed_state` marker; it does **not** restore all telemetry, industrial histories, users, credentials, alarms or Timescale data.

From the project root, with a Mongo replica set available on a lab endpoint:

```bash
node scripts/seed-01-restore-lab.mjs \
  --snapshot ./seed-01-topology-full.json \
  --uri 'mongodb://127.0.0.1:27017/?directConnection=true' \
  --database seed-01-restore-lab \
  --confirm seed-01-restore-lab

node scripts/seed-01-parity.mjs \
  --snapshot ./seed-01-topology-full.json \
  --uri 'mongodb://127.0.0.1:27017/?directConnection=true' \
  --database seed-01-restore-lab --exact-ids
```

Only after exact-identity parity passes should an authorized operator run the application v6 against this **lab copy**, then re-run the parity command (with and without `--exact-ids`). Never point a live installation at the restored lab without changing credentials/ports and authorizing a test.

The lab restore refuses any existing destination database, confirms a constrained lab name, validates the source inventory and seven historical tombstones, and uses a transaction. It never modifies the operator's source database.

## Archived panels

The six A1/B1 panels were intentionally retired in the original v4 snapshot. v6 **does not reactivate** existing tombstones. On a fresh synthesized installation it creates their tombstones and leaves frame slot 3 unoccupied. The historical Room polygon is present as an archived reference on a fresh bootstrap. Its original domain ID and exact `retirement` metadata can only be reproduced from the private snapshot.

## Parity meaning

The read-only parity tool compares paths, active/archive lifecycle, physical footprints, rack placement, equipment structure, positional slots and key equipment properties, with an optional domain-ID check. It intentionally excludes revision, created/updated timestamps, `retirement` actor IDs, CAS range IDs and generated access-port IDs. Thus `differences=0` is **logical parity**, not byte-for-byte replication. For historical identity and complete event audit, use the private EJSON and separately inspect all associated collections; do not claim full operational equivalence from topology parity alone.

## Execution status

Code staged on a draft PR. No local WSL/Docker runtime, database, build, test, live integration or deployment was accessed or run through GitHub. The operator retains sole authority for actual lab execution and release certification.
