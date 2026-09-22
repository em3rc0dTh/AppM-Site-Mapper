# Legacy Identity Findings

Status: G1 security/product evidence. Legacy identity implementation is not a migration candidate.

## Observed capabilities

`lib/actions/users.ts` exposes behavior for:

- active-session lookup;
- listing users;
- creating users;
- updating users;
- deleting users;
- authentication;
- password change;
- logout;
- system database reset.

Observed role names are:

- `Superadmin`;
- `Admin`;
- `Standard`.

The Prisma reference model contains username, password, name, role, forced-password-change state and timestamps.

## Trust-boundary finding

Current legacy session behavior relies on browser cookie values for identity/role inputs instead of a cryptographically authoritative server session.

Therefore role names may survive as product vocabulary, but the session and authorization mechanism must not.

## Additional legacy risks

Current inspection confirms evidence of:

- plaintext-password compatibility;
- broad data-return behavior around user listing;
- password-changing behavior whose security relies too much on caller context;
- highly destructive database reset behavior;
- no demonstrated rate limiting around sensitive paths.

## MK1 rule

G4 starts from requirements, not from this implementation.

Authentication, session management and RBAC are rebuilt from first principles with server authority and explicit permission checks at every sensitive use case.
