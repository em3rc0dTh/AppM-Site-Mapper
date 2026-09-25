# ADR-007 — RBAC Model

**Status:** Accepted  
**Gate:** G4

## Roles

### STANDARD

Read-only operational access:

- topology read;
- power read;
- telemetry read.

### ADMIN

Operational administration:

- all Standard permissions;
- topology write;
- power write;
- settings read/write.

Admin does not receive `users:manage` in the current MK1 contract. Delegated management of
Standard users is intentionally not enabled; introducing it requires a separate explicit permission
and use-case contract.

### SUPERADMIN

All permissions, including user/role management and dangerous system operations.

## Authority rule

Authorization is evaluated on the server from the current persisted user record resolved through an authoritative session.

UI state, cookies containing role-like values and request payload role claims never grant authority.

## Forced password change

A session belonging to a user marked `mustChangePassword` is valid only for the password-change flow until the password is changed.
