# Site Mapper :3000 — OWASP increment 02 (HTTP and credential boundaries)

## Scope

Only Next.js Site Mapper, HTTP mutation guard, industrial credential UI, and FIELD Caddy TLS
endpoint. Operational Console is excluded.

## Implementation

- Production session cookie uses `__Host-appm_session` (Secure, HttpOnly, SameSite=Lax,
  Path=/, no Domain); lab HTTP retains `appm_session`. Previous production sessions must
  reauthenticate. Verify the new name through HTTPS.
- Origin must match even if a request claims `Sec-Fetch-Site: same-origin`. Ambiguous same-site
  cookie-authenticated writes are rejected. Authenticated machine collectors without cookies remain
  supported.
- Content-Type must be `application/json`, allowing standard parameters.
- Credential `reveal` requires the operator's **current Site Mapper password**. The server limits
  attempts to 10 per user per 15 minutes, verifies the password, and records the successful reveal.
  The commissioning UI supports this step. Existing `set` and `remove` payloads remain unchanged.
- FIELD Caddy serves HSTS at its HTTPS endpoint only.

## Rollout notes and remaining work

- Reauthentication is expected after production cookie renaming.
- Do not expose production or staging sessions over plain HTTP.
- Caddy trust and the public Cloudflare endpoint need independent verification.
- Legitimate scripted cookie-authenticated mutations must send an Origin header. CI HTTP journeys now
  use the local application origin.
- These controls do not establish full ASVS L2 or full credential separation.
