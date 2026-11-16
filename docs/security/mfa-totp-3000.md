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

## Offline QR enrollment (MK2)

- The Security page renders the `otpauth://` URI as a **client-side SVG QR** via
  the pinned, bundled `qrcode.react@4.2.0` package. It requires no Internet,
  public DNS, CDN, Google Charts, QR image API, or external runtime request.
- The QR embeds the same TOTP provisioning URI returned by the existing
  authenticated `POST /api/auth/mfa` enrollment flow; it does **not** change
  how the backend creates, encrypts, or validates TOTP secrets.
- The long provisioning URI is not displayed as text or copied into external
  services. The manual secret remains available behind an explicit disclosure
  for users who cannot scan a QR. Both reveal enrollment credentials and must
  be kept out of screenshots, logs, tickets, and support conversations.
- The QR uses an opaque white background, a four-module quiet zone, and SVG
  paths with no embedded remote image. The client bundle is installed during
  build/package preparation, **not** fetched from the Internet at runtime.
- Use an offline-capable TOTP authenticator or a pre-provisioned compatible
  hardware token. Keep client and server clocks reasonably synchronized with
  an approved local NTP source. No Internet is needed for subsequent codes.
- MFA enrollment is per-user; leave `SITE_MAPPER_MFA_REQUIRED=false` until
  all required accounts are enrolled and a recovery procedure is approved.
- Acceptance: activate MFA by scanning the QR with network access disabled;
  confirm the six-digit code; store recovery codes; log out and sign in using
  the next unused code. Repeat using the manual fallback without exposing
  credentials.
