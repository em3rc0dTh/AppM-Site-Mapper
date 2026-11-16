# AppManager SiteMapper MK2 — UX Stabilization (Desktop)

**Branch:** `fix/mk2-ux-stabilization`  
**Base:** `main`  
**State:** pending manual local acceptance — **do not merge or deploy**.

## Intent

Implement the accepted light-theme MK2 frame, grounded in the November 13 UX review and current Site Mapper screen. This is a **presentation-only** change.

### P0 implementation scope

1. **Brand order:** AppManager SiteMapper Mk2 text, cube to its right, and home icon immediately after the cube, aligned vertically on the global top bar.
2. **No tagline:** hide/remove “Infraestructura física” from the compact header while leaving the login/hero brand unaffected.
3. **No duplicate heading:** the Home banner shows “Inicio” and “Vista general de la infraestructura”, with the original cartographic image; the product name remains in the global header.
4. **Menu affordance:** clear visible hamburger border, hover and keyboard focus. The navigation tree remains collapsed initially.
5. **Card legibility:** stronger borders and readable metrics in Home KPIs and QDF cards.
6. **Status-driven QDF contrast:** healthy = green, warning = amber, critical = red, unknown/no telemetry = neutral. Colors decorate **existing live statuses**, never derive or change them.
7. **QDF-2 / QDF-4 / QDF-5 physical views:** retain the existing resizable three-column workspace, center the chassis within the Canvas (max 880 px), and reuse a light, readable shelf/frame/panel visual language without changing any data.
8. **Contextual toolbar and density:** show the real QDF view title on a short first row; place the Physical/Operation tabs on a compact second row with the existing live health badge and load-report action at its right. Keep P01–P24 balanced and responsive to the *resized canvas*, with the original inventory table below.
9. **Header retention:** preserve the existing sticky header when the workspace scrolls.

### Out of scope

- App domain, data models, persistence, migrations, CAS, RBAC, authentication.
- Telemetry and alarms aggregation, rules, normalization, data values or API routes.
- The operator's actual QDF identifiers and breadcrumb paths.
- Mobile Inspector; new cartographic background; expanding operational/inspection capabilities.
- Arbitrary new metrics, circuit descriptions, alarm states or inspector fields not backed by runtime data.
- Deploying to TFARM04 or merging to main.

## Equipment composition ergonomics — accepted TO-BE (Nov 16)

The AS-IS screenshots for **Chassis → Shelf → Frame → Panel → Circuit Breaker** are the source of truth, including content below the initial fold. The AI visual drafts are **layout guidance only**; they are not a license to introduce new metrics, statuses, identifiers, tabs, charts or equipment names.

Only the existing equipment composition route is styled. The accepted BDFB/QDF physical stage is a separate interface and remains unchanged.

| Level | Manual check on local live data |
| --- | --- |
| Chassis | Real Equipment identity/allowed types/configure/delete, child Shelves + Frames, exact occupancy; SNMP input-capacity values and A/B feed labels; complete four-metric legend; all physical input terminals with connection inspection; Manage Positions and Technical Configuration remain reachable |
| Shelf | Real Frames and nested Panel lists, panel presence, live MQTT counts and alarm badges; original SNMP capacity/readiness labels, feed tags, metric legend, Manage Positions, Technical Configuration |
| Frame | Actual panel names and positions (e.g. A3/A2), occupied counts, live coverage and alarms remain linked; SNMP block, legend, original actions/permissions preserved |
| Panel | All 24 physical rows, installed and available positions, V/I/P/E, alarm and status columns; keep install-action buttons only where authorized; table retains horizontal and vertical scrolling and header remains visible while scrolling |
| Circuit Breaker | Exact individual V/I/P/E readings, live/stale/clock-skew condition, MQTT source/timestamp, alarms and power-path action; registered physical terminal(s), add/secondary-equipment actions and technical configuration remain reachable |
| Three-column contract | Topology, Canvas and Inspector still resize/restores with the same storage key; breadcrumb and selected Equipment remain valid |
| Ergonomic density | Smaller gutters, compact cards, readable text, no artificial stretching or duplicate cards; no content overlays at the final scroll position |
| Responsiveness | At 1440×900, 1920×1080 and with Inspector narrowed manually, all existing content and buttons still work without hidden fields |
| Roles/data | Read-only users see no new editing ability; data, counts, alarms and statuses never come from reference renders |

