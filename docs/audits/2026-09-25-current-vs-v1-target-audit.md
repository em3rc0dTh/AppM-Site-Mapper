# AppManager Site Mapper — Current State vs V1 Telxius Target Audit

- Date: 2026-09-25
- Repository: `em3rc0dTh/AppM-Site-Mapper`
- Audited SHA: `a58e0d8fa4d69db4d225612ad44446a1f8878f31`
- Active PR: #30
- Reference package: `v1_telxius(2).zip`
- Audit type: product / architecture / documentation / production-readiness gap analysis
- Security findings: see `docs/security/2026-09-25-security-audit.md`

## 1. Executive conclusion

The current MK1/G16 branch is no longer a fragile legacy reconstruction. It is a materially stronger
software foundation than the V1 implementation described by the Telxius source package.

The present repository already has:

- explicit module boundaries;
- canonical topology;
- MongoDB persistence adapters;
- server-authoritative identity and RBAC;
- rack/CAS domain rules;
- BDFB/Panel/Breaker/Holder domain structures;
- PowerPath aggregates;
- durable telemetry acceptance/latest/quarantine foundations;
- authenticated realtime SSE;
- MQTT identity/TLS/ACL hardening;
- administrative audit foundation;
- CI, CodeQL, dependency audit and browser E2E certification;
- a certified Site -> Breaker physical-navigation flow.

The main problem has therefore changed.

The project is **not primarily missing architecture anymore**. It is missing closure between the
strong MK1 foundation and the complete operational product documented by V1.

The required destination is:

> Recover the validated V1 product workflow and visual/operational density on top of the current
> canonical/security architecture, without importing V1 accidental architecture, unsafe mutation
> behavior, browser-owned truth, hard-coded integrations or undocumented operational assumptions.

This is **V1 product intent + MK1 engineering discipline**, not a V1 code port.

## 2. Evidence baseline

### 2.1 Current repository

At this SHA the repository contains approximately:

- 323 tracked files;
- 85 documentation files;
- 43 test files;
- 159 files under `src/`;
- explicit CI and Security workflows.

PR #30 currently changes 140 files relative to its base because G16 combines telemetry hardening,
administrative audit foundations, synthetic-demo support, physical-flow repair and browser
certification.

The exact current SHA has passed:

- typecheck;
- lint;
- format;
- telemetry demo validation;
- unit tests;
- integration tests;
- system certification;
- production dependency audit;
- browser physical-flow certification;
- CodeQL;
- MQTT TLS/ACL contract certification.

### 2.2 V1 Telxius source package

The reference package contains five primary documentation sets plus source material:

1. Quick Start Guide.
2. User Manual.
3. Administrator Manual.
4. External/solution HLSD.
5. Internal Architecture HLSD.

It also includes source LaTeX, screenshot manifests, diagram manifests and Graphviz source.

The screenshots cover:

- login;
- workspace;
- site directory;
- Site Canvas;
- structure/levels;
- room blueprint;
- rack elevation;
- generic device;
- source/power diagnostic;
- rack with BDFB;
- BDFB internals;
- panel summary;
- breaker/provisioning detail;
- end-to-end Power Path.

The screenshot manifests explicitly say the cleaned screenshots are documentation material and must
not be treated as evidence of current runtime state. That distinction remains correct for MK1.

## 3. What must be preserved from V1

The following are valid product/UX targets unless a newer MK1 decision overrides them.

### 3.1 Continuous physical navigation

The operator must be able to traverse:

```text
Site
-> Structure
-> Level
-> Room/Substructure
-> Bay/Cluster
-> Position
-> Rack/Container
-> Device/Equipment
```

For BDFB/QDF:

```text
Device/BDFB
-> Shelf
-> Frame (canonical even when visually implicit)
-> Panel
-> Breaker/Holder
```

This is now substantially restored and browser-certified in MK1.

### 3.2 Spatial operating surfaces

V1 expects the product to show infrastructure as physical/spatial concepts instead of generic CRUD
tables:

- Site canvas;
- structure/level context;
- room blueprint;
- rack elevation;
- BDFB internals;
- panel/breaker physical organization;
- Power Path relationship diagram.

MK1 already follows this principle, but several surfaces remain materially simpler than the V1
reference.

