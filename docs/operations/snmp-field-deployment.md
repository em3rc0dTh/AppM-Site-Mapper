# SNMP Field Enablement — TFARM04 customer reference / customer parity

## Scope and facts (2026-11-11)

TFARM04 is the customer-reference installation. Its **three synthetic BFDB
SNMP agents** respond to polling and existing collectors log
`snmp.poll.accepted` for four points per source. These data are synthetic
(`LAB_SYNTHETIC_NOT_DELTA`), not hardware measurements.

Traps are a **standard feature of Site Mapper**, not a separate lab product.
Only the source agent is replaceable: emulator now; commissioned device later.

Existing application, MongoDB, TimescaleDB, Mosquitto, Modbus and all polling
collectors are preserved. This overlay adds only a trap receiver plus three
industrial environment entries on `site-mapper`. Industrial RAW is persisted
in MongoDB; Timescale historic delivery is enabled but must be verified
separately. No alarm rule is invented by the sample profile.

## Existing code reused

- `infra/snmp-collector/trap-receiver.mjs` — authorized SNMPv1/v2c/v3
  notifications, bounded persistent spool, HTTP industrial ingest delivery
  and optional read-only polling.
- `src/app/api/telemetry/industrial/ingest/route.ts` — authenticated,
  bounded API; successful capture returns HTTP 202.
- `src/modules/telemetry/domain/industrial/observations.ts` — explicit
  source profiles, RAW evidence, optional event/alarm rule mapping.
- `infra/snmp-collector/integration-trap-sender.mjs` — controlled
  integration emitter; **do not deploy its infinite sender loop on TFARM04**.

## Deployment boundaries

The source's IPv4 address must be the real SNMP packet **sender IP** as seen
by the receiver, not the IP of the monitoring workstation. The sender profile
must match packet origin, SNMP version and principal. The configured trap
community or SNMPv3 user must match the source. A trap sender and a polling
agent are not necessarily the same process or address.

There are three independent credentials/configurations:

1. `INDUSTRIAL_INGEST_SOURCES_JSON`: sourceIdentity -> unique HTTP token.
2. `INDUSTRIAL_PROFILES_JSON`: commissioned source profile; begin with
   `rules: []` for provenance-only RAW. Do not claim alarms yet.
3. `SNMP_TRAP_SOURCES_JSON`: receiver identity, source IPv4, SNMP principal,
   and the **same HTTP token** for that source.

All values live in private `.runtime/office-test.env`, never in Git.
See `infra/field/snmp-field.env.example`. Existing keys must be **preserved**;
append the new keys rather than replacing the runtime file.

The trap receiver defaults to UDP/1162 published on host loopback
`127.0.0.1`. To allow a remote physical sender, set
`SNMP_TRAP_HOST_BIND` to an approved TFARM04 interface and allow UDP from
the approved sender only. Do not expose the port to the public Internet.
For production `APP_ENV=production` the receiver requires an **HTTPS**
`INDUSTRIAL_INGEST_URL`; the internal HTTP lab default will be rejected.
Use SNMPv3 authPriv on customer installations where supported.

## Preflight: read-only

From the checkout on TFARM04:

```sh
git status --short
git rev-parse --short HEAD
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
sudo docker compose --env-file .runtime/office-test.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml --profile snmp ps
```

Back up the private runtime file **outside the repository**, with mode 0600,
and retain the old commit SHA and image identifiers for rollback. Do not
display secrets in terminal output or logs.

## Activation on TFARM04 (controlled maintenance window)

1. Merge the PR after review, fetch the accepted commit on TFARM04.
2. Create a **distinct** authorized synthetic trap sender and determine its
   IPv4 address as **seen by the receiver**. Do not assume existing synthetic
   polling agents emit traps. The integration sender can be used manually
   for a bounded one-shot test; do not run it continuously. Configure its
   SNMPv2c principal or v3 user and target to match the receiver.
3. Append the three JSON keys from the example, replacing placeholders
   with local secrets, commissioned source identity and the authorized
   sender address. Do not replace the existing BFDB environment entries.
4. Inspect the effective Compose model before any creation:
   ```sh
   sudo docker compose --env-file .runtime/office-test.env \
     -f docker-compose.telemetry.yml \
     -f docker-compose.office-test.yml \
     -f docker-compose.snmp-field.yml \
     --profile snmp config --services
   ```
   Inspect the YAML locally without pasting any rendered secret-bearing
   `config` output into tickets or chats.
5. Apply **only** the app's new environment and the new service. This
   recreates only the web/API container and can cause brief downtime:
   ```sh
   sudo docker compose --env-file .runtime/office-test.env \
     -f docker-compose.telemetry.yml \
     -f docker-compose.office-test.yml \
     -f docker-compose.snmp-field.yml \
     --profile snmp up -d --no-deps site-mapper snmp-traps
   ```
   Avoid `down`, `--remove-orphans`, `-v`, or rebuilding unrelated services.
   For a new checkout, building `snmp-traps` may be necessary before `up`;
   review the expected image and changes before doing so.
6. Send exactly one controlled synthetic notification. Confirm:
   - receiver diagnostics show `trap.queued` and
     `trap.delivery.committed` (or diagnose `trap.delivery.retry`);
   - industrial response is HTTP 202 (receiver's success log is not itself
     proof of the database write);
   - RAW event ID/source/OID/receivedAt exist and are queryable;
   - existing BFDB collectors still emit `snmp.poll.accepted`;
   - historical delivery and UI are separately verified.
7. Map a real alarm only after its OEM MIB/trap varbinds and active/clear
   semantics are supported by field evidence.

The receiver's spool is a bounded named Docker volume
`snmp_field_trap_spool`; do not delete it during rollback if it contains
uncommitted notifications.

## Reversion

If there is an incident, stop **only** `snmp-traps` with the same Compose
file set, restore the previously backed-up private runtime values, and
recreate **only** `site-mapper` with the previous set of Compose files.
Do not run `docker compose down`; do not delete MongoDB, TimescaleDB,
spool or any volumes. Recheck polling collectors and API health.

## Acceptance and client transfer

- The three existing synthetic BFDB polls remain accepted.
- One controlled trap is received, authorized and persisted as RAW evidence.
- Source identity and raw notification OID can be recovered.
- No synthetic alarm is represented as physical Telxius/Delta evidence.
- Turning off the emulator does not require modifying Site Mapper source.
- For the client, provision real device IPs, SNMP principals, field MIB
  mapping, LAN/firewall policy and TLS; remove emulator services and
  synthetic secrets. Same application and receiver image/contract.

**Status**: deployment package only; no TFARM04 commands have been run
by this change, and end-to-end trap acceptance remains unverified.
