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
**Gate:** G0 Repository Foundation — IN PROGRESS  
**Active branch:** feat/mk1-g0-bootstrap

No product capability is considered migrated yet.

## Stack baseline

- Next.js 16.x Active LTS
- React 19.x
- TypeScript strict mode
- ESLint
- Prettier
- Vitest
- GitHub Actions

Persistence, authentication, RBAC and telemetry libraries are intentionally not selected yet. Their architecture must be decided by the relevant ADR and domain gate before implementation.

## Local bootstrap

1. Use Node.js 22.
2. Run npm install.
3. Run npm run verify.
4. Run npm run dev.

A dependency lockfile is required before G0 can be sealed. Until that file is committed and CI is green, G0 remains IN PROGRESS.

## Trust boundary

This repository is public. Never commit production secrets, customer topology, database dumps, MQTT credentials, private keys, tokens, real passwords or sensitive operational data.
