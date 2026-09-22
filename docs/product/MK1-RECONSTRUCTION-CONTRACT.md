# AppM Site Mapper — MK1

## Reconstruction & Execution Plan

**Target repository:** `em3rc0dTh/AppM-Site-Mapper`
**Legacy reference:** `thradexIT/site-mapper`
**Repository state:** Clean / empty
**Default branch:** `main`
**Objective:** Rebuild Site Mapper as a production-grade, documented, testable and secure modular application while preserving the validated product knowledge of the legacy implementation.

---

# 1. Mission

Site Mapper MK1 will not be a refactor of the legacy repository.

It will be a **clean reconstruction of the product**, using the legacy application as a source of:

* product behavior,
* domain knowledge,
* spatial rules,
* workflows,
* UI/UX references,
* telemetry behavior,
* rack-management logic,
* electrical/power-domain knowledge,
* lessons learned,
* security findings.

The legacy repository is therefore:

> **evidence and reference, not the architectural foundation.**

The central rule is:

> **Migrate knowledge and validated behavior. Do not migrate accidental architecture or technical debt.**

This preserves the previously defined boundary: Blueprint, CAS, Rack Elevation, BDFB, panels/breakers, Power Path, telemetry concepts, navigation, hierarchy, operational UX and useful data are assets to preserve; authentication, sessions, RBAC, persistence contracts, repository boundaries, validation, security, CI and architecture are foundations to reconstruct.

---

# 2. Target product

Site Mapper MK1 is an infrastructure-management / physical digital-twin application capable of representing and operating a physical hierarchy such as:

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room
                └── Cluster / Bay
                    └── Position
                        └── Container / Rack
                            └── Device
                                ├── Shelf
                                │   └── Frame
                                │       └── Panel
                                │           └── Holder / Breaker
                                └── Equipment
```

The exact canonical terminology is not considered frozen until the Domain Contract gate is completed.

In particular, legacy ambiguities such as:

```text
Room vs Substructure
Cluster vs ContainerCluster vs Bay
Container vs Rack
```

must be resolved explicitly rather than perpetuated through aliases.

---

# 3. Non-negotiable engineering rules

MK1 follows these rules from its first commit.

### A. One canonical domain

There will be exactly one authoritative name, schema and relationship for each domain entity.

No permanent compatibility such as:

```text
Device + devices
Container + containers
Room + Substructure
Cluster + ContainerCluster
```

Compatibility may exist inside migration tooling only.

It must not become runtime architecture.

### B. One persistence model

We will not maintain competing models between:

* Prisma,
* raw MongoDB,
* legacy Mongo collections,
* new Mongo collections,
* embedded structures,
* referenced structures.

The persistence strategy will be decided once and documented through an ADR.

### C. Authorization is server authoritative

The client must never determine permissions.

No role, username or email stored in a browser-readable cookie will constitute proof of authorization.

### D. Validate at every trust boundary

Inputs from:

* forms,
* route handlers,
* Server Actions,
* query parameters,
* MQTT,
* migration files,
* JSON import,
* database records

must be validated before they become domain data.

### E. Domain rules do not live inside React

Geometry, rack occupancy, electrical relationships, CAS rules and topology validation must be executable without rendering a UI.

### F. No production secrets in Git

Especially because the target repository is public.

Never commit:

```text
.env
Mongo credentials
MQTT credentials
SSH keys
private certificates
customer data
production topology exports
database dumps
API tokens
real passwords
```

### G. No feature is considered complete solely because it renders

Every meaningful module requires:

```text
domain behavior
+ validation
+ persistence
+ authorization where applicable
+ tests
+ documentation
```

---

# 4. Target architecture

MK1 should begin as a **modular monolith**.

We do not need microservices.

Conceptually:

```text
┌──────────────────────────────────────────────┐
│                Presentation                  │
│ Next.js Routes / RSC / Client Components     │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│              Application Layer               │
│ Use Cases / Commands / Queries / Services    │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│                 Domain                       │
│ Entities / Value Objects / Rules / Policies  │
└──────────────────────┬───────────────────────┘
                       │
             repository interfaces
                       │
