# S05 — Controlled telemetry recovery

Status date: 2026-11-05

This runbook is the HU-038 operational contract for the OFFICE/FIELD profile. It does not replace the existing MQTT/SNMP architecture, Timescale history ADRs, or the generic history-connectivity incident guide.

## Invariants

1. MongoDB and TimescaleDB volumes are never deleted as a recovery technique.
2. A failed integration is recovered at the smallest responsible boundary.
3. LIVE state and historical persistence are separate health dimensions.
4. TimescaleDB is historical authority; it is not queried to manufacture current Modbus/LIVE values.
5. Missing samples are never fabricated after an outage.
6. Commissioning mappings are not recreated merely because a transport restarted.
7. LAB automation never promotes data to FIELD verification.
8. A recovery action must be preceded and followed by evidence.

Forbidden recovery shortcuts:

```text
docker compose down -v
dropDatabase()
truncate/drop Timescale history
reseed all topology to repair transport
change gateway serial/sourceIdentity as a connectivity workaround
recreate all bindings after broker/collector restart
```

## State model

| Component                   | HEALTHY                                    | DEGRADED/OFFLINE effect                                                         | Allowed first recovery                                                                         |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| MQTT broker                 | Authenticated publish/subscription works   | MQTT source becomes STALE/OFFLINE; SNMP and stored history may remain available | Restart/recreate Mosquitto only after config and credentials are verified                      |
| Site Mapper MQTT subscriber | `subscribed` and source freshness advances | RAW/LIVE MQTT stops advancing                                                   | Let reconnect/backoff operate; restart Site Mapper only if subscriber is irrecoverably stopped |
| SNMP collector              | Polls accepted and observations advance    | Affected SNMP source becomes STALE/OFFLINE; MQTT remains independent            | Restart only the affected collector                                                            |
| Telemetry Store             | `/health` returns OK and writes advance    | LIVE may remain available; history becomes DEGRADED                             | Diagnose store/Timescale boundary; restart telemetry-store only                                |
| TimescaleDB                 | PostgreSQL ready and durable rows query    | Historical persistence unavailable                                              | Diagnose DB/role/storage; use controlled role repair only when proven                          |
| MongoDB                     | Topology/bindings/configuration readable   | Commissioning/topology authority unavailable                                    | STOP writes and diagnose Mongo; never reseed destructively                                     |

## Pre-recovery evidence

During Sprint acceptance, run this first from the repository root of the local OFFICE/FIELD validation stack:

```bash
./scripts/operations/audit-office-baseline.sh   | tee .runtime/s05-recovery-before.txt
```

Capture Compose status without exposing environment variables:

```bash
docker compose   --env-file .runtime/office-test.env   -f docker-compose.telemetry.yml   -f docker-compose.office-test.yml   ps   | tee -a .runtime/s05-recovery-before.txt
```

The baseline already verifies:

- QDF inventory and 74 active breakers;
- gateway source identity;
- duplicate active binding absence;
- three SNMP Config2 sources with four bindings each;
- MQTT/entity/SNMP durable history presence;
- latest historical timestamps;
- Telemetry Store health.

Do not print `.runtime/office-test.env`.

## Scenario A — MQTT transport interruption

Evidence:

1. Mosquitto container health.
2. Site Mapper telemetry diagnostics: connection state and last connection error.
3. Per-source freshness and `lastRawAt`.
4. Confirm SNMP and Timescale are not incorrectly classified as failed.

Recovery order:

```text
verify network/ACL/credential configuration
        ↓
allow subscriber reconnect/backoff
        ↓
restart/recreate Mosquitto only if broker is the failed boundary
        ↓
restart Site Mapper only if subscriber remains stopped
```

Never recreate telemetry bindings because MQTT restarted. Stable source identity + existing bindings remain authoritative.

Acceptance:

- subscriber returns to `subscribed`;
- new RAW packets arrive from the expected serial;
- existing bindings are unchanged;
- source freshness returns LIVE;
- historical writes resume;
- pre-outage historical rows remain queryable.

## Scenario B — one SNMP collector fails

Identify the affected QDF/controller first. Restart only that collector.

The OFFICE real profile currently has independent collectors for QDF-2, QDF-4 and QDF-5. A failure in one must not require restarting the other two, Mosquitto, MongoDB or TimescaleDB.

Acceptance:

- affected controller resumes accepted polls;
- its two shunts / four Config2 measurements resume;
- unrelated QDF sources continue without reset;
- no SNMP binding is created or replaced during recovery;
- Timescale SNMP batches continue from the recovered source without fabricated samples.

## Scenario C — Telemetry Store / Timescale credential desynchronization

First execute the read-only check:

```bash
sh infra/field/repair-timescale-role.sh check
```

Only when evidence shows the persisted role password is inconsistent with the approved runtime secret may the explicit repair be used:

```bash
SITEMAPPER_TIMESCALE_REPAIR_ACK=APPLY   sh infra/field/repair-timescale-role.sh apply
```

The repair:

- reads the private password from `.runtime/office-test.env`;
- does not print it;
- synchronizes only the `site_mapper` DB role;
- restarts only `telemetry-store`;
- preserves Timescale and MongoDB volumes.

This is not a generic response to every `HISTORY_STORE_UNAVAILABLE` error. DNS, HTTP, timeout, SQL and storage faults must be diagnosed separately.

Acceptance:

- Timescale reports ready;
- Telemetry Store health is OK;
- historical rows from before the incident remain queryable;
- new writes advance after telemetry resumes;
- no sample is backfilled unless a real durable replay source exists.

## Post-recovery evidence

Repeat:

```bash
./scripts/operations/audit-office-baseline.sh   | tee .runtime/s05-recovery-after.txt
```

Compare before/after:

```bash
diff -u   .runtime/s05-recovery-before.txt   .runtime/s05-recovery-after.txt   || true
```

A normal recovery may legitimately change latest timestamps and row counts. It must not silently change:

- QDF physical inventory;
- gateway serial identities;
- meter assignments;
- active binding ownership;
- SNMP OID mappings;
- FIELD verification state.

## S05 acceptance matrix

| Scenario                       | Required evidence                                                 |
| ------------------------------ | ----------------------------------------------------------------- |
| MQTT broker interruption       | Reconnect + same source/bindings + new RAW/history                |
| Site Mapper subscriber restart | Stable session/recovery behavior; no binding duplication          |
| Single SNMP collector restart  | Only affected source recovers; other sources uninterrupted        |
| Telemetry Store restart        | LIVE independent; history resumes and old history remains         |
| Timescale role repair          | Targeted repair only; store healthy; old and new rows visible     |
| Host reboot                    | Services recover under declared restart policies; baseline passes |

## Existing automated evidence

S05 reuses existing repository coverage rather than creating a second transport implementation:

- `tests/integration/mk1-mqtt-infrastructure-chaos.test.ts` proves MQTT reconnect and QoS1 pending delivery against a real broker when its local-only gate is enabled.
- `infra/snmp-collector/chaos.test.mjs` proves malformed/missing SNMP sensor values do not silently become valid measurements.
- atomic SNMP/Timescale tests and the OFFICE baseline protect durable Config2 ingestion.
- the S05 idempotency tests prove repeating identical commissioning does not duplicate bindings.

## Gate

HU-038 is ACCEPTED for Sprint development only after the controlled scenarios have been executed on the local OFFICE/FIELD validation stack with before/after evidence. Documentation and unit tests alone are insufficient. TFARM04 execution is a later field deployment/certification gate after the development Sprints are closed.
