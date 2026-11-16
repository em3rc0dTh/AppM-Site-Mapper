# G0 Repository Foundation — Gate Receipt

**Milestone:** MK1-F0 — Foundation & Truth  
**Gate:** G0 Repository Foundation  
**Verdict:** PASS  
**Evidence commit:** `827ad9f732ab14c948c4b8d61e9743dff05e1bb2`  
**Evidence workflow run:** `35782730057`  
**Branch:** `feat/mk1-g0-bootstrap`  
**Integration PR:** #1

## Contract alignment

G0 was executed under `docs/product/MK1-RECONSTRUCTION-CONTRACT.md`.

The legacy repository was used only as evidence. No legacy product module was copied into runtime code during G0.

## Delivered foundation

- Clean Next.js / React / TypeScript application baseline.
- Strict TypeScript configuration.
- ESLint and Prettier gates.
- Vitest unit/integration harness.
- Versioned npm lockfile.
- Reproducible `npm ci` installation.
- GitHub Actions verification pipeline.
- Security-safe ignore rules and names-only environment template.
- Runtime environment/secret helpers.
- Structured logger baseline with sensitive-key redaction.
- Health route.
- Modular-monolith architecture boundary.
- ADR mechanism.
- Initial domain-terminology ADR.
- Accepted modular-monolith ADR.
- Security baseline.
- Testing strategy.
- Initial legacy capability matrix.
- Initial legacy route inventory.
- Initial migration classification map.
- Initial legacy security findings.
- Agent rules that enforce the reconstruction contract.

## Verification evidence

Workflow run `35782730057` completed successfully with all of the following gates passing:

- Checkout.
- Node.js setup.
- `npm ci --no-audit --no-fund`.
- `npm run typecheck`.
- `npm run lint`.
- `npm run format:check`.
- Unit tests.
- Integration-test harness.
- `npm run build`.
- `npm audit --omit=dev --audit-level=high`.

The lockfile used by that run is committed as `package-lock.json`.

## Toolchain decisions discovered through CI

Two initially selected latest-version combinations were rejected by evidence rather than hidden:

1. TypeScript 7.0.2 was incompatible with the TypeScript-ESLint stack bundled through the selected Next.js ESLint configuration.
2. ESLint 10.11.0 triggered an incompatibility in that same plugin stack.

The baseline was therefore pinned to TypeScript 5.9.3 and ESLint 9.39.5, and those versions passed the full CI gate.

This is an intentional compatibility decision, not a silent downgrade.

## Explicitly not claimed by G0

G0 does not claim that any Site Mapper product capability has been migrated.

The following remain intentionally unresolved:

- canonical domain terminology;
- persistence technology and aggregate boundaries;
- authentication/session implementation;
- RBAC implementation;
- MQTT/telemetry implementation;
- Blueprint implementation;
- CAS implementation;
- rack/device implementation;
- BDFB/power implementation;
- legacy data migration.

Those belong to subsequent contractual gates.

## Exit decision

G0 acceptance criteria are satisfied.

The repository foundation is ready to integrate into `main` after this receipt commit itself passes the same CI pipeline.

After integration, work proceeds to:

**G1 — Legacy Mining & Product Truth.**