┌──────────────────────▼───────────────────────┐
│              Infrastructure                  │
│ MongoDB / MQTT / Sessions / Logs / Adapters  │
└──────────────────────────────────────────────┘
```

React must not know how MongoDB documents are structured.

MongoDB must not dictate domain behavior.

MQTT messages must not flow directly into UI objects.

---

# 5. Proposed repository structure

```text
AppM-Site-Mapper/
│
├── src/
│   ├── app/
│   │
│   ├── modules/
│   │   ├── identity/
│   │   ├── topology/
│   │   ├── spatial/
│   │   ├── inventory/
│   │   ├── rack/
│   │   ├── power/
│   │   ├── telemetry/
│   │   ├── notifications/
│   │   └── settings/
│   │
│   ├── shared/
│   │   ├── domain/
│   │   ├── infrastructure/
│   │   ├── validation/
│   │   ├── security/
│   │   └── ui/
│   │
│   └── config/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── security/
│   └── e2e/
│
├── scripts/
│   ├── migrations/
│   ├── validation/
│   └── fixtures/
│
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── domain/
│   ├── adr/
│   ├── security/
│   ├── telemetry/
│   ├── migrations/
│   ├── operations/
│   ├── testing/
│   └── release/
│
├── .github/
│   └── workflows/
│
├── README.md
└── ...
```

---

# 6. Git strategy

Use `main` as the single durable integration branch.

Avoid recreating a permanent `developer` branch unless a concrete workflow requires it.

Work through short-lived branches:

```text
feat/mk1-g0-bootstrap
feat/mk1-g1-domain
feat/mk1-g2-identity
feat/mk1-g3-persistence
feat/mk1-g4-topology
...
```

Each gate should end in a PR.

`main` represents:

> **integrated and passing**, not experimental work.

Each PR must contain applicable:

```text
code
tests
documentation
migration notes
security implications
acceptance evidence
```

---

# 7. Gate G0 — Repository Foundation

## Objective

Create a clean engineering baseline before any Site Mapper functionality enters the repository.

## Deliverables

* Next.js + TypeScript baseline.
* Strict TypeScript.
* Lint.
* Formatter.
* Test runner.
* Environment validation.
* Security-safe `.gitignore`.
* `.env.example` containing names only.
* Initial CI.
* README.
* ADR mechanism.
* Folder boundaries.
* Basic error/result conventions.
* Logging abstraction.
* Health endpoint where appropriate.
* Dependency lockfile.

## CI baseline

Every PR must run:

```text
install
↓
typecheck
↓
lint
↓
unit tests
↓
integration tests
↓
build
↓
security/dependency checks
```

## Gate acceptance

G0 passes only when a clean clone can be installed, tested and built with documented commands.

---

# 8. Gate G1 — Legacy Mining & Product Truth

## Objective

Extract product knowledge from the old repository without importing its architecture.

## Outputs

### Product Capability Matrix

For every current capability:

```text
Capability
Status in legacy
Keep?
Reimplement?
Expected MK1 behavior
Evidence/source
Dependencies
Acceptance scenario
```

### Legacy Artifact Inventory

Review at minimum:

```text
app/
components/
lib/
prisma/schema.prisma
docs/
scripts/
package.json
configuration files
wireframes
UI references
security reports
```

Particularly important legacy components include:

```text
room-dashboard
rack-elevation
container popup
device popup
panel popup
power path
global navigation tree
breadcrumbs
BDFB summary
pinned devices
telemetry context/gateway
CAS actions
```

## Important rule

Historical documentation is evidence.

It is not automatically authoritative.

The code, documentation and actual product behavior must be reconciled into a new MK1 contract.

---

# 9. Gate G2 — Canonical Domain Contract

No application persistence should be implemented before this contract is sufficiently stable.

## Required entities

At minimum investigate and formalize:

```text
Site
Structure
Level
Room
Cluster/Bay
Position
Container/Rack
Device
Shelf
Frame
Panel
Holder
Breaker
Equipment
CAS
PowerPath
User
Role
TelemetryIdentity
```

For every entity define:

```text
canonical name
purpose
ID strategy
required fields
optional fields
parent
children
invariants
uniqueness
lifecycle
deletion behavior
audit behavior
persistence representation
```

## Required relationship decisions

Examples:

* Can a Position exist without a Cluster?
* Can a Rack move between Positions?
* Is device identity independent from rack placement?
* Is BDFB a device type or a specialized aggregate?
* Are Shelf/Frame/Panel embedded or separate aggregates?
* Is CAS a persisted object or derivable state?
* What happens to children when a parent is deleted?
* Can topology nodes be archived instead of deleted?

## Deliverable

`docs/domain/domain-contract.md`

plus machine-readable schemas where useful.

---

# 10. Gate G3 — Persistence Contract

## Objective

Create one canonical storage model.

MongoDB can remain the database unless subsequent evidence provides a reason to replace it.

## Required decisions

For every aggregate:

```text
collection
document schema
indexes
unique constraints
references
embedded data
ownership
timestamps
versioning
soft-delete policy
```

## Required protections

* Schema validation.
* Application-level validation.
* Explicit repository APIs.
* No collection-name arguments from UI.
* No generic `saveEntity(type, any)`.
* No direct Mongo calls from presentation components.

## Migration isolation

Legacy compatibility lives only here:

```text
scripts/migrations/legacy/
```

Never here:

```text
src/modules/
```

---

# 11. Gate G4 — Identity, Authentication & RBAC

This must be built before administrative or destructive product functionality.

## Roles to initially evaluate

```text
Superadmin
Admin
Standard
```

The names may remain, but their exact permissions must be documented.

## Required capabilities

* Secure login.
* Secure logout.
* Authoritative server session.
* Session expiration.
* Session invalidation.
* Password hashing only.
* Current-password validation for password change where applicable.
* Forced initial password change if required.
* Server-side RBAC.
* Rate limiting.
* User lifecycle.
* Audit events.
* Locked/read-only default on ambiguity.

## Explicitly prohibited

```text
client role as authority
plaintext password fallback
role stored as trusted browser cookie
generic unauthenticated mutations
hardcoded passwords
demo credentials in production paths
```

---

# 12. Gate G5 — Core Topology

Implement the canonical hierarchy.

Initial functional flow:

```text
Network
→ Sites
→ Site
→ Structure
→ Level
→ Room
→ Rack/Container
→ Device
```

Required features:

* deep linking,
* breadcrumbs,
* navigation tree,
* empty states,
* create/edit/archive flows,
* validation,
* permissions,
* persistence.

## Acceptance test

A topology created from the root must survive:

```text
create
→ navigate
→ reload
→ logout
→ login
→ navigate through deep link
```

without losing or reconstructing incorrect relationships.

---

# 13. Gate G6 — Blueprint Engine MK1

This is a preservation gate, not a rewrite of the product idea.

Preserve validated concepts such as:

```text
600 mm × 600 mm physical tile
grid coordinates
room polygon
rack dimensions
placement
snapping
empty assignable positions
collision prevention
zoom/pan
physical representation
```

The legacy decision to extract geometry and placement intelligence from the monolithic Room component is retained.

## Proposed domain split

```text
modules/spatial/
├── domain/
│   ├── coordinates
│   ├── geometry
│   ├── polygons
│   ├── dimensions
│   ├── placement
│   ├── snapping
│   └── collision
│
├── application/
│   └── blueprint services
│
└── ui/
    ├── canvas
    ├── rack node
    ├── slot
    └── editor controls
