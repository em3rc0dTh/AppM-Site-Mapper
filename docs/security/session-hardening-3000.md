# Site Mapper :3000 — session idle timeout hardening

**Scope:** Next.js Site Mapper on port 3000 only. **Operational Console is excluded.**

## Behavior and compatibility

- Preserve `appm_session` cookie, 8-hour absolute expiry, opaque tokens, current login/logout routes, and RBAC.
- Add 30-minute inactivity expiry using server-side `lastActivityAt` and a 5-minute renewal write interval.
- MongoDB renewal atomically rejects revoked, idle or absolute-expired sessions. Session reads are fail-closed.
- Sessions created before this change omit `lastActivityAt`: their `createdAt` is the fallback. No data migration is required. **Already-active users whose older session has exceeded 30 minutes may need to log in again.**
- Password changes and profile mutations use the same active-session validation.
- No changes to Operational Console, alarms, BDFB, MQTT/SNMP, database collections, or deployment.

## Acceptance scenarios

1. Login and authenticated routes continue to work.
2. Active requests before timeout renew activity at most once in five minutes.
3. Thirty minutes of inactivity invalidates the session.
4. No password change or profile edit with an idle session.
5. Absolute expiry after eight hours even with activity.
6. Revoked sessions never renew.
7. GitHub Actions: CI typecheck, lint, format, test, build, dependency audit.

**Not covered by this PR:** MFA, compromised-password verification, origin policy redesign, TLS/HSTS, other ASVS requirements, production acceptance and external certification.
