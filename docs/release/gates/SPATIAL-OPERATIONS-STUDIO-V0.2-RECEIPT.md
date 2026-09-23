# Spatial Operations Studio v0.2 — implementation receipt

Date: 2026-09-23
Branch: `feat/spatial-authoring-engine-v0.1`
Existing draft PR: #29
Baseline: `138636d084f7b58516bfa39680c1f063182988a4`

## Status

IMPLEMENTATION COMPLETE / READY FOR LOCAL VISUAL REVIEW.

This is not a claim of PRODUCTION_READY or RELEASE_READY. The implementation now
covers the complete physical journey and is ready to be judged in the user's
local browser. The execution environment still cannot render the authenticated
local application, so final human visual acceptance at 1920×1080, 1600×900 and
1366×768 remains external to this receipt.

## Materialized

- Physical Device and Equipment front views, identity, real CAS placement and
  configured incoming/outgoing power relationships.
- BDFB chassis, Shelf, Frame, Panel and endpoint views addressed by URL query
  parameters on the canonical device route. Physical ancestry remains in the
  context tree, including the canonical implicit Frame.
- Explicit-frame chassis only when the presentation model allows it. Implicit
  frames retain their data identity and render panels directly under Shelf.
- Panel boards with distinct breaker switches and empty holders. Endpoint
  selection, details, assignment count, explicit opening and graphical feed
  tracing to actual destination deep links. Related feeds to the same destination
  appear together; configured feeds are not a proof of electrical redundancy.
- Power index stages now link to physical context, rather than ending in a drawer.
- Rack selection uses its local property rail so first click does not cover the
  device before a second click. Canonical rack links open the elevation.
- Viewport-fit cabinet CSS, proportional U blocks, physical/capacity properties,
  and full physical ancestry. An additional internal rack column no longer
  consumes the center width on desktop.
- Structure footprint plus a schematic vertical level selector. No persisted
  Level polygon, floor height or vertical dimension was introduced.
- Site/Level child polygons select on click, open on double click or explicit
  Open, and render above parent fills. Read interaction is disabled during edits.
- Blueprint Bay/Position selection, accessible annotation targets and canonical
  navigation. Bay extents remain derived from position coordinates. Bay pages use
  their parent room coordinate space and filter the racks to the actual Bay.
- Position shows a cabinet footprint with proportions from known dimensions;
  unknown dimensions remain explicitly schematic.
- Local Undo/Redo (up to 100 checkpoints), grouped vertex drag, midpoint insertion,
  deletion, drawing, two-point measurement, pan, zoom and fit. Room snapping stays
  600 mm; Site/Structure do not acquire forced snapping.
- Save keeps the existing authenticated SpatialService persistence boundary.
  Cancel restores server geometry. Network failures retain the draft. Entity
  changes remount drafts to avoid reusing another entity's editing state.
- Removed unsupported healthy/online labels; lifecycle is not live telemetry.
- Replaced the generic Network landing stage with a dedicated topology studio that
  previews actual Site boundary geometry when available and explicitly labels the
  overview as schematic rather than geographic.
- Added live cursor X/Y feedback to Spatial Authoring and arrow-key vertex nudging.
  Room edits nudge by the active 600 mm snap interval; unsnapped Site/Structure
  edits nudge by 100 mm.

## Evidence obtained

No automated test suite was run. No tests were created, changed or removed.
No CI result was awaited. TypeScript and targeted ESLint checks passed.

The actual Next.js development application ran with development-only in-memory
repositories and temporary locally generated credentials. Direct authenticated
HTTP requests returned 200 and server-rendered content for:

Network, Site, Structure, Level, Room, both Bays, three Positions, three Rack
routes and elevations, BDFB-A, Edge Router 01, Legacy Patch Panel 01, Compute
Node 01, Shelf, Panel, Breaker, Power trace and Blueprint.

Bootstrap returned 201, login 200 and development demo creation 201. Logout,
login again and the deep electrical URL returned 200 in the same running process.
The power trace response included the actual Compute Node 01 destination link.

These are compilation and server execution observations, not visual acceptance
or pointer-interaction evidence. In-memory survival across logout/login is not
MongoDB durability or process-restart persistence evidence.

## Remaining visual acceptance

No implementation phase remains open. Local human acceptance is still required
because this execution environment cannot render the authenticated application.
At each requested desktop viewport, inspect the full golden path and reverse
navigation. In particular: check that U1 is visible without page scroll, all main
labels are legible, child polygons receive pointer events, Rack and endpoint
double clicks remain reachable, Undo/Redo treats a drag as one step, Save/Cancel
behave correctly, and browser Back restores the electrical origin.

## Domain and security boundaries

No persisted domain migration, authentication bypass or new privilege was added.
`positionId` is an additive derived RackPlacementView reference for Bay filtering.
Frame remains canonical. No manufacturer geometry, live telemetry or survey
claims were fabricated. No secret, local credentials or environment file was
included in commits. main was not merged and no additional remote branch was
created. Updates continue in PR #29 through non-forced branch updates.


## Spatial truth / popup restoration addendum

- Level floor geometry is derived from contained Room/Substructure polygons. The demo now avoids
  inventing a second floor footprint: its single operational Room and Structure use the same
  explicit footprint while Level itself remains non-spatial in persistence.
- Room grid semantics remain fixed at 600 × 600 mm. Position is the 600 mm operational anchor;
  Container/Rack footprint is independent physical geometry in millimetres and may be 600×600,
  900×600, 900×900, 1200×600 or other positive dimensions.
- Bay / ContainerCluster remains a spatial grouping derived from its Positions plus actual
  Container/Rack footprints. The derived extent is not represented as surveyed geometry.
- Physical popup behavior is restored from Container/Rack downward:
  Room rack double-click and hierarchy rack selection open a dedicated Container popup;
  mounted Device/Equipment opens a separate Device popup; Panels and Breaker/Holders open
  dedicated child popup windows; power tracing can open a separate trace window.
- Workspace pinned inventory, BDFB summary and topology tree launch physical Device/Container
  popups instead of forcing the main operational page to navigate away.
- Popup windows bypass the normal application chrome and retain specialized physical surfaces.
