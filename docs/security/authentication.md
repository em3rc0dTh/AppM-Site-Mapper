# Authentication Security Model

## Trust boundary

```text
browser
  │ opaque cookie token
  ▼
server
  │ SHA-256(token)
  ▼
sessions collection
  │ userId
  ▼
users collection
  │ authoritative role/lifecycle
  ▼
permission check
```

## Properties

- no client-readable role authority;
- no plaintext-password fallback;
- scrypt password hashing;
- timing-safe bootstrap-token comparison;
- login rate limiting;
- session expiry;
- logout revocation;
- password-change session invalidation;
- active-user lifecycle check on every session resolution;
- safe user DTO excludes password hash.

## Collections

- `users`;
- `sessions`;
- `auth_rate_limits`.

Production indexes include unique email/id/token hashes and TTL cleanup for sessions/rate-limit windows.


## Password recovery and first sign-in

SiteMapper uses administrator-assisted password recovery. It does not claim to send
password-reset links by email when no mail delivery service is configured.

- a SuperAdmin creates a user with a temporary password;
- the new user is persisted with `mustChangePassword=true`;
- successful login redirects the user to `/change-password` before operational access;
- the user enters the temporary password, a new password, and confirmation;
- changing the password clears `mustChangePassword`, revokes every user session, and requires a fresh login;
- if the user forgets a password, a SuperAdmin may issue a new temporary password;
- issuing a recovery password immediately revokes the user's existing sessions and restores `mustChangePassword=true`.

The public `/forgot-password` page describes this controlled recovery process. It does not expose
whether an account exists and does not perform unauthenticated password mutation.
