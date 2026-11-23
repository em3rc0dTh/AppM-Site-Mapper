# ELTEK SmartPack2 Touch · SNMP Live — Certification gate

Target baseline: `main` at `647d482b75709a8b270aa316b1a1a857fe590ab2`.

## Scope
- UI: QDF-5 overview, `EltekSmartpackLive`.
- Source: `ELTEK-SMARTPACK2-LURIN-REAL`.
- OIDs: `1.3.6.1.4.1.12148.10.2.1.0`, `1.3.6.1.4.1.12148.10.9.2.5.0`, `1.3.6.1.4.1.12148.10.10.5.5.0`.
- API: `/api/telemetry/industrial/signals`; read-only, no historical dependency.
- Values: RAW; no scale, amperes, volts, or input A/B inference.

## Certification evidence required
- [ ] GitHub CI successful for exact source tree: typecheck, lint, formatting, unit/integration/certification suites, build.
- [ ] `tests/unit/eltek-live-presentation.test.ts` successful.
- [ ] UI renders all three OIDs from actual API responses.
- [ ] Per-OID stale, missing, invalid timestamp, and error states are visibly correct.
- [ ] A/B independent shunt feed fields remain unmodified.
- [ ] Authenticated API access respected; unauthorized responses do not display cached telemetry as live.
- [ ] No errors in browser console; responsive layout and contrast confirmed.
- [ ] Source identity is confirmed to belong in the operational scope of QDF-5 (until then, the device-specific association is provisional).

## Release gate
**NOT CERTIFIED** until every check above has evidence. No merge or deployment is authorized solely by this document. TFARM04 remains unchanged during this CI validation.
