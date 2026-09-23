# MK1 visual hardening

Branch: `feat/mk1-ui-ux-hardening`, based on integrated G0–G15 `40b3717`.

## Boundary

Presentation-only work. Domain, repository schemas, auth/session trust, RBAC, CAS,
power semantics, telemetry normalization and migration tooling remain authoritative.
Device and Equipment retain equal hierarchy beneath a rack.

## Visual system

Graphite surfaces, cool white typography, restrained cyan selection, semantic amber
and red states. Small reusable primitives: AppShell, Surface, SectionHeader,
MetricTile, EntityRow, StatusBadge, DataView, EntityInspector and StatePanel.
Specialized spatial/electrical visualizations compose these primitives.

## Execution

UI-0 tokens and primitives; UI-1 shell/navigation/workspace; UI-2 inspector;
UI-3 blueprint and elevation; UI-4 power and telemetry; UI-5 settings/responsive;
UI-6 regression and visual verification. Checkpoints are pushed during active work.

## Acceptance

Shared visual language, accessible keyboard interaction and focus, mobile layout,
truthful data states, no new entity-specific popup family, readable telemetry with
secondary raw data, explicit electrical paths, preserved certified behavior.
Validation evidence is recorded here before final delivery.
