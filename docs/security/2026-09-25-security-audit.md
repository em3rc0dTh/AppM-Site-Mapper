# AppManager Site Mapper — Security Audit

- Date: 2026-09-25
- Audited SHA: `a58e0d8fa4d69db4d225612ad44446a1f8878f31`
- Scope: application code, repository controls visible to the GitHub integration, CI/security
  workflows, identity/RBAC, Mongo persistence patterns, administrative mutation surfaces, telemetry
  trust boundary and documented operational controls.
- Out of scope: penetration test, production cloud/network configuration, actual secret-store
  configuration, live MongoDB hardening, live MQTT broker, TLS terminator, host OS, WAF, customer
  network and physical hardware.

## 1. Executive security assessment

No critical exploitable defect was proven by this static/repository audit.

The current branch has a materially improved security baseline:

- server-authoritative sessions/RBAC;
- scrypt password hashes;
- opaque random session tokens with only hashes persisted;
- production Secure + HttpOnly cookie behavior;
- revocable sessions;
- login throttling;
- one-time guarded bootstrap;
- runtime-only secrets;
- MQTT production TLS requirement;
- source-scoped broker ACL reference;
- raw source/SN identity checks;
- payload bounds/quarantine;
- durable telemetry acceptance;
- authenticated SSE with periodic authorization revalidation;
- append-only administrative audit foundation;
- SHA-pinned GitHub Actions;
- dependency audits;
- CodeQL;
- broker policy certification.

However, this is still a **pre-production security posture**, not a production sign-off.

The highest-priority residual risks concern:

1. fail-open environment classification when `APP_ENV` is omitted;
2. incomplete audit coverage and non-atomic mutation/audit persistence;
3. lost-update/concurrency risk in whole-document CAS/topology writes;
4. incomplete production infrastructure/security evidence;
5. missing CSP/HSTS/explicit CSRF-origin enforcement;
6. incomplete repository governance/dependency-review controls;
7. incomplete observability and readiness.

## 2. Positive controls verified

### S-PASS-01 — Password storage

- scrypt;
- random 16-byte salt;
- fixed parameters;
- timing-safe verification;
- 12-256 character accepted input boundary;
- password hashes excluded from safe DTOs.

Status: **PASS**.

### S-PASS-02 — Session token design

- cryptographically random 32-byte token;
- base64url encoding;
- only SHA-256 token hash persisted;
- eight-hour absolute expiry;
- explicit logout revocation;
- user-session revocation after password, role or lifecycle change.

Status: **PASS baseline**.

### S-PASS-03 — Cookie baseline

- HttpOnly;
- SameSite=Lax;
- Secure when `APP_ENV=production`;
- path scoped to application root.

Status: **PASS with environment-hardening dependency**.

### S-PASS-04 — RBAC authority

Permissions are evaluated server-side.

UI capability does not grant permission.

Status: **PASS**, with one policy/document mismatch described below.

### S-PASS-05 — Bootstrap protection

First Superadmin bootstrap requires:

- runtime secret;
- Bearer authorization;
- timing-safe comparison;
- unique initial-user slot / one-user closure.

Status: **PASS baseline**.

### S-PASS-06 — Telemetry trust boundary

Implemented protections include:

- explicit source registry;
- source topic identity;
- expected serial-number equality;
- disabled-source rejection;
- payload size and reported-entry bounds;
- quarantine metadata without storing raw rejected payload;
- idempotency/conflict handling;
- monotonic latest;
- authenticated SSE;
- periodic session revalidation;
- bounded concurrent streams.

Status: **PASS foundation**.

### S-PASS-07 — MQTT transport/broker reference

Production runtime requires `mqtts://`.

Reference Mosquitto policy:

- TLS listener only;
- anonymous disabled;
- max QoS 1;
- publisher ACL bound to username/source topic;
- read-only ingestion principal;
- packet/inflight/queue limits.

Status: **PASS repository contract; production deployment still requires external evidence**.

### S-PASS-08 — CI supply-chain baseline

Current workflows use SHA-pinned GitHub Actions.

CI runs dependency audit and Security runs CodeQL plus full dependency audit.

