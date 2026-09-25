# MK1 Release Checklist

## Repository/software certification

- [x] G0 Repository Foundation
- [x] G1 Legacy Mining / Product Truth
- [x] G2 Canonical Domain Contract
- [x] G3 Persistence Contract
- [x] G4 Identity / Auth / RBAC
- [x] G5 Topology Core
- [x] G6 Blueprint Engine
- [x] G7 Rack / CAS
- [x] G8 Device / Equipment / Rack Elevation
- [x] G9 BDFB / Power
- [x] G10 Telemetry
- [x] G11 Operational Workspace
- [x] G12 Settings / Administration
- [x] G13 Legacy Migration engine
- [x] G14 System Certification
- [x] G15 Release Documentation

## G16 hardening stream — active / not sealed

- [x] telemetry source identity and source/serial binding;
- [x] durable acceptance/idempotency/outbox foundation;
- [x] MongoDB-backed canonical latest telemetry in production persistence mode;
- [x] authenticated realtime fan-out;
- [x] MQTT TLS/ACL reference certification;
- [x] Site → Circuit Breaker browser certification and viewport evidence;
- [x] fail-closed production runtime environment contract;
- [ ] production historical TSDB selected and wired;
- [ ] critical mutation concurrency contract closed;
- [ ] privileged mutation audit atomicity closed;
- [ ] environment-specific production security/operations certification complete.

See `docs/release/g16-gap-register.md`.

## CI

Current automated repository checks:

- [x] typecheck green;
- [x] lint green without application warnings;
- [x] format check green;
- [x] unit tests green;
- [x] integration tests green;
- [x] system certification green;
- [x] production build green;
- [x] production dependency audit green.

## Production environment — external evidence required

These are not automatically satisfied by repository CI:

- [ ] production deployment target selected/configured;
- [ ] HTTPS/TLS verified;
- [ ] production MongoDB connectivity verified;
- [ ] production backup and restore test verified;
- [ ] production secrets installed in secret manager;
- [ ] legacy MQTT credentials rotated;
- [ ] broker ACL/topic configuration verified;
- [ ] production telemetry smoke test completed if enabled;
- [ ] real production/customer data migration executed if required;
- [ ] post-migration counts/hierarchy verified;
- [ ] RTO/RPO and retention policy approved;
- [ ] production-scale/load expectations tested;
- [ ] CSP designed and validated for the deployed frontend.

## Release interpretation

G15 PASS means **the original MK1 repository/software baseline is release-documented and
CI-certified**.

G16 is an active hardening stream and must not be called production-sealed while its unchecked
history, mutation-integrity, audit-atomicity and environment-specific security items remain open.

No repository gate turns unchecked environment items into completed facts.
