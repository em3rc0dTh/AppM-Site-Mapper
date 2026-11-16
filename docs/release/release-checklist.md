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

## CI

Before sealing G15:

- [x] typecheck green;
- [x] lint green without application warnings;
- [x] format check green;
- [x] unit tests green;
- [x] integration tests green;
- [x] system certification green;
- [x] production build green;
- [x] production dependency audit green.

## MVP presentation candidate — explicit evidence

This is a **separate gate from G0–G15 software certification**. The current lab has validated one BFDB breaker, not 96 circuits per device or real facility wiring. Before presenting with LIVE/historical/Modbus claims, complete the session-specific checklist in [MVP Readiness](MVP-READINESS.md). On 2026-10-15 the operator confirmed a recovered 7D view after `HISTORY_STORE_UNAVAILABLE`, but **the return of new writes to TimescaleDB after that incident has not yet been reconfirmed by a new SQL measurement**.

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

G15 PASS means **the MK1 repository/software baseline is release-documented and CI-certified**.

It does not turn unchecked environment items into completed facts.
