# Legacy Security Findings

This document records migration blockers discovered in the legacy implementation. It intentionally excludes credential values.

## Do not migrate

1. MQTT credentials committed in application code.
2. Telemetry SSE endpoint exposed without authoritative session enforcement.
3. Browser/client-readable cookies used as inputs to session/RBAC decisions.
4. Plaintext-password compatibility.
5. User/password actions whose security depended on trusted caller behavior.
6. Broad user reads without strong output minimization.
7. Generic dynamic CRUD and weakly typed payloads.
8. Missing rate limiting on sensitive operations.
9. Missing global browser-security policy baseline.

## Migration implication

Identity/authentication, authorization, telemetry security and secret handling are reimplemented from first principles. Legacy code in these areas is evidence only.

Legacy credentials that were committed must be considered exposed and rotated outside this public repository.
