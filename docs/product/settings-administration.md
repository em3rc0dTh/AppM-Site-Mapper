# Settings & Administration

**Gate:** G12  
**Status:** Accepted

G12 decomposes legacy Settings into explicit responsibilities instead of recreating the previous monolith.

## Profile

Authenticated administrative users can update their own display name. Identity remains server-authoritative.

## Security

Password change:

- verifies the current password;
- requires at least 12 characters for the new password;
- stores only the scrypt password representation;
- revokes every active session after a successful change;
- forces reauthentication.

Users created with temporary credentials are routed to the password-change surface before operational authorization succeeds.

## Users

User management requires the `users:manage` permission, which is Superadmin-only in the current
MK1 RBAC contract.

Supported operations:

- list safe user projections;
- create user;
- assign role;
- archive/restore user;
- force temporary-password replacement through `mustChangePassword`.

Protections:

- password hashes are never returned;
- the active actor cannot change their own role or lifecycle through user administration;
- the final active Superadmin cannot be demoted or archived;
- role/lifecycle changes revoke the target user's sessions.

## System

Settings may expose non-secret runtime facts such as:

- APP environment;
- persistence mode.

Secret values are never rendered.

## Danger Zone

The legacy database-reset action is intentionally not migrated into production runtime.

Destructive cleanup belongs only in explicit migration/test tooling with separate operational controls.