Status: **PASS baseline**.

## 3. Findings

Severity meanings:

- **HIGH**: close before production security sign-off.
- **MEDIUM**: material defense-in-depth / operational-security gap.
- **LOW**: useful hardening or consistency improvement.

### SEC-01 — Environment classification can fail open

Severity: **HIGH**

Evidence:

`parseAppEnvironment()` defaults missing `APP_ENV` to `development`.

Consequences when a production deployment forgets `APP_ENV=production` may include:

- auth cookie not marked Secure;
- default persistence can become in-memory when `APP_PERSISTENCE` is also absent;
- development-only endpoints can remain eligible;
- telemetry production-only configuration requirements are not activated;
- plaintext MQTT is not prohibited by the production policy flag.

This makes security depend on an operator remembering one variable rather than on the runtime proving
that its environment is safe.

Required closure:

- production build/start must fail when deployment classification is ambiguous;
- at minimum, if `NODE_ENV=production`, require explicit `APP_ENV` and reject anything other than
  an approved production/staging value according to deployment policy;
- add startup certification tests for missing/mismatched environment variables.

### SEC-02 — Administrative audit is incomplete and not atomic with mutations

Severity: **HIGH**

Current audit events cover identity actions and dead-letter replay foundations.

The following mutation APIs are not consistently written to the administrative ledger:

- topology create/archive/restore/move;
- room polygon updates;
- CAS reserve/equip/free;
- inventory pin;
- PowerPath create/archive.

ADR-022 also correctly records a second issue: even wired identity mutations commit before the audit
append, so an audit failure may leave a successful mutation while the HTTP request fails.

Required closure:

- define one audit contract for every privileged domain command;
- include actor, target, stable action, outcome and allowlisted metadata;
- implement Mongo transaction or durable admin outbox;
- test audit-write failure;
- define audit retention/export/restore policy.

### SEC-03 — CAS/topology writes have lost-update concurrency risk

Severity: **HIGH** for production integrity

CAS operations perform:

```text
read Rack
-> transform whole CAS array
-> replace document by id
```

The Mongo topology repository replaces by `{ id }` with no aggregate version/expected timestamp.

Two concurrent valid operations can therefore overwrite each other.

Required closure:

- add aggregate version;
- compare-and-swap on expected version, or transactional command model;
- return stable `STALE_VERSION` / conflict result;
- test simultaneous reserve/equip/free;
- apply equivalent rules to other critical multi-step provisioning mutations.

### SEC-04 — Production infrastructure security remains uncertified

Severity: **HIGH before production**

Repository CI does not prove:

- production HTTPS termination;
- Mongo authentication/private networking/TLS;
- secret manager installation;
- broker certificates/ACL deployment;
- broker credential rotation;
- selected TSDB security;
- encrypted/isolated backup storage;
- restore authorization;
- production firewall/security groups.

Required closure is environment-specific evidence, not more unit tests.

### SEC-05 — Full Content Security Policy and HSTS are absent

Severity: **MEDIUM**

Current headers include:

- nosniff;
- DENY framing;
- strict-origin-when-cross-origin;
- restrictive Permissions-Policy.

There is no application CSP and no HSTS in the repository header configuration.

Required closure:

- define deployment-aware CSP;
- remove unsafe-inline/eval dependencies where possible;
- validate Next.js runtime/static assets and any external origins;
- add HSTS at the TLS terminator once HTTPS-only production is guaranteed;
- certify headers against the deployed origin.

### SEC-06 — No explicit CSRF/origin policy on cookie-authenticated mutations

Severity: **MEDIUM**

SameSite=Lax materially reduces classic cross-site POST CSRF.

However, mutating JSON routes do not implement a central Origin/Host check or explicit anti-CSRF
contract.

Risk increases in deployments with sibling subdomains or another same-site application compromise.

Required closure:

- central mutation guard validating allowed Origin/Host;
- optionally CSRF token strategy if deployment model requires it;
- tests for cross-origin mutation rejection;
- keep SameSite + Secure cookies.

### SEC-07 — Login throttle is account-only

Severity: **MEDIUM**