### 3.3 Rack/CAS operations

The V1 administrator workflow includes:

- AVAILABLE / RESERVED / EQUIPPED semantics;
- reservation;
- split/allocation;
- free/release;
- mount;
- unassign;
- clearance awareness;
- post-change verification.

MK1 has strong CAS domain primitives and APIs, but the complete administrative UX is not yet at
parity.

### 3.4 Device and power provisioning workflow

V1 documents:

```text
BDFB
-> Frame
-> Panel
-> Breaker
-> access/port
-> provisioning slot/path
-> target device
```

The current PowerPath domain is a useful canonical base, but the end-user provisioning workflow and
diagnostic UX are not yet equivalent.

### 3.5 Realtime + history

V1 product intent expects current telemetry and historical/analytical views to coexist.

MK1 now has a much stronger realtime/acceptance architecture, but real historical persistence/query
is not yet selected and wired end-to-end.

### 3.6 Workspace pinning

This behavior exists in MK1 and should remain generic to eligible inventory rather than being
restricted to BDFBs.

## 4. What must NOT be copied from V1

The following V1 behavior/architecture is evidence of history, not a target implementation:

- credentials coupled to source/runtime code;
- plaintext MQTT transport;
- broad broker subscriptions without source isolation;
- one MQTT connection per browser/SSE client;
- browser-owned latest telemetry state;
- dual/ambiguous persistence models;
- role/session authority encoded in client-controlled state;
- unsafe destructive cascade/reset as an ordinary production UI operation;
- whole-document concurrent mutations without a concurrency contract;
- undocumented production assumptions;
- screenshots used as proof of runtime correctness.

Current MK1 decisions take precedence over these patterns.

## 5. Current capability audit

Legend:

- **PASS**: implemented and materially certified.
- **PARTIAL**: useful implementation exists but product/operational closure is incomplete.
- **OPEN**: target capability is not yet materially implemented.
- **INTENTIONAL DIFFERENCE**: V1 behavior should not be restored literally.

| Capability                       | Current state                 | Audit                                                                                                         |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Login / server session           | PASS                          | Opaque token, hash persistence, revocation, RBAC.                                                             |
| Workspace / pinning              | PASS                          | Device and Equipment remain sibling inventory.                                                                |
| Site directory / topology tree   | PASS                          | Canonical hierarchy and deep links exist.                                                                     |
| Site Canvas                      | PARTIAL                       | Functional physical navigation exists; rich surveyed site geometry/properties remain below V1 reference.      |
| Structure / Level operating view | PARTIAL                       | Navigable and certified, but visually/operationally simpler than V1.                                          |
| Room Blueprint                   | PASS/PARTIAL                  | Canonical polygon/grid, racks, slots, pan/zoom work; graphical authoring remains incomplete.                  |
| Rack elevation                   | PASS                          | Physical elevation and canonical deep link work.                                                              |
| CAS administration               | PARTIAL                       | Domain/API reserve/equip/free exists; complete operator/admin controls are not yet materialized.              |
| Generic Device internals         | PARTIAL                       | Core inventory exists; V1-style redundancy pair / internal slot workflow is not broadly modeled/presented.    |
| BDFB internals                   | PASS                          | Shelf/Frame/Panel/Breaker/Holder model exists; implicit frame presentation is explicit.                       |
| Current 24-position Panel UX     | PASS for present contract     | 01-12 / 13-24 desktop layout is browser-certified without internal desktop scroll.                            |
| Breaker detail popup             | PASS                          | Centered modal, keyboard containment, realtime and synthetic history are certified.                           |
| Breaker provisioning             | OPEN/PARTIAL                  | Canonical PowerPath exists, but port/target/slot configuration UX is not V1-equivalent.                       |
| Power Path read view             | PARTIAL                       | Configured paths render; V1-style contextual diagnostic and live validation experience is incomplete.         |
| Power Path write API             | PASS foundation               | Create/archive exists with canonical endpoint validation.                                                     |
| Real telemetry latest            | PASS foundation               | Durable Mongo latest, source binding, identity validation, quarantine and fanout.                             |
| Real telemetry history           | OPEN                          | Candidate sinks exist; production TSDB is not selected/wired and query API is demo-only.                      |
| Synthetic telemetry demo         | PASS                          | Separate generator/demo path and clear simulated provenance.                                                  |
| User administration              | PASS with policy gap          | Superadmin path works; Admin-vs-Standard management policy is inconsistent between code/docs.                 |
| Audit ledger                     | PARTIAL                       | Identity and dead-letter actions wired; broader domain mutations are not fully audited and atomicity is open. |
| JSON ingestion                   | INTENTIONAL DIFFERENCE / OPEN | Runtime mass ingestion should not return without a safe import/staging contract.                              |
| Drafting Canvas authoring        | PARTIAL                       | Read/pan/zoom + polygon persistence exist; graphical polygon editor is not complete.                          |
| Cascade delete/reset             | INTENTIONAL DIFFERENCE        | Archive-first / controlled tooling is safer and should remain the baseline.                                   |
| Backup/restore                   | PARTIAL                       | Runbook exists; production restore drill evidence is absent.                                                  |
| CI / automated QA                | PASS                          | Far stronger than V1 AS-IS.                                                                                   |
| Browser E2E evidence             | PASS                          | Site->Breaker, modal, history demo, recovery and viewport matrix certified.                                   |
| Production observability         | PARTIAL                       | JSON logger exists; correlation IDs, metrics, tracing and readiness are open.                                 |
| Production deployment            | OPEN                          | No environment-specific deployment has been certified by repository evidence.                                |

