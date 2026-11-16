# G4 — Identity / Auth / RBAC Receipt

**Status:** PASS

## Delivered

- scrypt password hashing with random salts;
- opaque random session tokens;
- server stores only token hashes;
- authoritative session/user resolution;
- HttpOnly/SameSite/Secure-in-production cookie policy;
- login rate limiting;
- logout/session revocation;
- password change with current-password verification;
- password change revokes all sessions;
- one-time protected Superadmin bootstrap;
- server-side RBAC;
- forced-password-change authorization boundary;
- identity repository adapters for MongoDB and tests;
- login/logout/session/change-password/bootstrap routes;
- authentication/RBAC ADRs and security documentation;
- unit and integration tests.

## Explicitly absent

- client-trusted role cookies;
- plaintext password fallback;
- hardcoded credentials;
- unauthenticated role mutation.

## Gate verdict

PASS — the final implementation passed typecheck, lint, format, unit tests, integration tests, production build and production dependency audit.
