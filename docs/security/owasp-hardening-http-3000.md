# Site Mapper :3000 — OWASP increment 02 (HTTP and credential boundaries)

## Scope
Only Next.js Site Mapper, HTTP mutation guard, industrial credential UI, and FIELD Caddy TLS endpoint. Operational Console is excluded.

## Implementation
- Production auth session cookie uses `__Host-appm_session` (Secure / HttpOnly / SameSite=Lax / Path=/ / no Domain), while lab HTTP keeps `appm_session`. Previous production sessions must reauthenticate after rollout. The new cookie name must be tested in the deployment's HTTPS reverse proxy.
- Origin matching is enforced even if a request claims `Sec-Fetch-Site: same-origin`; ambiguous same-site requests or requests with a session cookie but no browser-origin evidence are rejected. Source-authorized collectors without cookies still work. All HTTP mutation handlers that use the shared guard inherit this protection.
- Content-Type must be `application/json` (optional parameters allowed), not merely a substring match.
- Credential `reveal` now needs the operator's **current Site Mapper password**, with a global per-user 10 attempts per 15 minutes throttle; the password is verified server-side before the audited reveal. The commissioning UI provides a password input for this action only. Existing `set` and `remove` payloads remain unchanged.
- FIELD Caddy serves HSTS at its HTTPS endpoint only.

## Rollout notes and remaining work
- Reauthentication is expected after production cookie renaming.
- Do not expose Site Mapper over plain HTTP when `APP_ENV` is production/staging.
- Caddy trust and the public Cloudflare endpoint must be verified independently.
- These controls do not establish complete ASVS L2, MFA or full credential separation by user/site.
