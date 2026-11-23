# ELTEK SmartPack2 Touch · SNMP Live — Certification gate

Validated source: PR #262 head `0503cc748e8d7120d22cf0922c887ed1e77d9b01` (squashed into `main` as `549cd18ed5c6c6cd925b9bbd9f6f8fbc161a3aef`).

## Scope

- UI: QDF-5 overview, `EltekSmartpackLive`.
- Source: `ELTEK-SMARTPACK2-LURIN-REAL`.
- OIDs: `1.3.6.1.4.1.12148.10.2.1.0`, `1.3.6.1.4.1.12148.10.9.2.5.0`, `1.3.6.1.4.1.12148.10.10.5.5.0`.
- API: `/api/telemetry/industrial/signals`; read-only, no historical dependency.
- Values: RAW; no scale, amperes, volts, or input A/B inference.

## Certification evidence required

- [x] GitHub CI #6147 passed on PR #262 source: typecheck, lint, formatting, unit/integration/certification suites, build and dependency audit.
- [x] `tests/unit/eltek-live-presentation.test.ts` passed (4 tests) within the unit suite.
- [ ] UI renders all three OIDs from actual API responses.
- [ ] Per-OID stale, missing, invalid timestamp, and error states are visibly correct.
- [x] A/B independent shunt feed paths remain unmodified in final PR diff.
- [ ] Authenticated API access respected; unauthorized responses do not display cached telemetry as live.
- [ ] No errors in browser console; responsive layout and contrast confirmed.
- [ ] Source identity is confirmed to belong in the operational scope of QDF-5 (until then, the device-specific association is provisional).

## Machine evidence

- CI: https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/45245330431 — SUCCESS.
- SNMP adversarial security: https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/45245330380 — SUCCESS.
- SNMP atomic TimescaleDB: https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/45245330497 — SUCCESS.
- SNMP Configuration 4 bounded chaos: https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/45245330563 — SUCCESS.
- S05 observability: https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/45245330377 — SUCCESS.
- Full-stack and HTTP/Mongo acceptance runs were still in progress when this record was written. They are not counted as passed.

## Release gate

**CODE / CI GATE: PASSED. FIELD / UI GATE: BLOCKED.** No deployment to TFARM04 until the remaining manual visual, source-to-device attribution, auth/error, and field acceptance checks are completed. Merging reviewed source into `main` does not grant release approval.
