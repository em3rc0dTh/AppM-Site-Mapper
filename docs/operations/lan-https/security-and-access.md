# S06 · Security and access contract

## Two modes, not one public deployment

| Attribute | FIELD LAN | LAB REMOTE |
| --- | --- | --- |
| Canonical URL | https://sitemapper.thradex.home.arpa | https://site-mapper.thradex.workers.dev |
| DNS | Local resolver, no WAN dependency | Cloudflare-managed public host |
| TLS | Caddy private CA, trusted on clients | Cloudflare public TLS |
| Authentication | Site Mapper session + server RBAC | Cloudflare Access **and** Site Mapper RBAC |
| Inbound perimeter | Authorized LAN TCP 443 only | No forwarded router port; outbound tunnel |
| Tunnel | Disabled / not deployed | Explicit opt-in after Access approval |
| Offline | Required | Not possible |

## Required firewall and service binding review

- Allow authorized client subnets to the host only on TCP/443 for the web UI, with separate explicit OT/management exceptions.
- Block LAN HTTP/80 if a strict HTTPS-only mode is requested. Caddy disables its automatic HTTP redirect; verify port 80 is not published by another service.
- Base Next.js is host-loopback `127.0.0.1:3000` in `docker-compose.telemetry.yml`. Verify all resolved Compose overlays because service port entries may be additive.
- Do not expose MongoDB, TimescaleDB, telemetry store, console, Modbus, or admin interfaces to untrusted clients.
- MQTT (1883/TCP) and SNMP (typically UDP/161 to OT devices) require their own source/destination allowlists. Do not block known industrial paths blindly.
- Verify Docker's actual published-port and host firewall interaction; rules in UFW alone may not be sufficient.
- A tunnel being outbound-only does **not** mean it is LAN-only. Disable the connector entirely on air-gapped FIELD installations.

## Required Cloudflare controls before enabling LAB REMOTE

1. Enforce Cloudflare Access on the public hostname before enabling remote ingress; verify policy by an unauthenticated browser session.
2. Deny by default; allow only approved identities/groups. Prefer strong MFA and least privilege.
3. Confirm whether Access is applied at the Worker level or hostname level and validate SSE / WebSockets end-to-end.
4. Confirm Worker public-host allowlist, VPC service routing, no open fallback bypass, and Cloudflare account access control.
5. Preserve Site Mapper application login, session expiration, authorization and audit.
6. Tunnel token is private. Do not start two connectors unintentionally on the same host. Pin the final cloudflared image version/digest during release hardening.
7. Remote maintenance access (e.g. AnyDesk) is a separate operational security decision; it must not be confused with Site Mapper app access.

## Internal CA and host trust

Caddy's `tls internal` issues a certificate for `sitemapper.thradex.home.arpa` without public ACME. Caddy storage in `/data` must survive restarts and be backed up securely. Export **only** `/data/caddy/pki/authorities/local/root.crt` after CA initialization to the authorized endpoint management workflow, verify its fingerprint out-of-band, and install into the authorized OS/browser trust store. Never distribute `root.key` or Caddy's entire data directory to clients.

Clients must use local DNS even without WAN; verify that alternate DoH configuration does not bypass internal resolution. Maintain a correct local clock/NTP policy so TLS validation survives isolation.

## Isolation caveat

`network_mode: host` is chosen on **Linux** to use the already-loopback-bound Next.js upstream without changing the base Compose stack. It shares the host network namespace and requires target port-443 ownership and firewall validation. This pattern is not a portable Windows/WSL2 production deployment contract. Audit and adapt before installing on another platform.
