# Site Mapper :3000 — Native TOTP MFA

## Scope

TOTP MFA belongs to Site Mapper login and personal Security settings only.
Operational Console is excluded.

## Behavior

- TOTP seeds are AES-256-GCM encrypted using the distinct runtime-only
  `SITE_MAPPER_MFA_KEY` (32 bytes, hex or base64) and AAD bound to the user ID.
  Seeds and pending enrollment data never appear in normal user DTOs.
- Enrollment requires an authenticated, non-temporary session and the user's
  current password. Pending enrollment is valid for 10 minutes. Confirmation
  requires a valid TOTP code and revokes all active sessions.
- Once enabled, every new login requires a six-digit TOTP code in addition to
  the password; a committed MongoDB replay fence prevents reuse of a previously
  accepted 30-second counter across replicas.
- Disabling MFA requires the current password, an unused TOTP code, and session
  revocation. Disabling is forbidden while the global MFA requirement is enabled.
- Accounts not yet enrolled continue using their existing login when
  `SITE_MAPPER_MFA_REQUIRED=false`.
- `SITE_MAPPER_MFA_REQUIRED=true` blocks unenrolled accounts from logging in.
  **Do not activate it before account enrollment, a documented recovery process,
  and an approved plan for onboarding new users.**

## Field release prerequisites

- Keep the same private encryption key on all replicas and in protected backups.
  Key loss locks out enrolled accounts; arbitrary key changes are unsafe.
- Keep NTP in sync between application and authenticator.
- Design and validate a secure recovery mechanism before mandatory MFA.
- Verify MFA flows with genuine client devices before customer rollout.
- Full ASVS L2 coverage and production acceptance remain separate.

## Recovery codes

MFA confirmation generates eight independent 128-bit random recovery codes, shown once.
The database stores only user-scoped SHA-256 digests. Each recovery code is consumed
atomically in MongoDB or memory and cannot be reused. An operator may use a remaining
recovery code at login or as the second factor alongside their password to disable
MFA and re-enroll. Protect printed/offline copies; losing all codes and the authenticator
requires a separately approved administrator recovery process.
