# Site Mapper MK1 :3000 — Offline-first Security Baseline v1.0

**Status:** architectural delivery constraint, not a claim of OWASP certification or full ASVS conformance.
**Environment:** customer FIELD LAN has **zero outbound Internet access**.
**Scope:** Next.js Site Mapper :3000 and the infrastructure required to operate it. PR #225 separately retired Operational Console from the standard Compose; a previously running client container still requires controlled removal. This baseline does not certify its removal in FIELD.

## Decision

OWASP ASVS / Top 10 are **reference sources** for selecting useful controls according to actual threats, operability and customer risk acceptance. We do **not** implement every ASVS requirement as a blanket product constraint. Each selected control must have a threat, ownership, implementation scope and observable evidence. A deliberate exception is documented rather than disguised as compliance.

The customer installation must authenticate users, render the UI, collect telemetry, evaluate alarms, persist data, recover from a restart and restore backups with **no WAN, public DNS, third-party API, online identity provider, online certificate authority or cloud service**. Internal LAN connectivity remains required between authorized components.

## Mandatory runtime boundaries

| Area               | Customer FIELD LAN contract                                                                                                                                                                                                                        | Existing status / caveat                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Identity and RBAC  | Local MongoDB-backed users, scrypt, opaque server sessions, authorization on the server. No external SSO mandatory.                                                                                                                                | Implemented; deployment proof pending.                                               |
| MFA                | Local TOTP and single-use recovery codes. An internal, maintained time source is needed; no Internet NTP. Enforce only after all users are enrolled and recovery is approved.                                                                      | Code implemented; `SITE_MAPPER_MFA_REQUIRED=false` until rollout.                    |
| Password screening | `PASSWORD_BREACH_MODE=local`. Offline denylist is deliberately **partial**; no per-password HIBP HTTP requests from the customer. A larger curated corpus may be shipped in a separately reviewed offline release; do not claim it exists already. | Local denylist implemented. Online mode is not part of customer configuration.       |
| Browser assets     | All JS, CSS, images, icons and fonts served from the local deployment. No runtime CDN or remote widget requirement.                                                                                                                                | CSP is `self`-restricted; audit built assets on the final release.                   |
| Build/install      | Build and audit in developer/CI environment; distribute prebuilt, pinned, integrity-verified OCI images and all dependencies before FIELD installation. `npm ci`, `next/font/google` fetching and remote image pulls are not FIELD startup steps.  | Build-time Google font import exists; package must be built before air-gap delivery. |
| HTTPS              | Local DNS or approved hosts mapping; Caddy `tls internal` and client trust of its private root CA; CA material backed up. No public ACME / Let's Encrypt or cloud certificate dependency.                                                          | Candidate Caddy configuration exists; FIELD validation pending.                      |
| Time               | Customer LAN NTP or approved internal authoritative clock; monitor drift for TLS, TOTP, audit chronology and telemetry time series.                                                                                                                | Infrastructure requirement, not yet evidenced.                                       |
| OT/telemetry       | MQTT, SNMP, Modbus and internal history adapters restricted to authorized LAN peers; TLS or approved isolated transport per protocol and field constraints. No cloud broker as fallback.                                                           | Partially in code; firewall, ACL and transport evidence pending.                     |
| Data               | MongoDB / TimescaleDB and all recovery artifacts remain under customer-controlled storage. No background cloud sync or remote error reporting.                                                                                                     | Storage contracts exist; verify each deployment.                                     |
| Updates            | Controlled offline import via approved, integrity-verified bundles; preserve rollback, database backups and secret/CA continuity. No auto-update dependency.                                                                                       | Delivery process must be formalized.                                                 |
| Observability      | Logs, event audit, alarms and diagnostics local; support exports reviewed for customer-sensitive data.                                                                                                                                             | Audit mechanisms exist; release review pending.                                      |

## Runtime network policy

- Default deny outbound WAN for the customer host/containers; explicitly allow only necessary internal LAN destinations and protocols.
- Disable LAB REMOTE/Cloudflare tunnel profiles, cloudflared, online telemetry endpoints, remote analytics and externally managed identity dependencies for FIELD.
- Keep the frontend and API reachable through approved LAN HTTPS (normally :443); :3000 is the private upstream, not the general client entry point.
- No live password breach-service lookups in FIELD. The online implementation may remain available for **non-customer developer environments**, but customer runtime configuration must be `PASSWORD_BREACH_MODE=local`.
- Do not enable external DNS or use public CA fallback to compensate for missing internal PKI.
- Do not turn network enforcement into blocking legitimate OT traffic, local NTP, internal DNS or LAN backups.

## Security baseline categories

1. **Identity:** password storage, local MFA when operationally ready, session inactivity/absolute expiry, revocation, role lifecycle, recovery.
2. **API:** server-side RBAC, per-object permissions for high-value objects, CSRF/origin checks, bounds/schema validation, safe errors, throttling.
3. **Secrets:** field provisioned keys, separate encryption keys by purpose, restricted disclosure with step-up authentication, local rotation and audited recovery.
4. **Infrastructure:** hardened containers, minimal ports, LAN firewall, broker ACL, private HTTPS, safe DB auth, secure time.
5. **Integrity and continuity:** durable telemetry and alarm correctness, local backups, restore tests, offline updates, documented rollback.
6. **Evidence:** CI checks in development and offline-in-LAN field acceptance; no third-party certification claim.

## Acceptance for the air-gapped environment

Before customer approval, verify under **physically disabled WAN and no public DNS**:

- [ ] Login / logout / expired and revoked sessions still work.
- [ ] TOTP login/recovery works against synchronized internal clocks, if MFA is enabled.
- [ ] Bootstrap, change-password and user management work with `PASSWORD_BREACH_MODE=local` and never call Internet.
- [ ] Every page, font, script and icon loads without external requests.
- [ ] Caddy HTTPS chain verifies with client-installed private CA, including restart with no WAN.
- [ ] MQTT / SNMP / Modbus and Timescale ingestion, alarms, histories and exports continue to operate.
- [ ] No Cloudflare, HIBP, public ACME, CDN, update server, public DNS or online NTP is a startup prerequisite.
- [ ] Recover from service/host restart and restore an offline backup without losing CA or encryption keys.
- [ ] Firewall logs and an authorized network test show no unexpected WAN egress.

## Exceptions and nonclaims

This baseline does **not** certify OWASP, imply full ASVS L2 coverage, guarantee absence of vulnerabilities, or replace customer deployment review and penetration testing. The initial offline password list is limited. Expand it only with a controlled local dataset and explicit acceptance of update ownership, size and provenance. Document deviations based on operational threats and residual risk instead of inventing controls that rely on services the customer cannot reach.

**Change discipline:** this security baseline does not itself authorize changes to Operational Console, the BDFB breaker model, alarm rule semantics or customer running deployment. The independently merged PRs #224 (rules) and #225 (Compose removal) need their own UAT; see [MK1 v2.0](../certification/rfp-acceptance/10-UAT-MK1-V2-PLAN.md).
