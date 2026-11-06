# S06 · Preparation, controlled deployment and rollback

**This is an operator runbook. It has not been executed on TFARM04.**
Execute only after snapshot, change approval, independent admin access, and recovery media have been verified. Do not infer the customer LAN from laboratory IPs.

## S06-A: read-only reconnaissance

1. Identify actual OS, Docker Engine + Compose versions, host interfaces, gateway, DNS/DHCP authority and static/reserved IP.
2. Record `docker compose config` with the exact environment and overlays used by that installation, redacting passwords and tokens before storing evidence.
3. Enumerate bindings for Next.js :3000, MQTT :1883, Mongo :27017, Timescale :55432, console :3100, Modbus and telemetry store. Identify required OT ingress/egress.
4. Verify whether TCP/443 and TCP/80 are free, and whether a local resolver can create the hostname record.
5. Confirm who distributes trust to client endpoints, who maintains clock sync, and where CA/data backups reside.
6. Confirm approved mode: strict FIELD LAN (no cloudflared) or LAB REMOTE (Cloudflare Access reviewed).
7. Confirm deployment uses prebuilt offline images or current integration builds; never promise air-gapped installation from an image that is not available offline.

## S06-A/B: declarative Caddy candidate

The existing base file publishes Next.js at `127.0.0.1:3000:3000`. Thus a host-networked Caddy on Linux can use loopback, avoiding rewrites of existing Mongo/Timescale/OT services.

Example **for an isolated, approved test host**, using its existing private environment file:

```sh
docker compose --env-file .runtime/office-test.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  -f docker-compose.field-lan.yml \
  config --quiet

# Only after verifying existing stack, DNS, bindings, port 443 and backups:
docker compose --env-file .runtime/office-test.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  -f docker-compose.field-lan.yml \
  --profile field-lan up -d --no-deps caddy
```

These commands are **examples, not proof of deployment**, and the private env path is illustrative. Never generate new secrets over a working installation. The Caddy service has its own persistent volumes. The version should be reviewed/pinned to an approved image digest for the customer release.

The Caddy overlay does not claim a superficial binary-level healthcheck. The separate S06 watchdog verifies HTTPS, the exact hostname, local CA trust and Next.js /api/health without `-k`. See [operational implementation](operations.md).

## DNS and trust workflow

1. Configure private DNS mapping approved hostname to the stable/private host IP.
2. After authorized Caddy initialization, inspect the certificate SAN.
3. Obtain only the public CA root from Caddy persistent storage. Publish its fingerprint via a trusted independent channel.
4. Install trusted root in managed clients; verify from Windows/Linux browsers without TLS bypass.
5. Verify access and login over HTTPS even when public WAN is unavailable.

## HU-042/043 supervisor and watchdog

- Docker `restart: unless-stopped` helps with process/daemon restart but does not establish boot ordering, WAN independence, OS readiness, or app functional health.
- Repository includes proposed systemd units and timer templates in `infra/field/ops/systemd/`. Their installation remains gated on actual Linux deployment. It must not blindly re-run a build or a seed on every boot.
- Watchdog states: HEALTHY -> SUSPECT -> DEGRADED -> RECOVERING -> HEALTHY/LOCKOUT.
- Initial proposal: checks at 60s, 3 consecutive failures, max 3 recovery attempts in 15m. Confirm with customer reliability requirements.
- Never restart Mongo/Timescale because Caddy has failed. Record each action locally; require explicit intervention after retry exhaustion.

## HU-044 backup / restore

- Record current Mongo replica set state and perform an engine-consistent backup.
- The repository backup candidate uses `mongodump`, `pg_dump -Fc`, encrypted `age` artifacts and a required off-host mount. Backup Timescale/PostgreSQL with a database-consistent mechanism; do not copy open volume directories as the only backup.
- Backup Compose version/config, DNS/firewall instructions, private config, Caddy CA keys and Caddy data securely.
- Keep backups off-host with retention and access controls. Set RPO/RTO with customer.
- Restore to **an isolated environment** first, confirm application identities and TLS continuity, never overwrite the live data during a restoration drill.

## LAB REMOTE optional

Only after Cloudflare Access protections and existing tunnel topology are reviewed: `docker-compose.lab-remote.yml` defines an opt-in connector. It is **not** required for FIELD LAN and is not activated by any default startup path. Do not create a duplicate of an already-running `cloudflared-site-mapper` container or change live Worker routes blindly.

## Rollback

- DNS/firewall: keep emergency local admin/SSH access; apply reversible rules and maintain rollback window.
- Caddy: stop **only** the Caddy service (not `down -v`), restore approved proxy config and existing local access.
- CA: restore its protected persistent state; do not regenerate/replace the root to fix a symptom.
- Database services: leave Mongo/Timescale and their volumes untouched.
- Public tunnel: remote route changes require independent Access/Cloudflare rollback; must never be a prerequisite for internal LAN operation.

## Runbook completion

Capture the exact image digests, Compose configuration digest (redacted), branch+commit, DNS record, certificate fingerprint, port scan results from authorized networks, verified backup/restore evidence, restart logs and acceptance signature.
