# G16 Gap Register — Telemetry / Runtime / Browser Hardening

**Status:** ACTIVE — NOT SEALED  
**Applies from audit baseline:** `c8e0f8167b12039dea120711bb0be2138a80e875`  
**Product:** AppManager Site Mapper

## Purpose

G16 records the hardening work that extends the original G0–G15 repository/software baseline.
Items marked complete are evidence-backed software capabilities; they do not imply
environment-specific production certification.

## Completed / materially evidenced

- explicit TelemetrySource identity and serial-number binding;
- malformed/mismatched telemetry rejection and quarantine;
- durable telemetry acceptance/idempotency/outbox foundations;
- MongoDB-backed canonical latest telemetry in production persistence mode;
- authenticated SSE realtime fan-out with session revalidation;
- MQTT production TLS requirement and reference broker ACL certification;
- payload/reporting bounds and stable production MQTT client configuration requirements;
- Site → Circuit Breaker browser golden path;
- centered breaker modal with keyboard focus containment and focus restoration;
- realtime breaker updates while the modal stays open;
- synthetic history presentation for 24H / 7D / 30D with explicit provenance;
- desktop/narrow viewport browser matrix and 24-position panel evidence;
- runtime fail-closed contract for missing `APP_ENV` when `NODE_ENV=production`;
- documentation reconciliation for current product naming, Next.js version, G16 telemetry durability
  and Superadmin-only user management.

## Open before G16 can be described as production-sealed

### Historical telemetry

- benchmark/select production TSDB;
- wire production history writer/worker lifecycle;
- implement real history query repository/API;
- retention/rollups/downsampling;
- outage replay/recovery;
- backup/restore;
- load/soak evidence.

### Mutation integrity / administrative audit

- optimistic concurrency or transactional write contract for topology/CAS/power/spatial;
- lost-update tests;
- broader privileged mutation audit coverage;
- atomic mutation+audit strategy (transaction or administrative outbox).

### Production security / operations

- environment-specific MongoDB/TLS/auth review;
- deployment secret-manager and credential-rotation evidence;
- CSP/HSTS and explicit Origin/CSRF policy;
- general request body limits;
- readiness/metrics/correlation IDs/incident visibility;
- privileged MFA/IdP decision;
- GitHub governance/ruleset closure and Dependency Review when repository settings permit it;
- production backup/restore drill with explicit RPO/RTO;
- independent/external validation before final production security seal.

## Truth boundary

G16 may be called a **pre-production hardening stream**. It must not be described as a complete
production telemetry/history/security certification until the open items above have evidence-backed
closure.
