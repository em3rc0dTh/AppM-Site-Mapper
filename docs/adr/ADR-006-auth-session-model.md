# ADR-006 — Authentication and Session Model

**Status:** Accepted  
**Gate:** G4

## Decision

Authentication uses server-authoritative opaque sessions.

The browser receives a high-entropy random session token in an HttpOnly cookie. MongoDB stores only the SHA-256 hash of that token.

The cookie contains no trusted role, email or user authority.

## Passwords

Passwords are hashed using Node.js `scrypt` with a unique random salt.

There is no plaintext-password compatibility path.

Changing a password revokes all existing sessions and requires reauthentication.

## Session cookie

- HttpOnly;
- SameSite=Lax;
- Secure in production;
- path=/;
- eight-hour lifetime.

## Bootstrap

The first Superadmin may be created exactly once through the bootstrap endpoint, gated by a runtime-only bearer token. Once any user exists, bootstrap is permanently closed by data state.

No bootstrap credential is stored in Git.