```

Geometry rules must have unit tests without React or browser rendering.

---

# 14. Gate G7 — Rack & CAS Engine

Preserve the validated CAS states:

```text
AVAILABLE
RESERVED
EQUIPPED
```

Preserve or formally redefine:

```text
startPosition
endPosition
physicalSize
totalReservedSpace
top clearance
bottom clearance
mount
split
free
```

## Critical invariants

Examples:

* no impossible U ranges,
* no overlapping mounted equipment,
* rack capacity never exceeded,
* physical device size respected,
* clearance respected,
* split/free operations remain deterministic.

This should become one of the highest-test-coverage modules.

---

# 15. Gate G8 — Device & Rack Elevation

Implement canonical device placement and elevation rendering.

Separate:

```text
device identity
device specifications
rack placement
operational state
telemetry state
```

A device should not cease to exist merely because it is moved within the physical topology unless the domain explicitly says so.

---

# 16. Gate G9 — BDFB & Power Domain

Preserve the validated conceptual hierarchy:

```text
BDFB
└── Shelf
    └── Frame
        └── Panel
            └── Holder / Breaker
```

Support documented variants where required, including no-frame arrangements if still part of the business domain.

Separate:

```text
physical hierarchy
electrical topology
provisioning
telemetry
UI presentation
```

## Power Path

Power Path must become an explicit graph/domain relationship rather than UI-derived state.

Required investigation:

```text
source
destination
A/B feed
breaker
panel
device/equipment association
path validity
redundancy
provisioning state
```

---

# 17. Gate G10 — Telemetry Gateway

Preserve the useful architectural direction:

```text
MQTT
→ application backend
→ normalized telemetry
→ authenticated realtime transport
→ browser
```

Do not copy the old endpoint.

## Required layers

```text
MQTT transport adapter
topic parser
payload validator
device resolver
telemetry normalizer
authorization
subscription manager
browser realtime transport
```

## Required protections

* secrets only from runtime environment,
* credential rotation,
* authenticated browser stream,
* connection limits,
* reconnect policy,
* malformed-message protection,
* topic allowlist,
* logging without sensitive payload leakage.

---

# 18. Gate G11 — Operational Workspace

Reconstruct the validated operational experience.

Capabilities to evaluate:

```text
workspace
pinned devices
BDFB summary
notifications
navigation tree
breadcrumbs
contextual panels
read/edit mode
device popup
rack popup
panel/breaker views
settings
```

The UI should consume stable application contracts, not database documents.

---

# 19. Gate G12 — Settings & Administration

Split legacy Settings responsibilities into modules.

For example:

```text
Profile
Security
Users
Roles
Data Import
Drafting
System
Danger Zone
```

Dangerous operations require:

* strong authorization,
* explicit confirmation,
* audit trail,
* defensive validation.

Database reset, if retained at all, must be strictly development/test scoped unless there is an explicit operational requirement.

---

# 20. Gate G13 — Legacy Data Migration

Data is migrated only after the canonical model is stable.

## Migration pipeline

```text
legacy source
↓
read
↓
normalize
↓
validate
↓
transform
↓
canonical validation
↓
write
↓
post-migration verification
```

## Every migration must support

```text
dry-run
counts
warnings
rejected records
deterministic transformation
re-runnability strategy
verification
rollback/restore strategy
```

No production data is manually “fixed” during migration without a recorded transformation rule.

---

# 21. Gate G14 — System Certification

MK1 does not pass because `npm run build` succeeds.

The complete golden path should include at least:

```text
login
→ Network
→ Site
→ Structure
→ Level
→ Room
→ Blueprint
→ Rack
→ CAS
→ mount Device
→ Rack Elevation
→ BDFB
→ Panel
→ Breaker
→ Power Path
→ Telemetry
→ persistence
→ logout
→ login
→ verify reconstruction
```

Additional certification:

```text
RBAC
security
invalid inputs
deep links
refresh recovery
migration
MQTT reconnect
telemetry isolation
error boundaries
backup/restore
```

---

# 22. Gate G15 — Release Documentation

Before release we require:

```text
README
Architecture Overview
Domain Contract
Data Model
Authentication Model
RBAC Matrix
Blueprint Engine Specification
CAS Specification
Rack Model
BDFB Specification
Power Path Specification
Telemetry Contract
Environment Reference
Migration Guide
Testing Strategy
Security Baseline
Operations Runbook
Backup/Restore
Release Checklist
Known Limitations
ADRs
```

Documentation and implementation must describe the same system.

---

# 23. Information Acquisition Register

The following information must be gathered during reconstruction.

## P0 — Blocking information

These decisions can block canonical architecture.

### Product/domain

* Canonical hierarchy.
* Meaning of Room vs Substructure.
* Meaning of Cluster vs Bay vs ContainerCluster.
* Meaning of Container vs Rack.
* Device identity rules.
* Entity lifecycle rules.
* Delete vs archive behavior.
* Required deep-link behavior.
* Read mode vs edit mode.

### Physical model

* Standard tile dimensions.
* Coordinate origin.
* Coordinate naming.
* Rack width/depth/height rules.
* Rack U numbering direction.
* Valid rack sizes.
* Position occupancy rules.
* Collision behavior.
* Room polygon constraints.

### CAS

* Exact meaning of AVAILABLE.
* Exact meaning of RESERVED.
* Exact meaning of EQUIPPED.
* U-range semantics.
* Physical size semantics.
* Clearance semantics.
* Split semantics.
* Free semantics.
* Device mount semantics.

### BDFB / power

* Supported BDFB models.
* Shelf rules.
* Frame rules.
* Panel rules.
* Breaker/holder rules.
* No-frame variants.
* A/B provisioning semantics.
* Power-path source/destination rules.
* Redundancy rules.

### Identity/security

* Final role definitions.
* Permissions matrix.
* Password policy.
* Session lifetime.
* Force-password-change requirements.
* Account disable/archive behavior.
* Audit requirements.

### Persistence

* Representative sanitized legacy documents.
* Existing collection inventory.
* Approximate data volume.
* Required preservation of legacy IDs.
* Referential inconsistencies.
* Migration downtime tolerance.

### Telemetry

* MQTT topic grammar.
* Sanitized representative payloads.
* Serial-number/device mapping.
* `reported` payload semantics.
* Update frequency.
* Device offline semantics.
* Reconnect expectations.
* Required telemetry history or realtime-only behavior.

### Deployment

* Deployment target.
* Mongo hosting target.
* Runtime secret provider.
* MQTT environment.
* environments required:

```text
development
test
staging
production
```

---

# 24. P1 — Required before individual modules are certified

* Exact visual behavior of existing Blueprint.
* Existing rack rendering conventions.
* Device popup information hierarchy.
* Panel/breaker interaction behavior.
* Pinned-device behavior.
* Notification requirements.
* Settings requirements.
* JSON/import requirements.
* Drafting-engine requirements.
* User-management workflows.
* Required search/filtering.
* Accessibility requirements.
* Responsive viewport expectations.
* Browser support.

---

# 25. P2 — Required before production release

* Expected number of Sites.
* Expected number of Rooms.
* Expected number of Racks.
* Expected number of Devices.
* Simultaneous users.
* Simultaneous telemetry streams.
* MQTT event throughput.
* Performance targets.
* Availability target.
* Logging retention.
* Audit-log retention.
* Backup interval.
* Recovery objectives.
* Localization requirements.
* Time-zone handling.
* Data retention.
* Monitoring/alerting requirements.

---

# 26. Inputs we can mine automatically from the legacy repository

We do not need the user to manually explain everything.

The old repository can provide evidence for:

* current routes,
* current UI hierarchy,
* component behavior,
* Blueprint algorithms,
* geometry,
* rack rendering,
* CAS implementation,
* BDFB hierarchy,
* power-path implementation,
* current roles,
* telemetry transport,
* current schemas,
* old persistence conventions,
* wireframes,
* implementation plans,
* UI mockups,
* security findings,
* legacy scripts.

We should extract these systematically during G1.

---

# 27. Inputs that GitHub alone cannot provide reliably

These require external evidence or explicit product decisions.

### Legacy database

We need sanitized examples of real/current MongoDB structures.

Not credentials.

Prefer:

```text
collection name
sanitized sample document
field types
indexes
approximate count
relationships
```

### MQTT

We need sanitized real messages and topic examples.

Never the current broker password.

### Deployment

We need to know the intended runtime environment before production architecture is frozen.

### Product intent

Where old code and documentation disagree, an explicit MK1 decision is required.

---

# 28. Evidence pack to construct

Before migration begins, create:

```text
docs/legacy/
├── capability-matrix.md
├── route-inventory.md
├── component-inventory.md
├── domain-findings.md
├── data-findings.md
├── spatial-findings.md
├── cas-findings.md
├── power-findings.md
├── telemetry-findings.md
├── security-findings.md
└── migration-map.md
```

This is not legacy code.

It is extracted knowledge.

---

# 29. ADRs required early

At minimum:

```text
ADR-001 Domain terminology
ADR-002 Modular monolith architecture
ADR-003 Persistence strategy
ADR-004 Mongo aggregate boundaries
ADR-005 Identifier strategy
ADR-006 Authentication/session model
ADR-007 RBAC model
ADR-008 Validation strategy
ADR-009 Blueprint coordinate system
ADR-010 CAS model
ADR-011 Power domain model
ADR-012 Telemetry transport
ADR-013 Legacy migration strategy
ADR-014 Audit/logging strategy
ADR-015 Deployment architecture
```

---

# 30. Definition of Done

A feature is `DONE` only when applicable conditions are satisfied:

```text
[ ] Domain behavior defined
[ ] Input/output contract defined
[ ] Validation implemented
[ ] Authorization implemented
[ ] Persistence implemented
[ ] UI implemented
[ ] Unit tests pass
[ ] Integration tests pass
[ ] E2E flow passes
[ ] Security concerns evaluated
[ ] Documentation updated
[ ] CI passes
[ ] No secret introduced
[ ] Acceptance scenario demonstrated
```

---

# 31. Migration rule

Code from the legacy repository receives one of four classifications:

```text
CONCEPT
Preserve the idea.