Do not merge this presentation pass until the operator confirms the local screenshots and checks the final-scroll regions of all five views.

## Equipment readability pass — operator-first, Nov 16

The five Equipment composition screens (CHASSIS, SHELF, FRAME, PANEL, CIRCUIT_BREAKER) now use a shared presentation-only readability scale. This is **not** an assertion that any age group can read the UI without a manual accessibility test.

| Element | Target | Manual verification |
| --- | --- | --- |
| Section titles | ~18 px | Chassis Interior, Shelf Structure, Frame Interior, Panel Physical, SNMP and Terminals |
| Main Equipment identity | ~21 px | Full names remain readable without inventing abbreviations |
| Technical body text | 14–16 px | MQTT, A/B shunts, capacity qualifiers, counts, live/stale status, location, connector labels |
| Key Breaker and SNMP metrics | ~21–24 px | Real V/I/P/E and capacities, units and existing numeric precision remain unchanged |
| Panel table | ~14–15 px | Header + all 24 positions; scrolling within table when resized; no shortened columns or removed alarms |
| Interactive actions | ~14 px; min-height ~40 px | Configure/Delete, Installation, Manage Positions, terminals, workbench and original tabs |
| Topology and Inspector | ~14 px for labels | Inspect deeply nested full Equipment names and wrapped exact location at narrow saved widths |

**Local acceptance gate**: inspect each of five views at 1440×900 and 1920×1080, **125%, 150% and 200% browser zoom**, keyboard-only navigation, inspector/tree resize, last-row access and complete end-of-page content. Verify text does not overlap or disappear, including line wraps, SNMP A/B feed disclaimers, alarms, timestamp, physical terminals, administration actions and technical configuration. Check against target WCAG 2.2 AA contrast and text-resize/reflow requirements rather than assuming font size alone ensures accessibility. Report failures before approval.

No presentation sample value was used to replace runtime data. The global AppManager identity, operational state logic and physical QDF-2/4/5 overview layout are unchanged.

## Operator language — technical detail on demand (Nov 16)

Goal: each always-visible phrase must either help the operator understand the asset, its readings, its condition, or the next useful action. Do not equate **installed**, **has readings**, and **operational**.

The presentation layer now:
- Rewords live-coverage summaries to **Equipment/positions/panels with readings**, using the existing real projection and its actual denominators. A receipt with clock skew may still have readings; it must not be mislabeled healthy.
- Fixes Spanish singular/plural grammar for sets, frames, panels, positions and registered terminals; uses concise count labels.
- Moves the hierarchical aggregation method into the existing composition's expandable technical detail, keeping the number of reporting descendant circuits and direct-child mean method intact.
- Keeps allowed child Equipment types in **Configure Equipment** rather than the page heading; lifecycle, child mode and telemetry identifier remain inspectable in configuration detail.
- Shows the focused Breaker's **last packet receipt in America/Lima**, derived from the original `receivedAt` timestamp without touching the stored UTC/source value. The original timestamp, MQTT source identifier, and diagnostic remain available on demand.
- Replaces the physical terminal metadata sentence with a simple registered-terminal count, retaining the original physical terminals and connections; retains the front-facing orientation cue.
- Leaves SNMP measurements and critical qualifiers such as **NO VERIFICADO**, shared inputs and unavailable capacity visible, without asserting fabricated electrical limits.