The throttle key hashes normalized email only.

Positive:

- throttle is persisted in Mongo;
- increments are bounded/atomic;
- success resets the record.

Residual risks:

- distributed password spraying across many accounts is not bounded by source/network dimension;
- an attacker can intentionally consume a victim account's failure budget and create a short
  availability denial.

Required closure:

- layered account + trusted-client/network throttle;
- progressive delay or adaptive controls;
- explicit trusted-proxy/IP extraction policy;
- security event/metric for repeated failure patterns.

### SEC-08 — Privileged authentication has no MFA/IdP option

Severity: **MEDIUM** for production admin access

Password-only authentication may be acceptable for a development baseline, but Superadmin controls
users, roles and dangerous telemetry replay.

Required closure:

- decide whether production uses SSO/IdP or local MFA;
- require stronger authentication for privileged roles;
- retain local break-glass procedure only if explicitly governed.

### SEC-09 — Request-size protection is not centralized

Severity: **MEDIUM**

Telemetry has explicit payload bounds.

Other JSON mutation routes parse request bodies without an application-wide request-size contract.

The V1 TO-BE architecture correctly expects reverse-proxy request limits.

Required closure:

- enforce proxy-level global/request-class limits;
- optionally reject oversized bodies in sensitive application routes;
- document limits per import/admin endpoint;
- never add mass JSON ingestion without strict size/schema/staging controls.

### SEC-10 — Repository governance is incomplete/unverified

Severity: **MEDIUM**

Verified:

- repository is public;
- GitHub Actions are SHA pinned;
- CI and Security workflows are green.

Observed:

- repository-level rulesets API returns no configured rulesets;
- branch-protection details are not readable through the current integration, so protection cannot be
  certified;
- the project already records that GitHub Dependency Review is blocked until Dependency Graph is
  enabled.

Required closure:

- enable Dependency Graph;
- enable dependency review on PR;
- configure a main-branch ruleset / branch protection requiring CI + Security;
- prohibit force pushes/deletion on main;
- require pull request review according to team model;
- enable secret scanning/push protection where available and record evidence;
- consider signed release tags.

### SEC-11 — Observability is insufficient for security operations

Severity: **MEDIUM**

Positive:

- logger emits JSON;
- logger redacts context keys matching common sensitive names.

Missing as a consistent application contract:

- correlationId per request/command;
- structured actor/action/entity context across all modules;
- security metrics;
- audit-failure alerts;
- auth abuse metrics;
- broker lag/invalid-message dashboards;
- distributed traces where useful.

Required closure:

- request correlation middleware/utilities;
- standardized domain command logging;
- metrics/alerts;
- retention and access-control policy for logs.

### SEC-12 — Health endpoint is liveness-only and stale

Severity: **MEDIUM operational security/reliability**

Current `/api/health` returns static process metadata.

It does not prove:

- Mongo readiness;
- required indexes/schema;
- telemetry worker state;
- broker state when enabled;
- history sink state.

It also reports milestone/gate values that are no longer representative of the active G16 branch.

Required closure:

- `/api/health/live`;
- `/api/health/ready`;
- dependency checks with safe, non-secret output;
- worker health/lag;
- deployment probes.

### SEC-13 — Admin user-management policy is internally inconsistent

Severity: **LOW security / MEDIUM product governance**

`canManageRole()` says ADMIN can manage STANDARD.

The permission map gives `users:manage` only to SUPERADMIN.

The user-management APIs require `users:manage`, making the Admin-to-Standard path unreachable.

This is restrictive rather than privilege-escalating, but policy drift is dangerous because future
changes may "fix" only one side.

Required closure:

- choose the intended policy;
- encode it once;
- update RBAC docs/tests/UI accordingly.

### SEC-14 — Bootstrap endpoint remains present after initialization

Severity: **LOW**

The endpoint is functionally closed after an initial user exists, which is good.

Defense in depth:

- allow explicit runtime disable after bootstrap;
- monitor unexpected bootstrap attempts;
- rotate/remove bootstrap secret after initialization.

### SEC-15 — Production session controls can be extended