## 6. Key current architecture strengths

### 6.1 Canonical domain before presentation

The hierarchy and BDFB semantics are now represented independently of the UI.

This is essential because V1 screenshots contain presentation-specific assumptions that must not
become domain invariants.

Examples:

- Frame can remain canonical while visually implicit.
- Holder is a physical free position, not missing telemetry.
- Breaker identity is independent from telemetry source identity.
- Device and Equipment remain siblings under Rack/Container.

### 6.2 Identity/security boundary

Authorization is server evaluated.

The browser does not own authoritative roles or broker credentials.

Session tokens are opaque and only token hashes are persisted.

### 6.3 Telemetry trust boundary

Current G16 work is materially stronger than the V1 AS-IS design:

```text
publisher identity/topic
-> raw validation
-> explicit TelemetrySource
-> serial-number match
-> canonical normalization
-> durable acceptance
-> monotonic latest
-> authenticated fanout
-> history outbox
```

Invalid or mismatched data fails closed into rejection/quarantine rather than being remapped.

### 6.4 Testing and evidence

The current branch now has both domain-level certification and real-browser certification.

This should become the standard for all future parity work: no view is "done" merely because a
component exists.

## 7. Material product gaps to the solid V1 target

### P0 — historical telemetry production closure

The current breaker History UI is intentionally synthetic.

Production target requires:

- selected TSDB;
- production sink wiring;
- history worker lifecycle;
- real query repository/API;
- 24h / 7d / 30d / custom range;
- rollups/downsampling;
- retention;
- failure recovery;
- restore drill;
- load/soak evidence;
- security/credential rotation;
- exact version/image pinning.

ADR-021 must move from benchmark gate to selected backend only after measured evidence exists.

### P0 — provisioning model and workflow

The product should support a safe version of the V1 provisioning workflow without copying legacy
mutation debt.

Required target:

```text
Breaker
-> compatible access/port
-> target Device/Equipment
-> target provisioning slot/path
-> feed A/B
-> validated PowerPath
```

This needs:

- explicit command model;
- compatibility validation;
- conflict detection;
- idempotency;
- concurrency/version checks;
- audit event;
- rollback/compensation strategy;
- operator confirmation UX;
- end-to-end E2E proof.

### P0 — CAS mutation integrity + admin UX

Current CAS services read a Rack, transform its full CAS array, then replace the document by `id`.

That is correct for single-writer functional tests but not sufficient as a production concurrency
contract.

Target:

- aggregate version / expected version;
- compare-and-swap update or Mongo transaction where appropriate;
- lost-update test;
- admin controls for reserve/equip/free/unassign;
- audit records;
- E2E proof from Rack Elevation.

### P1 — richer Device operational model

The V1 user workflow treats generic devices as more than inventory labels.

Target should explicitly decide whether MK1 needs:

