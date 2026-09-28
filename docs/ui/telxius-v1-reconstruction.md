# Telxius v1 UI Reconstruction Contract

## Source of truth

The visual source for this reconstruction is the documentation package provided as `v1_telxius.zip`.

Canonical screenshots:

- `04_site_canvas.png` — Site physical canvas and Site Properties.
- `05_estructura.png` — Structure / level layout and elevator selector.
- `06_sala_transmisiones.png` — Room blueprint with clusters, positions and racks.
- `07_rack_elevation_multi.png` — Rack elevation with multiple mounted devices.
- `10_rack_bdfb.png` — Rack occupied by a BDFB.
- `11_bdfb_internals.png` — BDFB physical internals.
- `12_panel_summary.png` — Panel slot summary.
- `13_panel_breaker_detail.png` — Breaker detail and provisioning.
- `14_power_path_end_to_end.png` — End-to-end power path.

The screenshots are visual documentation. They do not establish runtime health, telemetry values or customer facts.

## Reconstruction rules

1. Preserve MK1 domain boundaries. No legacy persistence aliases enter `src/`.
2. Physical geometry is data, not decoration. Site, Structure, Room and Cluster polygons must come from canonical topology data.
3. Missing geometry produces an explicit unavailable state. The UI must not invent polygons or coordinates.
4. Room rack placement uses canonical Position coordinates and rack dimensions.
5. BDFB presentation consumes the canonical `Device.bdfb` hierarchy.
6. MQTT telemetry overlays existing breaker identities; it never creates breakers.
7. The navigation tree is built from the canonical topology graph.
8. Styling is isolated in `telxius-ui.css`; domain/application modules contain no visual constants.
9. Existing migration reports, customer dumps and credentials remain outside Git.

## Route mapping

| Telxius view     | MK1 route                                              |
| ---------------- | ------------------------------------------------------ |
| Site canvas      | `/topology/.../site/:id`                               |
| Structure layout | `/topology/.../structure/:id?level=:levelId`           |
| Room blueprint   | `/topology/.../room/:id` and `/blueprint/:id`          |
| Rack elevation   | `/rack/:rackId`                                        |
| BDFB internals   | Device topology route / rack mounted-device inspection |
| Power path       | `/power`                                               |

## Harmonic composition contract

The application uses one visual grammar from overview to physical detail:

```text
Workspace
  ↓
Site
  ↓
Structure / Level
  ↓
Room
  ↓
Cluster
  ↓
Position
  ↓
Rack
  ↓
BDFB
```

Every physical-detail route follows the same composition:

```text
canonical tree → physical context → focused work surface → contextual properties
```

Rules:

1. The left column is navigation only. Nested pages must not introduce a second navigation tree.
2. The center is always the primary physical or operational surface.
3. The right column is contextual evidence/properties only; generic placeholders must not displace useful facts.
4. Cluster and Position are drill-down states of the Room workflow, not independent visual products.
5. Rack remains a physical elevation inside the same shell; mounted inventory is represented on the elevation and in the property column.
6. BDFB uses neutral hierarchy framing and amber only for electrical/power semantics. Cyan remains the shared navigation/selection accent.
7. Repeated identity headers are avoided. A nested surface describes the view rather than repeating the selected entity name.
8. A single final stylesheet, `src/app/telxius-ui.css`, owns the SiteMapper visual system. New visual changes must modify that layer rather than append another override stylesheet.
9. Single-network/single-site installations skip redundant index screens and enter the Site canvas directly.
10. Missing physical evidence remains explicit; visual harmony never justifies inventing geometry or topology.

## Spatial fidelity boundary

The legacy migration is responsible for preserving evidence-backed fields required by these views:

- `Site.polygon`
- `Structure.polygon`
- `Room/Substructure.polygon`
- `ContainerCluster/Bay.polygon`
- rack width/depth
- Site operational metadata that is already present in the source record

No defaults are allowed for missing physical polygons.
