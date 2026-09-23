# MK1 Security Baseline

**Status:** Implemented software baseline; environment-specific production validation still required.

## Trust model

- browser-controlled state is untrusted;
- authentication and authorization are server authoritative;
- secrets are runtime-only;
- external inputs are validated before domain use;
- password hashes and secret material are never exposed through safe DTOs;
- public-repository status is treated as an additional exposure constraint.

## Authentication and session controls

Implemented:

- scrypt password hashing;
- no plaintext-password compatibility;
- opaque session token;
- only token hash persisted;
- HttpOnly cookie;
- Secure cookie in production;
- SameSite=Lax;
- eight-hour session lifetime;
- logout revocation;
- session revocation after password/role/lifecycle changes;
- forced password change for temporary credentials;
- active-user lifecycle check during session resolution;
- login rate limiting;
- one-time Superadmin bootstrap guarded by runtime secret and timing-safe comparison.

## RBAC

Roles:

- STANDARD;
- ADMIN;
- SUPERADMIN.

Permissions are server evaluated. See `docs/security/rbac-matrix.md`.

## Telemetry

Implemented:

- MQTT credentials remain server-side runtime configuration;
- authenticated `telemetry:read` SSE;
- topic-prefix allowlist;
- payload-size and JSON validation;
- unique Device/Equipment identity resolution;
- bounded browser subscriber count;
- reconnect behavior;
- no committed broker fallback credential.

Previously committed legacy MQTT credentials remain considered compromised and must be rotated before production use.

## Browser headers

Configured globally:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- restrictive `Permissions-Policy`;
- Next.js powered-by header disabled.

A full Content-Security-Policy is not yet configured and is recorded as a release limitation requiring environment-specific design/validation.

## Repository controls

The repository excludes environment files, private key/certificate patterns, dumps/exports and runtime artifacts where configured.

Never commit production dumps, migration ID maps, customer topology or runtime secrets.

## Certification boundary

CI certifies application security behavior covered by unit/integration/system tests and runs a production dependency audit.

It does not replace:

- infrastructure/network security review;
- production secret rotation evidence;
- penetration testing;
- production CSP validation;
- production load/DoS validation.
