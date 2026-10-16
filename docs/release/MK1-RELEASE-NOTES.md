# AppM Site Mapper — MK1 Release Notes

## MVP presentation candidate — 2026-10-16

The MK1 baseline is now documented for a reproducible **lab demonstration**.
The README, documentation index, architecture maps, quickstart, Spanish
presentation guide, history incident runbook and evidence-based MVP readiness
matrix are maintained together. The scope is a _candidate_, not a production
acceptance. See [MVP Readiness](MVP-READINESS.md).

The 2026-10-15 local test accepted one breaker with four explicit bindings,
LIVE and historical views, both Site Mapper historical tables, and a matching
Modbus TCP FC03 reading. A later history-store connection fault caused failed
writes and an unavailable 7D view; the UI was recovered, but **post-incident
historical write continuity has not been certified**.

Do not advertise all three sources, 96 circuits per source, Metasys field
commissioning, customer data migration or production resilience as verified.

## Release scope

MK1 reconstructs Site Mapper on a canonical domain, explicit trust boundaries and testable module contracts.

## Canonical topology

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

Device and Equipment are peers.

## Major capabilities

- authoritative server sessions and RBAC;
- MongoDB persistence contracts;
- topology creation/navigation/lifecycle;
- Blueprint spatial engine;
- CAS U-space allocation;
- Rack Elevation;
- Device/Equipment inventory;
- BDFB structure;
- explicit PowerPath;
- secured MQTT-to-SSE telemetry;
- operational workspace;
- Settings and user administration;
- deterministic staging-first legacy migration;
- dedicated integrated system certification.

## Removed legacy architecture

MK1 does not carry forward:

- PascalCase/lowercase runtime collection aliases;
- cookie-authoritative roles;
- plaintext password fallback;
- hardcoded broker credentials;
- generic caller-driven collection CRUD;
- React components as domain engines;
- competing Prisma/raw-Mongo persistence authority.

## Certification

G14 introduced a dedicated cross-module system certification step in CI.

G15 completes repository documentation and operational truth boundaries.

## Deployment boundary

This release note describes the repository/software milestone.

A specific production deployment is only certified after the external items in `docs/release/release-checklist.md` are completed.
