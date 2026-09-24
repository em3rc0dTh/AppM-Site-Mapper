# MK1 visual hardening

Branch: `feat/mk1-ui-ux-hardening`, based on integrated G0–G15 `40b3717`.

## Boundary

Presentation-only work. Domain, repository schemas, auth/session trust, RBAC, CAS,
power semantics, telemetry normalization and migration tooling remain authoritative.
Device and Equipment retain equal hierarchy beneath a rack.

## Visual system

Graphite surfaces, cool white typography, restrained cyan selection, semantic amber
and red states. Small reusable primitives drive the application:

- AppShell;
- AuthFrame;
- Surface;
- SectionHeader;
- MetricTile;
- EntityRow;
- StatusBadge;
- DataView;
- EntityInspector;
- StatePanel.

Specialized spatial/electrical views compose those primitives rather than creating
entity-specific popup families.

## Implemented coverage

- persistent control-center shell and navigation;
- operational Workspace metrics and topology explorer;
- reusable right-side EntityInspector;
- Network/topology presentation;
- Blueprint selection, pan/zoom and rack inspection;
- Rack Elevation with physical/reserved/clearance/available roles;
- PowerPath visual flow;
- telemetry scalar presentation with raw payload secondary;
- Settings/admin visual alignment;
- shared loading/error/not-found states;
- reusable identity surface for login and password rotation;
- responsive desktop/tablet/mobile layouts;
- reduced-motion handling and keyboard focus treatment.

## Reuse rule

A new entity does not receive a dedicated popup by default.

Entity-specific data is adapted into the shared EntityInspector and existing visual
primitives. New components are justified only for distinct interaction models such as
spatial Blueprint rendering or electrical path visualization.

## Form comprehension rule

Operational forms must be understandable by a user who did not design the data model.

For every non-obvious field:

- show a persistent visible label; do not rely on placeholder text alone;
- show units in the label when the value is dimensional or capacity-based;
- explain domain abbreviations such as `U` at the point of use;
- explain what a default value means rather than expecting the operator to infer it;
- explain mutually exclusive variants such as Rack vs Container;
- explain the physical ownership/placement consequence of the field when relevant;
- keep helper text concise and adjacent to the control it explains.

A form is not considered visually hardened if the operator must know the implementation
or database schema in order to understand what to enter.

For spatial placement, an error must be visible in the same physical context that caused it. A collision message without rendering the blocking physical asset is insufficient. Where dimensions determine placement, the operator should see a live footprint preview before committing the mutation.

## Validation evidence

The implementation head `582a0d172b683800393d42eb3fb87c0de8a5c3da` passed GitHub Actions run 121:

- TypeScript typecheck;
- ESLint;
- Prettier format gate;
- unit tests;
- integration tests;
- system certification;
- production Next.js build;
- production dependency audit.

The presentation changes do not alter the certified G0–G15 domain/application contracts.

## Truth boundary

Repository CI validates correctness, regression safety and production buildability.
It does not provide pixel-level screenshot regression or substitute for final human
browser review on the target display/environment.

A final manual visual smoke test is recommended before production presentation sign-off,
especially for real customer topology density and telemetry payloads.
