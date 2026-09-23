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
- [ ] G15 Release Documentation final CI/merge

## CI

Before sealing G15:

- [ ] typecheck green;
- [ ] lint green without application warnings;
- [ ] format check green;
- [ ] unit tests green;
- [ ] integration tests green;
- [ ] system certification green;
- [ ] production build green;
- [ ] production dependency audit green.

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
