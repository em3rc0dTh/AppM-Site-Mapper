# Clean-room CRUD acceptance

## Purpose

Validate Site Mapper MK1 from an empty MongoDB dataset created by the tester through the product UI. This mode must not seed topology, migrate legacy inventory, reuse customer topology, or require MQTT.

## Isolation contract

The clean-room launcher uses:

- `MONGODB_CRUD_DB_NAME`, defaulting to `site_mapper_crud_acceptance`.
- `APP_PERSISTENCE=mongodb`.
- `TELEMETRY_ENABLED=false`.
- no topology seed.
- first-user bootstrap only when explicitly started with `local:mongo-crud:new`.

It must refuse `local:mongo-crud:new` when that CRUD database already contains canonical topology nodes, users, or active power paths. Continue an existing acceptance run with `local:mongo-crud`.

The normal `MONGODB_DB_NAME` inventory is not selected by CRUD mode.

## First run

Optionally choose a unique acceptance database in ignored `.env.local`:

```dotenv
MONGODB_CRUD_DB_NAME=site_mapper_crud_acceptance_01
```

Then:

```powershell
git switch feat/mk1-raw-build
git pull --ff-only
npm ci
npm run local:mongo-crud:new
```

The launcher creates only the explicitly requested first application administrator. It does not create topology. After sign-in, open `/network`. The expected initial product state is **No networks yet** with the Network creation form available to a user with `topology:write`.

For later sessions of the same test dataset:

```powershell
npm run local:mongo-crud
```

## Acceptance path

Create the hierarchy only through Site Mapper:

```text
NETWORK
  -> SITE
    -> STRUCTURE
      -> LEVEL
        -> ROOM / SUBSTRUCTURE
          -> CLUSTER / BAY
            -> POSITION
              -> RACK / CONTAINER
                -> DEVICE / EQUIPMENT
```

Record the generated IDs only as evidence; do not inject them back into MongoDB manually.

## Blueprint acceptance

For a room, exercise the room and layout paths using the UI:

1. define or update the room polygon;
2. enter Blueprint edit mode;
3. create a cluster/bay footprint;
4. create positions on the 600 x 600 mm grid;
5. create racks with footprint dimensions and U capacity;
6. save;
7. reload the page and confirm persistence;
8. edit names/geometry supported by the layout editor and save again;
9. remove an empty rack, then a position, then a cluster in dependency-safe order;
10. verify invalid geometry, collisions and stale-version conflicts are rejected rather than silently persisted.

Layout saves are expected to be atomic and version-checked.

## CRUD truth at the start of this acceptance

Do not label unsupported operations as passed.

### Topology API

Currently supported:

- Create: `POST /api/topology`.
- Read: `GET /api/topology` and `GET /api/topology/:id`.
- Lifecycle update: archive and restore through `PATCH /api/topology/:id`.
- Parent update: move is supported only for racks, devices and equipment, subject to domain constraints.

Not currently implemented as a general topology operation:

- arbitrary rename/property update for an existing topology node;
- physical `DELETE /api/topology/:id`.

Therefore a claim of full generic CRUD for topology is not valid until those operations exist and have UI coverage.

### Blueprint/layout

The layout editor supports create/update/remove semantics for clusters, positions and racks inside the room layout transaction. Removal is represented by archiving omitted topology nodes during an atomic layout commit; it is not a physical MongoDB delete.

## Evidence to capture

For each action record:

- screen before action;
- action performed;
- visible result;
- page reload result;
- expected API status if a failure is intentionally tested;
- whether the object remains correct after application restart.

Classify each item as `PASS`, `FAIL`, or `GAP`. A missing product capability is `GAP`, not `PASS`.

## Safety

Never point `MONGODB_CRUD_DB_NAME` at the current production/customer-style test inventory. The clean-room launcher intentionally uses a separate database variable so CRUD certification cannot silently overwrite the existing Site Mapper dataset.