ALGORITHM
Port after isolation and testing.

UX
Reproduce behavior with new implementation.

LEGACY
Do not migrate.
```

Example:

```text
CAS rules             → ALGORITHM / DOMAIN
Blueprint geometry    → ALGORITHM
Rack elevation UX     → UX
BDFB model            → CONCEPT + DOMAIN
Navigation hierarchy  → CONCEPT + UX
Mongo aliases         → LEGACY
Cookie-trusted RBAC   → LEGACY
Generic any CRUD      → LEGACY
Hardcoded secrets     → LEGACY
Plaintext passwords   → LEGACY
```

---

# 32. Recommended execution sequence

```text
G0   Repository Foundation
 ↓
G1   Legacy Mining / Product Truth
 ↓
G2   Domain Contract
 ↓
G3   Persistence Contract
 ↓
G4   Identity / Auth / RBAC
 ↓
G5   Topology Core
 ↓
G6   Blueprint Engine
 ↓
G7   Rack / CAS
 ↓
G8   Devices / Rack Elevation
 ↓
G9   BDFB / Power
 ↓
G10  Telemetry
 ↓
G11  Operational Workspace
 ↓
G12  Settings / Administration
 ↓
G13  Legacy Data Migration
 ↓
G14  Certification
 ↓
G15  Release Documentation
```

G6–G12 may subsequently allow controlled parallel work once their domain contracts are frozen.

---

# 33. First milestone

## MK1-F0 — Foundation & Truth

The first milestone should not attempt to recreate the complete UI.

It should deliver:

```text
repository baseline
CI
testing baseline
security baseline
architecture skeleton
legacy inventory
capability matrix
domain vocabulary
initial ADRs
canonical topology proposal
migration register
```

Only after MK1-F0 is sealed do we begin product reconstruction.

---

# 34. Final target

The objective is not:

> “Site Mapper looks like the old Site Mapper.”

The objective is:

> **Every valuable capability of Site Mapper has been deliberately reconstructed on a canonical domain model, secure trust boundaries, deterministic persistence, testable business rules and documentation that accurately represents the running product.**

The legacy system proves what the product can do.

**MK1 must prove that we can trust it.**