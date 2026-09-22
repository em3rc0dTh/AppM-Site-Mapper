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