| Check | Expected local behavior |
| --- | --- |
| Chassis/Shelf/Frame | Counts describe actual installed and reporting equipment; the technical aggregation explanation opens on request |
| Panel | All 24 positions, actual V/I/P/E measurements, and status/alarm columns stay intact; installed and reporting are not conflated |
| Breaker | Last receipt is legible in Lima time. Raw timestamp and MQTT source are accessible in technical detail. LIVE/CLOCK SKEW/STALE/CONFLICT status remains discernible |
| Equipment header | No customer-facing raw MQTT point prefix or allowed-child-type policy; those remain accessible through technical/configuration sections |
| Terminals | Original number of registered terminals and the front-side ports remain operable; no unprovisioned ports are fabricated |
| i18n | Spanish and English show complete meaningful labels and correct grammatical count handling |
| Roles | Only previously authorized users can edit configuration; technical disclosures do not grant new actions |
| Falsifiability | Never call a device "operative" merely because it has received readings. Do not reinterpret a packet receive timestamp as the underlying sensor observation timestamp |

**Still pending operator sign-off** at local widths and zoom levels. No tests/builds/deployments have been run for this copy pass.

## Physical infrastructure ergonomics — Network / Site / Structure / Level / Room

The user's five red/black-marked screenshot revisions govern presentation. **Reuse the existing light MK2 design, three visible panes, original features and real operator data.** Red/black marks flag unnecessary/intrusive summaries; do not delete source records or real actions.

| Screen | Applied UI changes | What must remain grounded |
| --- | --- | --- |
| Network | Center registered site links, remove decorative connector lines without actual edges, remove repeated schematic/status labels and generic Inspector telemetry text. Site card opens with a single click. | Existing registered sites and deep links; topology tree; zoom/fit; actual lifecycle and child counts |
| Site | Keep the surveyed site perimeter and real structure polygons; enlarge their in-canvas labels and open the selected structure directly. Simplify Inspector; retain Edit Boundary and overlap/recovery warnings. | Persisted vertices and actual geometry only, no synthetic latitude/longitude, sizes or extra structures |
| Structure | Replace the miniature isolated level slabs with legible full-size level links over an explicitly **schematic** building illustration. | Real registered levels and links only. No repository-authorized photograph, 3D building model or floor-to-facade mapping was available; this is **not** a surveyed exterior reconstruction |
| Level | Make real surveyed Room labels readable in the actual polygon view and open Rooms in one click; rooms without surveyed geometry remain correctly identified as unsurveyed inventory, not placed on fictitious map points. | Actual room footprints, geometry-conflict notice, room create/edit contract and full geometry preserved |
| Room | Preserve native BlueprintCanvas, real clusters/QDF/racks, Físico/Telemetría, registered room boundary, editing/placement tools, zoom, keyboard focus. Reduce repeated property information, use real racks and clusters, move destructive management into a disclosure, clarify the floor-plan header. | Real room area/vertices, rack count, cluster names; no fabricated occupancy, percent, cluster connectivity or new alarm state |

Presentation adjustments are scoped to `mk-explorer-page` and `mk2-room-ergonomics`, with existing `mk2-ux-stabilization.css` as the styling layer. No changes to stored topology, spatial coordinates, power paths, persistence, auth, RBAC, telemetry APIs or topology traversal.

**Manual acceptance still required**: 1440×900 and 1920×1080; narrow/resized panes; 125%, 150%, 200% zoom; select/open each Network → Site → Structure → Level → Room item; geometry labels and polygons aligned; inspect site polygon with real measured area; unsurveyed branches do not claim a position; Room editor still saves real draft and can open Telemetry; no overlaps with Reset Layout. Verify keyboard link navigation and contrast before approval.

## Manual local acceptance (after checkout)

Review the feature branch using the existing local environment and seeded/connected data. Compare against the approved MK2 screenshot.

