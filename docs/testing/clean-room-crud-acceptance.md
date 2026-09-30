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

## Spatial implementation delivery — 2026-09-30 (not certified)

The user explicitly requested execution and GitHub push **without tests**. No
unit/integration/browser tests, typecheck, lint, production build or database
acceptance run were executed for this delivery. No tests were added. Commit
messages request `[skip ci]`; no green CI or release gate is claimed.

Implemented source changes:

- A controlled Create Site/Room action replaces the explorer's conflicting
  native disclosure positioning. Metadata appears above the dock inside the
  viewport; Define boundary opens a stage-local drawing surface.
- Site/Room creation keeps metadata and polygon local until explicit Save,
  then POSTs the complete entity. Cancel does not insert an incomplete entity.
- A shared light canvas supports vertices, open-edge preview, Finish boundary,
  vertex dragging, edge insertion, removal, Undo, Clear, Cancel, optional grid
  snapping, pan and zoom. No coordinate textboxes or default rectangles.
- Site boundary editing uses optimistic concurrency. The Site explorer displays
  the saved boundary even when it has no structures; area derives from polygon.
- Room/Bay boundary changes apply to the local layout draft. SAVE LAYOUT remains
  the only persistence operation; it validates all boundaries and rack footprints.
- Rack/Position placement and moves use canvas clicks, with separately specified
  width, depth and rack U capacity. Existing rack capacity remains immutable
  without a CAS migration; name/footprint updates and same-bay reassignment remain.
- Domain validation rejects malformed polygons, crossings, degeneracy, concave
  boundary escapes, invalid placement/capacity and rack collisions. Server write
  permission checks remain authoritative. Archived ancestors reject spatial writes.

### Manual sequence for the operator (not executed in this delivery)

1. Continue the existing dataset with `npm run local:mongo-crud`, **not** `:new`.
   Use the existing Perú Network; do not seed/reset/import any topology.
2. Open the Network, click CREATE SITE, enter a name, choose Define boundary.
   Draw at least three vertices, Finish boundary, Save Site. Open the new Site.
3. Reload and compare the boundary. Click EDIT BOUNDARY, move a vertex, insert
   another by clicking an edge, remove a selected vertex, exercise Undo/Cancel.
   Save an intentional edit, reload and compare it again.
4. Create Structure → Level. Create Room with its name/type and a drawn boundary.
   Open the Room Blueprint → EDIT ROOM → edit/apply its boundary.
5. Draw a Bay/Cluster inside the Room and Apply to draft. SAVE LAYOUT and reload.
   Select the Bay visually or in the inspector and edit/apply/save its boundary.
6. Choose Place Rack, enter name, Bay, footprint width/depth and capacity. Click
   a valid cell in the Room. SAVE LAYOUT; reload. Select the rack and move its
   anchor by canvas click; edit supported properties and save again.
7. Exercise degenerate/self-crossing polygons, concave escapes, Bay outside Room,
   rack outside Bay/Room, collisions, unauthorized writes and two-tab stale saves.
   Invalid changes must remain unpersisted. Exercise Cancel, reload, restart and
   deep-link recovery. Record actual results, never assume success from this code.
8. Remove empty rack → position → bay in dependency order and save. Removal
   archives existing objects; it never physically deletes records. Restore is
   available at the topology application/API layer; a dedicated archived-object
   restore control in Blueprint is still a UI GAP.

### Acceptance status and remaining gaps

| Capability                                       | Current evidence                            |
| ------------------------------------------------ | ------------------------------------------- |
| Create Network                                   | Prior user-reported PASS; not repeated here |
| Canvas Site/Room/Bay creation and edits          | Implemented; execution/acceptance pending   |
| Viewport, pointer transform, Undo, Cancel        | Implemented; visual acceptance pending      |
| Persistence, reload, restart, deep-link recovery | Implemented paths; acceptance pending       |
| Domain/auth/concurrency rejection                | Implemented; runtime acceptance pending     |
| Generic topology rename/property update          | GAP (layout-specific updates only)          |
| Physical topology DELETE                         | GAP; archive is not delete                  |
| Blueprint archived-object restore control        | GAP; existing restore API retained          |
| Tests, build, CI certification                   | Not executed / not certified by instruction |

No running MongoDB inventory was connected to or modified during implementation.
No clean-room database was recreated. MQTT mappings, TimescaleDB, BDFB and
telemetry implementation were not changed. `main` is not the delivery target;
all changes belong on `feat/mk1-raw-build`, without merge.


## Virtual Warehouse acceptance

The reusable hardware catalog is separate from physical inventory.

Acceptance sequence:

1. open `/warehouse`;
2. create a DEVICE template with manufacturer/model/category/U size and dimensions;
3. reload and verify the template persists;
4. open a Rack;
5. choose `MOUNT FROM WAREHOUSE`;
6. select the template and enter only instance-specific identity such as name and serial number;
7. create the instance;
8. verify Rack Inventory shows the instance as `UNMOUNTED` and shows template provenance/version;
9. reload and verify the instance and provenance persist;
10. use CAS to reserve U and equip the instance;
11. verify the Rack elevation changes from reserved capacity to equipped capacity.

The template itself must never occupy U. CAS mounts a physical topology instance, never a Warehouse template.

`CREATE ONE-OFF` is an exception path and should not be used to duplicate reusable models during catalog acceptance.

Current gaps: template edit/version bump UI, template archive/restore UI, bulk instantiation, and atomic instantiate+CAS mount are not yet certified.
