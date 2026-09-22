# AppM Site Mapper — MK1

Site Mapper MK1 is a clean reconstruction of the existing Site Mapper product as a production-grade, documented, testable, secure modular monolith.

## Contract

The binding reconstruction contract lives at:

docs/product/MK1-RECONSTRUCTION-CONTRACT.md

Core rule:

> Migrate knowledge and validated behavior. Do not migrate accidental architecture or technical debt.

The legacy repository is evidence and reference, not the architectural foundation.

## Current status

**Milestone:** MK1-F0 — Foundation & Truth  
**Gate:** G0 Repository Foundation — PASSED  
**Integration:** PR #1  
**Next gate:** G1 Legacy Mining & Product Truth

No legacy product implementation has been copied into MK1.

## Stack baseline

- Next.js 16.3.5
- React 19.3.0
- TypeScript 5.9.3
- ESLint 9.39.5
- Prettier 3.9.8
- Vitest 5.0.1
- GitHub Actions
- Node.js 22
- npm lockfile v3

Persistence, authentication, RBAC and telemetry libraries are intentionally not selected yet. Their architecture must be decided by the relevant ADR and domain gate before implementation.

## Local bootstrap

1. Use Node.js 22.
2. Run `npm ci`.
3. Run `npm run verify`.
4. Run `npm run dev`.

## Quality gate

Pull requests must pass:

- reproducible dependency installation with `npm ci`;
- TypeScript typecheck;
- ESLint;
- Prettier check;
- unit tests;
- integration-test harness;
- production build;
- production dependency audit at high severity.

## Trust boundary

This repository is public. Never commit production secrets, customer topology, database dumps, MQTT credentials, private keys, tokens, real passwords or sensitive operational data.
