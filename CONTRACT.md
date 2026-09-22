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

Inputs from forms, route handlers, Server Actions, query parameters, MQTT, migration files, JSON import, and database records must be validated before they become domain data.

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

```text
Presentation
    ↓
Application
    ↓
Domain
    ↓
Repository interfaces
    ↓
Infrastructure
```

React must not know how MongoDB documents are structured.
MongoDB must not dictate domain behavior.
MQTT messages must not flow directly into UI objects.

---

# 5. Repository structure

```text
src/
├── app/
├── modules/
│   ├── identity/
│   ├── topology/
│   ├── spatial/
│   ├── inventory/
│   ├── rack/
│   ├── power/
│   ├── telemetry/
│   ├── notifications/
│   └── settings/
├── shared/
│   ├── domain/
│   ├── infrastructure/
│   ├── validation/
│   ├── security/
│   └── ui/
└── config/

tests/
├── unit/
├── integration/
├── contract/
├── security/
└── e2e/

scripts/
├── migrations/
├── validation/
└── fixtures/

docs/
├── product/
├── architecture/
├── domain/
├── adr/
├── security/
├── telemetry/
├── migrations/
├── operations/
├── testing/
└── release/
```

---

# 6. Git strategy

Use `main` as the single durable integration branch.

Work through short-lived branches:

```text
feat/mk1-g0-bootstrap
feat/mk1-g1-domain
feat/mk1-g2-identity
feat/mk1-g3-persistence
feat/mk1-g4-topology
...
```

Each gate ends in a PR.

`main` represents **integrated and passing**, not experimental work.

---

# 7. Execution gates

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

G6–G12 may allow controlled parallel work once their domain contracts are frozen.

---

# 8. G0 — Repository Foundation

Deliver:

* Next.js + TypeScript baseline
* strict TypeScript
* lint
* formatter
* test runner
* environment validation
* security-safe `.gitignore`
* `.env.example` with names only
* initial CI
* README
* ADR mechanism
* folder boundaries
* result/error conventions
* logging abstraction
* health endpoint where appropriate
* dependency lockfile

CI baseline:

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

G0 passes only when a clean clone can be installed, tested and built with documented commands.

---

# 9. G1 — Legacy Mining & Product Truth

Extract product knowledge from the legacy repository without importing its architecture.

Required evidence pack:

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

Historical documentation is evidence, not automatically authoritative.

---

# 10. G2 — Canonical Domain Contract

At minimum formalize:

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

For each entity define canonical name, purpose, ID strategy, fields, parent/children, invariants, uniqueness, lifecycle, deletion behavior, audit behavior and persistence representation.

---

# 11. G3 — Persistence Contract

Create one canonical storage model.

MongoDB may remain unless evidence provides a reason to replace it.

Legacy compatibility may exist only in migration tooling, never in runtime domain modules.

---

# 12. G4 — Identity / Auth / RBAC

Evaluate initial roles:

```text
Superadmin
Admin
Standard
```

Required capabilities include secure login/logout, authoritative server session, session expiration/invalidation, password hashing only, server-side RBAC, rate limiting, user lifecycle and audit events.

Explicitly prohibited:

```text
client role as authority
plaintext password fallback
trusted role cookie
unauthenticated mutations
hardcoded passwords
demo credentials in production paths
```

---

# 13. G5 — Topology Core

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

A topology created from root must survive create → navigate → reload → logout → login → deep-link navigation.

---

# 14. G6 — Blueprint Engine

Preserve validated concepts:

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

Geometry rules must be testable without React or browser rendering.

---

# 15. G7 — Rack & CAS

Preserve or formally redefine:

```text
AVAILABLE
RESERVED
EQUIPPED
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

No impossible U ranges, overlaps or rack-capacity violations are allowed.

---

# 16. G8 — Devices & Rack Elevation

Separate device identity, specifications, rack placement, operational state and telemetry state.

---

# 17. G9 — BDFB & Power

Preserve the validated hierarchy:

```text
BDFB
└── Shelf
    └── Frame
        └── Panel
            └── Holder / Breaker
```

Power Path becomes an explicit graph/domain relationship rather than UI-derived state.

---

# 18. G10 — Telemetry

Preserve the architectural direction:

```text
MQTT
→ backend
→ normalized telemetry
→ authenticated realtime transport
→ browser
```

Required protections include runtime-only secrets, rotated credentials, authenticated stream, connection limits, reconnect policy, malformed-message protection, topic allowlist and safe logging.

---

# 19. G11–G12 — Workspace & Administration

Reconstruct workspace, pinned devices, BDFB summary, notifications, navigation tree, breadcrumbs, contextual panels, read/edit mode, device/rack/panel views, settings and user administration against stable application contracts.

Dangerous operations require strong authorization, explicit confirmation, audit trail and defensive validation.

---

# 20. G13 — Legacy Data Migration

Pipeline:

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

Every migration must support dry-run, counts, warnings, rejected records, deterministic transformation, re-runnability strategy, verification and rollback/restore strategy.

---

# 21. G14 — System Certification

A build is not certification.

Golden path includes at least:

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

Also certify RBAC, security, invalid inputs, deep links, refresh recovery, migration, MQTT reconnect, telemetry isolation, error boundaries and backup/restore.

---

# 22. G15 — Release Documentation

Required before release:

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

# 23. Information acquisition

P0 blockers include canonical hierarchy and terminology; physical coordinate/rack rules; CAS semantics; BDFB/power rules; role and session requirements; representative sanitized persistence examples; MQTT grammar and sanitized payloads; deployment targets and environment requirements.

P1 includes exact operational UI behavior, rack rendering, popups, notifications, Settings, import/drafting, user flows, search/filtering, accessibility and supported viewports.

P2 includes expected scale, concurrency, MQTT throughput, performance/availability targets, logging/audit retention, backups, recovery objectives, localization, retention and monitoring.

GitHub can be mined automatically for product behavior and implementation evidence. GitHub alone cannot reliably provide real database state, real MQTT payloads, deployment intent or product decisions where code and docs disagree.

---

# 24. ADR baseline

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

# 25. Definition of Done

A feature is DONE only when applicable items pass:

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

# 26. Migration classification

Every legacy artifact receives exactly one migration classification:

```text
CONCEPT   — preserve the idea
ALGORITHM — port only after isolation and testing
UX        — reproduce behavior with new implementation
LEGACY    — do not migrate
```

Examples:

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

# 27. First milestone — MK1-F0

MK1-F0 delivers:

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

# 28. Final target

The objective is not merely that Site Mapper looks like the old Site Mapper.

> **Every valuable capability of Site Mapper must be deliberately reconstructed on a canonical domain model, secure trust boundaries, deterministic persistence, testable business rules and documentation that accurately represents the running product.**

The legacy system proves what the product can do.

**MK1 must prove that we can trust it.**

---

# Contract authority

This document is the governing reconstruction contract for AppM Site Mapper MK1.

Future implementation instructions must be interpreted within this contract. A conflicting instruction is treated as a proposed contract amendment, not as implicit permission to bypass the contract.

The contract changes only through an explicit amendment.
