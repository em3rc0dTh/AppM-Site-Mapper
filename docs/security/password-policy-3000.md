# SEC-PASSWORD-3000 — Password policy for new credentials

Scope: Site Mapper :3000 account creation, bootstrap, and own-password changes; no login behavior changes for existing secrets.

- 12–1024 characters; no arbitrary complexity rules, Unicode accepted.
- Emergency offline common-password denylist applies for every deployment.
- Set `PASSWORD_BREACH_MODE=online` to check the full updated Have I Been Pwned breached-password corpus using the k-anonymity range protocol. Only the first 5 SHA-1 hex characters of a password hash leave the process; the plaintext never does.
- Online mode is fail closed on timeout, rate limit or network error (`PASSWORD_CHECK_UNAVAILABLE`, HTTP 503). Do not enable in a customer LAN without verified, approved HTTPS egress. Offline mode is a **partial** protection, NOT full ASVS password screening.
- This only checks new passwords, not all legacy user passwords already in MongoDB. Migration/reset policy is a separate deployment decision.

## scrypt work-factor upgrade

New hashes use `N=2^14, r=8, p=5`, preserving the existing salt and hash formats.
Legacy `N=2^14, r=8, p=1` hashes remain verifiable so current customer
accounts continue working. Legacy credentials are upgraded when users
change their password. Production login capacity and latency should be
measured before rollout because the increased work factor raises CPU cost.
