# AppM Site Mapper — MK1 Release Notes

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

G15 completes the original repository documentation and operational truth boundaries.

## G16 hardening stream

G16 is active and not yet a sealed release gate. The current stream adds:

- explicit telemetry source/serial binding and quarantine;
- durable acceptance/idempotency/outbox foundations;
- MongoDB-backed canonical latest telemetry in production persistence mode;
- authenticated realtime fan-out;
- hardened MQTT TLS/ACL reference policy;
- browser-certified Site → Circuit Breaker navigation, modal behavior and viewport evidence;
- production runtime fail-closed behavior when `APP_ENV` is ambiguous.

Open G16 items are tracked in `docs/release/g16-gap-register.md`, including production historical
telemetry selection/wiring, concurrency/audit atomicity and environment-specific production
certification.

## Deployment boundary

This release note describes the repository/software milestone.

A specific production deployment is only certified after the external items in `docs/release/release-checklist.md` are completed.