- redundancy pairs;
- input/access ports;
- internal slots;
- A/B provisioning slots;
- device-side path state.

Do not invent this model from screenshots. Recover it only after the product contract is approved.

### P1 — Site/Structure/Room editing parity

Current Room Blueprint is structurally strong.

Remaining product target:

- graphical polygon editing;
- safe bay/cluster placement;
- position management;
- rack placement;
- contextual property editing;
- validation before persistence;
- undo/cancel or explicit draft/commit semantics.

The V1 "Drafting Canvas" placeholder should not be copied as a placeholder. Either ship a real editor
or omit the claim.

### P1 — Power Path diagnostic experience

The current `/power` page is a factual list/diagram.

The target should recover the V1 operational questions:

- What is the source?
- What is the target?
- Which feed is selected?
- Which BDFB/Panel/Breaker is involved?
- Which target slot/port is involved?
- Is the relationship merely configured or supported by current telemetry?
- When was the last relevant telemetry observed?

Configured relationship and measured electrical condition must remain visibly distinct.

## 8. Documentation audit

Documentation volume is already strong, but documentation truth is not fully synchronized.

### 8.1 Current strengths

The repository already has:

- ADRs;
- architecture docs;
- domain contracts;
- security docs;
- operations docs;
- migration docs;
- testing docs;
- release/gate receipts;
- telemetry contracts;
- legacy evidence registers.

This is a stronger maintainability base than the V1 package.

### 8.2 Drift found

Concrete drift at the audited SHA:

1. `README.md` lists Next.js 16.3.5 while `package.json` uses 16.3.6.
2. `docs/legacy/source-v1-telxius/README.md` names the product "Apana Air Site Mapper"; the
   current product decision is AppManager Site Mapper.
3. The same legacy register includes 2026 decisions that conflict with later explicit product naming.
4. `docs/operations/runbook.md` still says latest telemetry state is in-process, while current G16
   production Mongo mode persists latest telemetry.
5. Release documentation formally stops at G15 while PR #30 is a G16 hardening stream.
6. `docs/release/known-limitations.md` correctly says there is no production history store, but it
   does not yet summarize the durable G16 acceptance/outbox/latest architecture.
7. Browser physical-flow certification and its artifact contract are newer than several release/test
   documents and must be incorporated into the release truth map.
8. Admin user-management policy is inconsistent: `canManageRole()` permits an Admin to manage a
   Standard role, while the RBAC permission matrix gives `users:manage` only to Superadmin and the
   API requires that permission.

### 8.3 Documentation target

The solid target should keep documentation as source-controlled text/diagram source and generate
customer-facing PDFs/ZIPs as release artifacts.

Recommended structure:

```text
docs/
  product/
    capabilities.md
    user-journeys.md
    terminology.md
  manuals/
    quick-start.md
    user-manual.md
    admin-manual.md
  domain/
  architecture/
    current-state.md
    deployment.md
    data-model.md
    telemetry.md
  api/
    http-api.md or OpenAPI source
  security/
    threat-model.md
    authentication.md
    authorization.md
    telemetry-trust-boundary.md
    security-audits/
  operations/
    deployment.md
    environment-reference.md
    backup-restore.md
    incident-response.md
    observability.md
  testing/
    strategy.md
    e2e-matrix.md
    performance.md
  release/
    checklist.md
    known-limitations.md
    gates/
  adr/
  legacy/
  audits/
```

Every release manual should identify:

- product;
- document version;
- applies-to Git SHA/tag;
- status: draft/approved;
- source of truth;
- known limitations.

Screenshots should preferably be generated by Playwright against a deterministic demo fixture, then
referenced by the manuals. That reduces screenshot drift.

Diagrams should remain reproducible from Mermaid/Graphviz/PlantUML or another text source.

PDFs should be generated artifacts, not the only editable truth.

## 9. Required target release package

A solid successor to the V1 ZIP should contain at minimum:

1. Quick Start.
2. User Manual.
3. Administrator Manual.
4. Product/solution HLSD.
5. Internal technical architecture.
6. Security architecture + threat model.
7. Deployment and environment guide.
8. Operations runbook.
9. Backup/restore and disaster-recovery procedure.
10. API contract/reference.
11. Telemetry protocol and source-binding contract.
12. Data/domain dictionary.
13. ADR index.
14. Test/certification report.
15. Performance/load receipt.
16. Security audit receipt.
17. Release notes + known limitations.
18. Screenshot manifest generated from a certified demo.
19. Diagram manifest with source files.
20. Build instructions for reproducing the documentation package.

