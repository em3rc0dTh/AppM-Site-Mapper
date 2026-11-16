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
8. **Contextual toolbar and density:** group live health badge and existing load-report action next to the QDF view title; keep Physical/Operation tabs immediately below; use balanced P01–P24 tiles, flexible to the real Canvas width, and give circuit rows adequate readable space.
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
| Contextual header | Title, live status and report form a compact band; tabs below; report link and statuses remain functional and not overlapped |
| Position density | On standard Canvas: 12 per row, balanced maximum 1080px grid; resized/narrow Canvas may reflow to 8/6 across rows, preserving order and all 24 positions |
| Three-column layout | Topology, Canvas and Inspector remain independent, resizable, and restorable; test resizing both handles and stage focus |
| Inspector & alarms | Physical properties, exact location, inherited/direct alarms and "Ver alarmas" remain visible and unchanged |
| Physical/Operation | Both original tabs remain functional; physical view remains read-only and Operation retains telemetry and alarms |
| Circuit scrolling | Entire selected panel breaker list is reachable; no footer controls cover last rows; no silent filtering or truncation |
| QDF-4 / QDF-2 | Light physical refinements now staged for *local* acceptance, not merged; Home status-card styling stays unchanged |
| Scroll | Global top bar stays visible; cards do not overlap |
| 1920×1080 and 1440×900 | No unintended clipping of header actions or QDF values |
| Narrow/laptop viewport | Existing responsive UI remains navigable; record any overflow for a follow-up |
| Keyboard | Tab/focus visible on menu, Home, QDF cards, and BDFB buttons |

**Acceptance gate:** Local manual check and explicit user sign-off before promoting the branch to `main`. Only after the approved main state is verified should deployment to **TFARM04** be considered.

Design guidance: user-provided `DESIGN.md` v1.0.0 (November 15, 2026), especially useful density, readability, avoiding inflated cards, real data integrity, and responsive behavior based on content. It references `UIUX-Design-System.zip`; its optional reference image was not available during this implementation pass and is not treated as approved brand guidance.

No tests, builds, deployments or data migrations were performed in this change authoring session; verification remains pending.
