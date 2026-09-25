# AppM Site Mapper — MK1

Site Mapper MK1 is a clean reconstruction of the legacy Site Mapper product as a documented, testable and security-conscious modular monolith for physical infrastructure management.

The legacy repository is evidence and reference, not the architectural foundation.

> **Migrate knowledge and validated behavior. Do not migrate accidental architecture or technical debt.**

## Release status

**Software milestone:** MK1  
**Certified gates:** G0 through G15  
**Active hardening stream:** G16 — telemetry identity, durability, security and browser-flow hardening  
**Current state:** pre-production MK1/G16 software baseline; G16 is not sealed yet  
**Repository contract:** `CONTRACT.md` and `docs/product/MK1-RECONSTRUCTION-CONTRACT.md`

The integrated software golden path is certified in CI. This is **not** a claim that a production deployment, production-data migration, physical field integration or production-scale load test has already been executed.

## Canonical hierarchy

```text
Network
└── Site
    └── Structure
        └── Level
            └── Room / Substructure
                └── ContainerCluster / Bay
                    └── Position
                        └── Container / Rack
                            ├── Device
                            │   └── Shelf
                            │       └── Frame
                            │           └── Panel
                            │               └── Breaker / Holder
                            └── Equipment
```

**Device and Equipment are siblings** beneath Container/Rack.

## Implemented capabilities

- server-authoritative authentication and RBAC;
- MongoDB production persistence and in-memory test/development adapter;
- canonical topology and verified deep links;
- Blueprint spatial engine with 600 × 600 mm tiles;
- CAS rack occupancy;
- Device/Equipment inventory and Rack Elevation;
- BDFB internal structure;
- explicit PowerPath aggregates;
- MQTT telemetry normalization and authenticated SSE fan-out;
- operational workspace;
- Settings/Profile/Security/User administration;
- deterministic legacy migration engine with staging-first apply;
- integrated system certification in CI.

## Stack

- Node.js 22
- Next.js 16.3.6
- React 19.3.0
- TypeScript 5.9.3
- MongoDB Node driver 7.6.0
- Vitest 5.0.1
- ESLint 9
- Prettier 3
- GitHub Actions

## Local development

```bash
npm ci
cp .env.example .env.local
npm run verify
npm run dev
```

The default non-production persistence mode is memory unless configured otherwise.

## Production configuration

Production must set `APP_ENV` explicitly. When `NODE_ENV=production`, a missing or blank
`APP_ENV` is a startup error; the runtime must not silently fall back to development.

Production must use:

```text
APP_ENV=production
APP_PERSISTENCE=mongodb
MONGODB_URI=<runtime secret>
MONGODB_DB_NAME=appm_site_mapper
BOOTSTRAP_ADMIN_TOKEN=<runtime secret>
```

Telemetry additionally requires a valid broker configuration when enabled.

See `docs/operations/environment-reference.md`.

## Quality gates

CI executes:

```text
npm ci
→ typecheck
→ lint
→ format check
→ unit tests
→ integration tests
→ system certification
→ production build
→ production dependency audit
```

Run locally:

```bash
npm run verify
npm run test:certification
```

## Legacy migration

The migration engine lives only under `scripts/migrations/legacy/`.

```bash
npm run migration:legacy -- \
  --input /secure/path/legacy.json \
  --output /secure/path/report.json
```

Production apply is staging-first and requires an externally retained stable ID map. See `docs/migrations/legacy-to-mk1.md`.

## Documentation map

- Architecture: `docs/architecture/`
- Domain: `docs/domain/`
- Security: `docs/security/`
- Telemetry: `docs/telemetry/`
- Testing: `docs/testing/`
- Migration: `docs/migrations/`
- Operations: `docs/operations/`
- Release: `docs/release/`
- ADRs: `docs/adr/`
- Gate receipts: `docs/release/gates/`

## Public-repository rule

Never commit production secrets, customer topology, database dumps, MQTT credentials, private keys, tokens, real passwords, production migration ID maps or sensitive operational evidence.

## Release truth boundary

MK1 is repository/software certified through the documented gates.

G0 through G15 certify the repository/software baseline. G16 is an active hardening stream with
durable telemetry latest/acceptance foundations and browser-flow evidence, but it is not a sealed
production gate. See `docs/release/g16-gap-register.md`.

Before a specific production deployment is declared certified, the environment-specific items in
`docs/release/release-checklist.md` must also be completed.
