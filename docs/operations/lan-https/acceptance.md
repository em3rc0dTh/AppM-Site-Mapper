# S06 · Acceptance and evidence ledger

**Current status: NOT EXECUTED.** Prepared in GitHub only; do not mark any item accepted based on a static configuration file.

| HU     | Observable criterion                                                                                       | Evidence expected                                             |
| ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| HU-039 | Two authorized LAN devices resolve and open the exact `.home.arpa` hostname offline                        | Client DNS trace + browser/curl TLS result                    |
| HU-040 | Caddy certificate SAN matches hostname, chain trusted, CA survives restart                                 | SAN/issuer output, CA fingerprint before/after                |
| HU-041 | Only authorized TCP/443 web ingress, Next.js backend not directly LAN-accessible; OT exceptions documented | Resolved Compose config, firewall and approved network probes |
| HU-042 | Host reboot recovers Site Mapper dependencies unattended                                                   | Host boot + Docker health timeline                            |
| HU-043 | Isolated process failures recovered with retry limits; no cascading DB restart                             | Incident log and recovery drill                               |
| HU-044 | Mongo, Timescale, CA/config and secrets backups restored in isolated target                                | Timestamped restore report and checksums                      |
| HU-045 | FIELD LAN has no public tunnel; LAB is explicitly opt-in                                                   | Profile manifest, active services, external ingress checks    |
| HU-046 | Login/RBAC, topology, alarm history, MQTT/SNMP, Timescale and offline operation pass                       | Golden path and signed certification report                   |
| HU-047 | Authorized remote user reaches application via approved Cloudflare route                                   | Cloudflare Access policy + remote browser flow                |
| HU-048 | Anonymous remote access denied; authorized user still constrained by Site Mapper RBAC                      | Denied/allowed session logs; SSE/WebSocket and logout checks  |

## Explicit negative tests

- Browsing `http://host:3000` from LAN must fail, while Caddy can reach loopback upstream.
- Browser HTTPS must **not** require `curl -k` or certificate warning bypass.
- Disconnecting WAN must not affect internal DNS, local login or data persistence.
- Stopping `cloudflared` must not affect LAN availability.
- Restarting Next.js must not restart MongoDB or TimescaleDB.
- No raw DB, console, telemetry store or Modbus management port accidentally published to untrusted LAN.
- No secrets, private keys, customer data or dumps included in commits or output logs.

## Signoff

- Installation / network owner: **PENDING**
- Security owner: **PENDING**
- Product acceptance: **PENDING**
- As-built + rollback verified: **PENDING**
- Date and evidence package: **PENDING**

Result: **NOT CERTIFIED** until all relevant P0 checks have signed evidence. LAN and LAB REMOTE are certified separately.