The package must not contain:

- runtime secrets;
- customer dumps;
- production broker credentials;
- private keys;
- production topology evidence;
- unredacted incident data.

## 10. Target architecture state

The recommended product architecture remains a modular monolith for transactional/business state
with separate infrastructure responsibilities where scale/trust requires them.

```text
Browser
  |
  v
Next.js application
  |-- Identity / RBAC
  |-- Topology / Spatial
  |-- Rack / CAS
  |-- Inventory
  |-- BDFB / Power
  |-- Workspace
  |-- Audit
  |-- Telemetry query/realtime facade
  |
  +--> MongoDB transactional state
  |
  +--> Telemetry ingestion runtime/worker
          |
          +--> MQTT broker (TLS + ACL)
          +--> durable acceptance/outbox
          +--> latest state
          +--> selected TSDB
```

The browser must never receive broker, MongoDB or TSDB administrative credentials.

## 11. Execution gates from current state to target

### T0 — Audit truth freeze

- commit current/target audit;
- reconcile naming/version/doc drift;
- establish G16 gap register.

### T1 — Domain/write integrity

- add optimistic concurrency/version semantics;
- transaction/compensation rules;
- audit coverage for topology/CAS/power/spatial/pinning;
- close audit atomicity gap.

### T2 — Administrative parity

- CAS reserve/free/equip/unassign UX;
- mount Device/Equipment UX;
- BDFB configuration UX;
- graphical Room/Bay/Position/Rack editing;
- no unsafe global reset.

### T3 — Power provisioning

- breaker configuration command;
- access/port binding;
- target inventory selection;
- target provisioning slot;
- A/B feed validation;
- PowerPath generation;
- E2E provisioning certification.

### T4 — Historical telemetry

- benchmark candidates;
- select store;
- wire production history writer;
- query service/API;
- retention/rollups;
- backup/restore;
- outage recovery;
- load/soak.

### T5 — Operational UX parity

- richer Device view;
- contextual Power Path diagnostic;
- Site/Structure metadata;
- preserve current popup and viewport decisions where they supersede legacy screenshots.

### T6 — Operations/observability

- readiness/liveness split;
- correlation IDs;
- structured request/command logs;
- metrics;
- tracing where useful;
- dashboards/alerts;
- deployment manifests;
- rollback;
- backup restore drill.

### T7 — Security closure

See dedicated security audit.

### T8 — Documentation/release package

- regenerate manuals from current product;
- generate certified screenshots;
- regenerate diagrams;
- produce versioned PDF/ZIP;
- attach test/security receipts;
- freeze known limitations.

### T9 — Production certification

Environment-specific only:

- production TLS;
- secrets;
- MongoDB;
- broker;
- selected TSDB;
- backup/restore;
- RPO/RTO;
- load;
- field telemetry;
- customer migration if required.

## 12. Definition of the target state

The target is reached when:

- V1 validated operator journeys are present or explicitly superseded by approved MK1 decisions;
- all write workflows use canonical domain commands and server authorization;
- critical mutations are concurrency-safe;
- privileged mutations are durably audited;
- production telemetry has realtime + real history;
- Power Path provisioning is validated end-to-end;
- UI uses the viewport efficiently without replacing physical concepts with CRUD pages;
- documentation and code identify the same product/version/behavior;
- production operations are reproducible;
- security gates are closed with evidence;
- customer-facing manuals can be regenerated from repository sources;
- no release claim depends on screenshots or documentation that are not tied to the certified SHA.

## 13. Current release truth statement

At `a58e0d8fa4d69db4d225612ad44446a1f8878f31`, AppManager Site Mapper is best described as:

> **A CI/security-certified pre-production MK1/G16 software baseline with a strong canonical domain,
> hardened realtime telemetry foundation, and a browser-certified Site-to-Breaker flow. It is not
> yet a fully production-certified replacement for every V1 operational/admin capability.**

That is the accurate boundary until the gates above are closed.
