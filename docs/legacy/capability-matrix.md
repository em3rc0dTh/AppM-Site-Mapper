# Legacy Capability Matrix

Status: G1 product-evidence matrix. This is not the canonical domain contract.

## Hierarchical topology

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + UX
- **Preserve:** Hierarchy and deep-navigation behavior.
- **Reimplement:** Canonical domain and query model.
- **Acceptance direction:** Network -> Site -> Structure -> Level -> Room -> Rack -> Device remains deterministic.

## Breadcrumbs and deep links

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + UX
- **Preserve:** Contextual navigation.
- **Reimplement:** Route nouns after G2.
- **Acceptance direction:** Reload and direct deep links reconstruct the correct context.

## Global navigation tree

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + UX
- **Preserve:** Topology-navigation workflow.
- **Reimplement:** Canonical topology query model.
- **Acceptance direction:** Tree reflects canonical topology without legacy collection aliases.

## Blueprint / room map

- **Legacy state:** Implemented
- **MK1 class:** ALGORITHM + UX
- **Preserve:** 600 mm grid, polygon and spatial behavior.
- **Reimplement:** Pure spatial engine plus renderer/editor.
- **Acceptance direction:** Placement and collision rules are testable without React.

## Rack placement

- **Legacy state:** Implemented
- **MK1 class:** DOMAIN + UX
- **Preserve:** Physical footprint concepts.
- **Reimplement:** Canonical placement rules.
- **Acceptance direction:** Invalid overlap and capacity states are rejected.

## Rack elevation

- **Legacy state:** Implemented
- **MK1 class:** UX + DOMAIN
- **Preserve:** U-space visualization.
- **Reimplement:** Renderer over canonical rack state.
- **Acceptance direction:** Rendering agrees with CAS and device placement.

## CAS

- **Legacy state:** Implemented
- **MK1 class:** ALGORITHM + DOMAIN
- **Preserve:** AVAILABLE, RESERVED, EQUIPPED and validated workflows.
- **Reimplement:** Isolated domain engine and persistence integration.
- **Acceptance direction:** Mount, split and free are deterministic and invariant-safe.

## Device inventory

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + DOMAIN + UX
- **Preserve:** Device identity and specification intent.
- **Reimplement:** Canonical aggregate and use cases.
- **Acceptance direction:** Device identity is independent from accidental legacy collection shape.

## BDFB hierarchy

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + DOMAIN
- **Preserve:** Shelf, Frame, Panel, Holder and Breaker concepts.
- **Reimplement:** Explicit device/power domain.
- **Acceptance direction:** BDFB construction is not a hidden side effect of CAS persistence.

## Panel and breaker operations

- **Legacy state:** Implemented
- **MK1 class:** DOMAIN + UX
- **Preserve:** Validated operational behavior.
- **Reimplement:** Explicit use cases.
- **Acceptance direction:** Mutations validate capacity, ownership and permissions.

## Power Path

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + DOMAIN + UX
- **Preserve:** Source-to-target electrical relationship.
- **Reimplement:** Explicit graph/path model.
- **Acceptance direction:** Paths are validatable independently from overlay UI.

## A/B provisioning

- **Legacy state:** Implemented
- **MK1 class:** CONCEPT + DOMAIN
- **Preserve:** Provisioning concept.
- **Reimplement:** Canonical feed and redundancy semantics.
- **Acceptance direction:** G9 defines valid provisioning state.

## Pinned devices

- **Legacy state:** Implemented
- **MK1 class:** UX
- **Preserve:** User-visible workflow and value.
- **Reimplement:** Query/application contract.
- **Acceptance direction:** Pins survive reload and respect authorization.

## Global notifications

- **Legacy state:** Partially implemented
- **MK1 class:** CONCEPT + UX
- **Preserve:** Operational notification surface where still required.
- **Reimplement:** Notification/event contract.
- **Acceptance direction:** Only validated sources generate notifications.

## MQTT telemetry

- **Legacy state:** Implemented with security debt
- **MK1 class:** CONCEPT
- **Preserve:** Server-side broker ingestion and browser-safe realtime fan-out concept.
- **Reimplement:** Secrets, authentication, authorization, topic validation, normalization and lifecycle.
- **Acceptance direction:** Unauthorized clients cannot open telemetry and payloads are schema-validated.

## Settings

- **Legacy state:** Implemented as a monolith
- **MK1 class:** UX + selected capabilities
- **Preserve:** Required administrative and product functions.
- **Reimplement:** Split modules and use cases.
- **Acceptance direction:** Profile, Security, Users, Import/Drafting and Danger Zone responsibilities are isolated.

## User roles

- **Legacy state:** Implemented with unsafe trust boundary
- **MK1 class:** CONCEPT
- **Preserve:** Superadmin, Admin and Standard as evidence until G4.
- **Reimplement:** Server-authoritative identity and RBAC.
- **Acceptance direction:** Client state can never grant authority.

## Password flows

- **Legacy state:** Implemented with legacy compatibility
- **MK1 class:** REQUIREMENT evidence
- **Preserve:** Intended login and password-change workflows where accepted.
- **Reimplement:** Secure identity implementation.
- **Acceptance direction:** No plaintext fallback; credential handling follows the accepted G4 security contract.

## JSON / data import

- **Legacy state:** Present
- **MK1 class:** CONCEPT
- **Preserve:** Import requirement if confirmed.
- **Reimplement:** Validated import pipeline.
- **Acceptance direction:** Unknown or invalid payloads cannot mutate canonical domain data.

## Drafting engine

- **Legacy state:** Present in Settings and documentation
- **MK1 class:** CONCEPT + UX evidence
- **Preserve:** Workflow only if product intent confirms it.
- **Reimplement:** Module after product confirmation.
- **Acceptance direction:** Remains P1 until behavior is explicitly accepted.

## Legacy Mongo aliases

- **Legacy state:** Implemented
- **MK1 class:** LEGACY
- **Preserve:** Nothing in runtime.
- **Reimplement:** Migration-only compatibility.
- **Acceptance direction:** Runtime modules never know PascalCase/lowercase alternatives.

## Prisma reference schema

- **Legacy state:** Present but not runtime authority
- **MK1 class:** EVIDENCE
- **Preserve:** Field and relationship clues.
- **Reimplement:** Persistence only after G3 decides the canonical model.
- **Acceptance direction:** One persistence contract exists.

## Generic dynamic CRUD

- **Legacy state:** Implemented
- **MK1 class:** LEGACY
- **Preserve:** Only user-visible capabilities.
- **Reimplement:** Explicit use cases and repositories.
- **Acceptance direction:** No caller-controlled collection or entity dispatch.

## Cookie-derived authority

- **Legacy state:** Implemented
- **MK1 class:** LEGACY
- **Preserve:** Nothing.
- **Reimplement:** Secure server-authoritative session.
- **Acceptance direction:** Browser-editable values never authorize.

## Hardcoded MQTT secrets

- **Legacy state:** Implemented
- **MK1 class:** LEGACY
- **Preserve:** Nothing.
- **Reimplement:** Runtime secret configuration.
- **Acceptance direction:** Previously committed credentials are treated as exposed and never copied.

## Evidence source

Primary frozen source: `thradexIT/site-mapper@22c7b8c495a026e34732fe0b7e3848b8c37e84c7`.

Supporting evidence is recorded in the G1 files for components, data, domain, spatial, CAS, power, telemetry, identity/security and routes.

## G1 rule

A statement that behavior is preserved preserves validated product intent or behavior. It does not authorize copying the legacy implementation.
