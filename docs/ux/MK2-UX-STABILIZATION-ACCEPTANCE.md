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