| View | Check |
| --- | --- |
| Global top bar | Text → cube → home; no compact tagline; Search, Help, Alarms, Explore, Warehouse and Admin retain links |
| Home banner | No second product logo; Inicio/title and original map remain visible |
| Home sidebar | Hamburger stands out, opens/closes the real topology navigation, keeps links usable |
| Home KPI cards | Counts reflect runtime data; grouping is visible on different monitors |
| QDF direct access | QDF-5, QDF-4 and QDF-2 cards remain clickable, use live values, and show correct conditional status styling |
| Alarm card | Severity, count, paths and target actions are unchanged |
| QDF-5 physical view | Chassis centered horizontally in the canvas; A3/B3/A2/B2 remain in their real frames; 24 slots of selected panel, all circuit rows, paths, alarm indicators, live data and links remain reachable |
| QDF-4 physical view | On the baseline screenshot: A3 and B3 each have 6 installed / 18 free; A2 and B2 empty; 2/4 panels, 12/96 circuits. These values must be read from the environment, never hardcoded |
| QDF-2 physical view | Same layout language, but every count, alarm, shelf/frame/panel name and slot comes from its own actual topology; do not copy QDF-4 or QDF-5 numbers |
| Contextual header | Short title row; tabs on the next row; real health and report action aligned to the right of the tabs without overlapping |
| Position density | On standard Canvas: 12 per row, balanced maximum 1080px grid; resized/narrow Canvas may reflow to 8/6 across rows, preserving order and all 24 positions |
| Three-column layout | Topology, Canvas and Inspector remain independent, resizable, and restorable; test resizing both handles and stage focus |
| Inspector & alarms | Physical properties, exact location, inherited/direct alarms and "Ver alarmas" remain visible and unchanged |
| Physical/Operation | Both original tabs remain functional; physical view remains read-only and Operation retains telemetry and alarms |
| Circuit scrolling | Entire selected panel breaker list is reachable; no footer controls cover last rows; no silent filtering or truncation. The inventory disclaimer remains accessible |
| Panel hierarchy | Shelf and Frame labels visible, A3/B3/A2/B2 panels retain exact positions, occupancy, selected state and composition links; no invented inventory |
| Physical card ergonomics | A3/B3/A2/B2 cards fit their actual identifiers, occupancy and composition action with minimal idle height; do not crop long names or alarm badges |
| Inspector width | Existing 320px default, saved per-user widths and drag handles remain unchanged; resize inspector to its supported minimum and confirm full location text remains legible |
| Action strip | Create Equipment stays available in its own non-overlapping bottom strip; Reset layout remains available at right; last breaker row and inventory disclaimer can be scrolled fully into view |
| Editor disclosure | Opening Create Equipment keeps the original form usable, does not clip its fields or steal keyboard focus unexpectedly |
| QDF-4 / QDF-2 | Light physical refinements now staged for *local* acceptance, not merged; Home status-card styling stays unchanged |
| Scroll | Global top bar stays visible; cards do not overlap |
| 1920×1080 and 1440×900 | No unintended clipping of header actions or QDF values |
| Narrow/laptop viewport | Existing responsive UI remains navigable; record any overflow for a follow-up |
| Keyboard | Tab/focus visible on menu, Home, QDF cards, and BDFB buttons |

**Acceptance gate:** Local manual check and explicit user sign-off before promoting the branch to `main`. Only after the approved main state is verified should deployment to **TFARM04** be considered.

Design guidance: user-provided `DESIGN.md` v1.0.0 (November 15, 2026), plus the subsequently supplied `UIUX-Design-System.zip` and its `assets/dashboard-reference.png`. Apply useful-density, legibility and content-aware-responsiveness principles; do **not** copy that reference dashboard's color palette, example metrics or site structure. The source of truth for physical QDF screens remains the operator's actual data and the accepted local AS-IS screenshots.

No tests, builds, deployments or data migrations were performed in this change authoring session; verification remains pending.