Severity: **LOW/MEDIUM depending threat model**

Current absolute TTL and revocation are good.

Possible production controls:

- configurable idle timeout;
- session inventory/revoke-all UI;
- privileged re-authentication before dangerous actions;
- device/session metadata;
- IdP/MFA as covered above.

## 4. Telemetry-specific security assessment

### Strong current properties

- hardware raw payload is not trusted merely because it reaches the broker;
- source topic maps to an explicit `TelemetrySource`;
- payload SN must equal expected SN;
- source can be disabled;
- invalid data is quarantined by metadata/hash rather than remapped;
- QoS1 PUBACK occurs only after application handler completion;
- latest state is server-side and durable in Mongo production mode;
- SSE requires telemetry permission and revalidates session every 30 seconds;
- browser receives no broker credentials;
- production plaintext MQTT is rejected.

### Remaining telemetry security gates

- production broker certificate deployment and rotation;
- device credential issuance/revocation process;
- exact broker authorization plugin strategy beyond current file-based reference;
- TSDB least-privilege credentials;
- TSDB private networking/TLS;
- history query authorization;
- retention policy;
- history restore;
- throughput/DoS tests;
- operational alerting on quarantine/identity mismatch/DLQ growth.

## 5. Data-security and recovery assessment

Current Mongo schema has strong unique/TTL indexes for key identity and telemetry collections.

Open production requirements:

- Mongo authentication and dedicated least-privilege user;
- TLS/private network;
- encryption-at-rest evidence from provider;
- backup encryption;
- restore access control;
- tested restore;
- approved RPO/RTO;
- audit-record retention independent from telemetry retention.

A documentation-only backup procedure is not production certification.

## 6. Security closure order

### Security Gate S0 — Fail-closed runtime

Close SEC-01 and centralize startup configuration validation.

### Security Gate S1 — Integrity and audit

Close SEC-02 and SEC-03:

- mutation transaction/outbox;
- aggregate versioning;
- complete privileged audit.

### Security Gate S2 — Web hardening

Close:

- CSP;
- HSTS;
- Origin/CSRF contract;
- body limits;
- layered login throttling.

### Security Gate S3 — Privileged identity

Approve and implement production MFA/IdP policy.

### Security Gate S4 — Repository governance

Enable:

- Dependency Graph/review;
- main protection/ruleset;
- secret scanning/push protection evidence;
- required status checks.

### Security Gate S5 — Observability and health

Implement:

- correlation IDs;
- security metrics;
- readiness/liveness;
- dependency/worker health;
- alerting.

### Security Gate S6 — Environment certification

Verify actual:

- TLS;
- Mongo;
- MQTT;
- selected TSDB;
- secrets;
- backup/restore;
- RPO/RTO;
- load/DoS expectations.

### Security Gate S7 — Independent validation

Before high-confidence production sign-off:

- threat-model review;
- authenticated application security test;
- privilege-boundary test;
- deployment/network review;
- restore exercise;
- external penetration test if required by customer/risk model.

## 7. Production security sign-off criteria

Do not declare production security PASS until all of the following have evidence:

- runtime cannot silently start in development security mode in production;
- privileged writes are concurrency-safe;
- privileged writes are audit-complete;
- audit persistence is atomic/durable with the mutation contract;
- CSP/HSTS and HTTPS are deployed;
- explicit cross-origin mutation protection is deployed;
- privileged authentication policy is approved;
- main branch is protected and dependency review is enabled;
- secret scanning status is recorded;
- live/readiness checks exist;
- logs/metrics support incident response;
- Mongo/MQTT/TSDB are private and least-privilege;
- backup restore has been executed;
- RPO/RTO are approved and measured;
- production-scale security/load assumptions have been tested;
- no known legacy credential remains valid.

## 8. Security truth statement

At `a58e0d8fa4d69db4d225612ad44446a1f8878f31`:

> The application has a strong engineering security baseline and materially improved telemetry trust
> boundary, with green CI/Security workflows. It is **not yet production-security certified** because
> several application integrity, web hardening, repository-governance and environment-specific
> controls remain open.

That distinction must remain explicit in release documentation.
