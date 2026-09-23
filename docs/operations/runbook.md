# Site Mapper MK1 Operations Runbook

## Purpose

This runbook covers repository/runtime operation for the MK1 software baseline. Provider-specific deployment commands are intentionally not hardcoded.

## Pre-deployment

1. Confirm the intended commit is on `main`.
2. Confirm the latest `main` CI run is green.
3. Confirm `npm audit --omit=dev --audit-level=high` passes.
4. Configure runtime environment variables outside Git.
5. Confirm `APP_ENV=production`.
6. Confirm `APP_PERSISTENCE=mongodb`.
7. Confirm MongoDB backup/restore capability.
8. Confirm legacy MQTT credentials have been rotated before enabling telemetry.
9. Confirm HTTPS termination is active before production session use.
10. Review `docs/release/known-limitations.md`.

## Build

```bash
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:integration
npm run test:certification
npm run build
npm audit --omit=dev --audit-level=high
```

## First production initialization

Use the runtime `BOOTSTRAP_ADMIN_TOKEN` to create the first Superadmin through the bootstrap endpoint.

Do not place the token, password or HTTP request containing them in repository documentation, screenshots or logs.

After the first user exists, the application rejects another bootstrap through the application contract.

## Persistence startup

MongoDB persistence requires valid `MONGODB_URI` and `MONGODB_DB_NAME`.

Production must not use the memory repository.

Validate that the required collections/indexes are available through the application bootstrap/initialization path before opening the service to users.

## Telemetry startup

Keep:

`TELEMETRY_ENABLED=false`

until all of the following are true:

- broker URL is configured;
- any required broker credentials are rotated/current;
- topic prefix/filter are verified;
- broker ACLs are appropriate;
- Device/Equipment serial mappings exist;
- authenticated SSE access is smoke-tested.

Then enable telemetry and verify:

1. broker connection;
2. subscription;
3. valid payload ingestion;
4. Device/Equipment identity resolution;
5. authenticated browser stream;
6. reconnect behavior after a controlled disconnect.

## Health and smoke verification

After deployment verify:

- application responds;
- login succeeds for an authorized account;
- unauthorized protected access is rejected;
- Network/topology navigation loads;
- one known deep link resolves;
- Blueprint layout loads for a Room/Substructure;
- Rack Elevation agrees with CAS;
- PowerPath page reads persisted paths;
- telemetry endpoint requires authorization;
- Settings exposes no secret values.

## Incident response

If a release behaves incorrectly:

1. stop further destructive/admin operations;
2. capture the deployed commit SHA and runtime logs without secrets;
3. determine whether the issue is application, database, identity or telemetry;
4. disable telemetry if broker traffic is implicated;
5. restore database only through the documented backup/restore process;
6. roll back application to the last certified commit when appropriate;
7. retain incident evidence outside the public repository if it contains customer/runtime data.

## Logging rule

Logs may contain event names, entity IDs where operationally acceptable, error categories and non-secret metadata.

Logs must not contain:

- passwords;
- session tokens;
- bootstrap tokens;
- MongoDB URIs;
- MQTT passwords;
- private keys;
- raw customer exports.

## Shutdown

Application shutdown must not delete canonical data.

MongoDB remains the source of persisted production state. Telemetry latest-value state is in-process and may be reconstructed from future broker traffic after restart.
