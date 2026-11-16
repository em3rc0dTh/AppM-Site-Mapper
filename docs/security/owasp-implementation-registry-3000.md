# Site Mapper security implementation registry — OWASP-inspired controls

Scope: Next.js application on :3000, not Operational Console. The **customer FIELD LAN is air-gapped**. OWASP is a reference, not a blanket certification target. [Offline-first Security Baseline v1.0](site-mapper-offline-security-baseline-v1.md) is the controlling architectural decision for customer runtime behavior.

| Control                         | Implementation                                                      | Delivery status                                                                                 |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Session expiry                  | `src/modules/identity/application/auth-service.ts`                  | Code committed; 30m idle / 8h absolute                                                          |
| Session revocation              | MongoDB and memory identity repositories                            | Code committed; existing active-role checks preserved                                           |
| Same-origin mutation checks     | `src/shared/http/request-security.ts`                               | Code committed; cookie mutations require Origin or trusted browser evidence                     |
| Bounded JSON and allowed fields | Shared HTTP boundary and domain services                            | Existing implementation with additional content-type guard                                      |
| Production cookie hardening     | `src/modules/identity/infrastructure/auth-cookie.ts`                | Code committed; __Host- on staging/production                                                   |
| HTTPS/HSTS                      | `infra/field/caddy/Caddyfile`                                       | Config committed; requires deployed TLS verification                                            |
| Password breach screening       | `src/modules/identity/application/password-policy.ts`               | FIELD: offline denylist; limited coverage accepted by baseline. Online mode is dev-only         |
| Industrial credential reveal    | `src/app/api/industrial/credentials/route.ts`                       | Code committed; password step-up and throttle                                                   |
| TOTP MFA                        | `src/modules/identity/application/mfa-service.ts` and `mfa-totp.ts` | Code committed; opt-in enrollment. Mandatory rollout blocked until recovery provisioned         |
| Industrial data-plane ACL/TLS   | MQTT, SNMP, Modbus, Timescale deployment                            | Existing code partially guards ingress; customer edge configuration and network ACLs not proved |
| Per-object authorization        | API and repository domain boundary                                  | Existing server permissions; complete ASVS object/field matrix still requires review            |
| Security evidence               | GitHub Actions and field reports                                    | Code-level tests added; no production approval                                                  |

Do **not** claim OWASP ASVS Level 2 certification or full implementation for the entire standard.
A separate ASVS requirement-by-requirement matrix and field deployment validation are required.

## Rollout safeguards

- No changes to Operational Console.
- Do not merge into `main` or deploy automatically.
- Verify production HTTPS hostname before enabling Secure + __Host- cookies.
- A protected copy of `SITE_MAPPER_MFA_KEY` must be provisioned before enrollment.
- Do not enable `SITE_MAPPER_MFA_REQUIRED=true` until account recovery and onboarding are approved.
- Set `PASSWORD_BREACH_MODE=local` in customer FIELD LAN. `online` is for development/integration only and must **not** be configured in the customer's air-gapped environment. A larger locally curated corpus requires a separate reviewed offline delivery.
- Existing sessions will be forced to reauthenticate when production cookie naming changes.
