# Unified industrial gateway: implementation and local acceptance

Revision: 2026-10-23. Applies to Site Mapper PR #103 and BFDB PR #10 on
`feat/site-mapper-work-2026-10-23`. The implementation is prepared for local acceptance.
**No services, simulators, builds, test suites or integration checks were executed for this revision.**
Static inspection covers types, lint, Python/JavaScript syntax, configuration and diffs. Prior
laboratory evidence documents an older revision and does not certify this one. Gates below remain open.

## Ownership and data flow

Site Mapper owns its existing MongoDB replica set, Timescale, telemetry-store, MQTT/SNMP capture,
industrial catalog, inspector and Modbus service. BFDB supplies the broker, its existing MQTT fleet
and optional read-only synthetic Eltek agents plus notification sequences. The launcher never reads
BFDB's default Compose: it cannot accidentally start BFDB's telemetry-gateway, Timescale or Modbus.

MQTT and authenticated SNMP observations use the same normalization contract. Mongo transactions
persist the original event, per-signal history, current catalog and (when enabled) industrial historical
outbox together. Outbox work has no TTL and survives restarts and original-capture expiry. A background
worker leases chunks of at most 100 signals, posts to the existing telemetry-store and deletes work only
after acknowledgement. A crash after HTTP commit may resend; the Timescale primary key
`(observed_at, signal_id, event_id)` makes delivery idempotent. Leases expire after 30 seconds; requests
time out after 10 seconds; retry backoff is bounded at 5 minutes. Each app replica can participate.

The additive `industrial_observations` hypertable keeps normalized numeric value, original signal/event
reference, source, protocol, logical identity, kind, unit, quality, timestamps and normalized provenance.
Original raw values stay in Mongo. There is no new write to `telemetry_samples` or
`telemetry_entity_samples`: their existing electrical paths are preserved. The industrial series is a
separate representation, not another insertion into the old electrical history. No historical samples
are backfilled automatically and no deletion policy is installed for the new hypertable.

`GET /api/telemetry/industrial/series` requires `telemetry:read`. Pass exactly one of `signalId` or
`logicalPointId`, ISO `from`/`to` with timezone, and optionally returned `cursor`. Time ranges are
bounded to 366 days and pages to 1,000 observations, ordered by observed time/event/signal. Logical
queries also include approved transport aliases, preserving access to previously stored physical
series. There is no interpolation, averaging across sources or invented energy integration.
`/industrial/history` remains the Mongo normalized-evidence API; `/industrial/events` retrieves originals.

The existing equipment inspector's collapsed industrial section exposes the latest 1,000 observations
within a 24-hour historical view (the API supports further pages),
source and quality. It includes logical identity and authority when configured. It only shows signals
explicitly associated with that equipment; the laboratory does not invent physical inventory targets.

## Wire/profile matrix

| Input                       | Explicit interpretation                                       | Raw evidence and limits                                                                                       |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| BFDB MQTT U1                | V, scale 1; `numericEncoding: decimal-string`                 | Strict signed decimal syntax, finite result; no whitespace, exponent, hex, empty string or arbitrary coercion |
| BFDB MQTT I1                | A, same opt-in                                                | Only rules present in an approved profile convert strings                                                     |
| BFDB MQTT P1                | W, same opt-in                                                | Original string and raw type remain intact in Mongo                                                           |
| BFDB MQTT EP1               | kWh, same opt-in                                              | Partial packets only update supplied leaves; absent metrics do not become zero                                |
| Eltek synthetic voltage     | OID `1.3.6.1.4.1.12148.10.10.5.5.0`, Integer32 × 0.1 V        | Synthetic BFDB encoding; field scale must be confirmed                                                        |
| Eltek synthetic current     | OID `1.3.6.1.4.1.12148.10.9.2.5.0`, × 0.1 A                   | Same OID is obtained by GET and derived from measured-object varbinds                                         |
| Eltek synthetic temperature | OID `1.3.6.1.4.1.12148.10.10.7.5.0`, × 0.1 degC               | Field decimal resolution and C/F setting remain pending                                                       |
| Eltek state / alarm         | Rev54 known enums; explicit ON/OFF alarm state                | Unknown enums/OIDs retain raw evidence and UNKNOWN quality                                                    |
| Notifications               | All 16 rev54 notifications, heartbeat, unknown binary varbind | V1/v2c/v3 and informs remain available; unified lab uses v3 authPriv informs                                  |

The MQTT runtime retains BFDB `msgid`, source/topic identity and normalized source timestamps from
the existing wire parser. BFDB's numeric message counter now starts from `time.time_ns()` to avoid
reusing message IDs after emulator restart. Existing partial-update behavior and electrical modeling
are preserved. The original electrical parser was not changed.

## Logical identity and authority

Three identities stay separate: inventory `targetId`, stable `logicalPointId`, and transport signal SHA.
The existing SHA calculation is unchanged. `logical-points.example.json` explicitly binds an operational
point to historical aliases and exactly one `activeSignalId`, while `publicationSignalId` preserves its
commissioned Modbus identity. Each association includes its unit and operator evidence. A transport
alias cannot belong to two points, and publication identities cannot collide with other points' aliases.

The logical registry is pinned in Mongo. Existing logical identity, publication identity, unit and old
aliases cannot be removed or repurposed. Authority/alias changes require a higher registry version;
regression and changes within the same version are rejected. The projection resolves the active alias
and returns the commissioned ID plus the original `transportSignalId`. Inactive sources remain visible
as historical provenance and cannot win by sending a newer packet. There is no automatic failover.

When the replacement has no observation, the projection explicitly sends UNOBSERVED, rather than
presenting a reading from the former writer. The bridge accepts a newer authority epoch even if its
observation is older, rejects regressed epochs, and preserves a known alarm state until an explicit
ACTIVE/RESOLVED observation changes it. The quality word continues to expose UNOBSERVED/UNKNOWN/
STALE independently. At a controlled authority cutover the registry ledger freezes the retired writer’s last explicit
alarm evidence in Mongo. Projection includes that evidence when the new source has no known state,
so bridge restart can recover it. Acceptance must include restart during a source substitution.

## Commissioned Modbus v3

The example manifest preserves every existing v2 point dictionary and appends nine MQTT points.
It does not relocate legacy offsets 0–767 or existing extension points. Unit IDs remain 1/2/3.
The approved manifest is mounted read-only in app and bridge; the bridge pins its immutable history
in its persistent volume. Unknown OIDs never acquire an address automatically.

| Per-unit offset (zero-based) | Value                                                                | Quality word |
| ---------------------------- | -------------------------------------------------------------------- | ------------ |
| 1024                         | Existing commissioned MQTT U1, now explicitly aliased to BFDB serial | 1026         |
| 1027                         | Existing power-system condition alarm                                | 1029         |
| 1030                         | SNMP voltage                                                         | 1032         |
| 1033                         | SNMP current                                                         | 1035         |
| 1036                         | SNMP temperature                                                     | 1038         |
| 1039                         | Power-system enum                                                    | 1041         |
| 1042                         | MQTT I1                                                              | 1044         |
| 1045                         | MQTT P1                                                              | 1047         |
| 1048                         | MQTT EP1                                                             | 1050         |

Values use FC03/FLOAT32/ABCD plus one UINT16 quality word: 0 UNOBSERVED, 1 VALID, 2 STALE,
3 INVALID, 4 UNKNOWN, 5 OFFLINE. Fresh-value measurements become NaN when quality prevents use.
Known alarms retain ACTIVE=1/RESOLVED=0 independently of quality. See
`config/industrial/modbus-points.example.csv` for the exact per-unit map, stable logical ID and active
transport alias. The bridge's protected registry CSV remains available. This map is synthetic lab
commissioning and does not establish QDF physical wiring or Metasys approval.

## Prepare and start locally

Clone/check out both existing PR branches. Prerequisites: Python 3, Docker Engine/Compose and access
to required images/build dependencies. Use a dedicated private IPv4 /24 that does not overlap your
Docker networks or LAN. The default is `172.30.54.0/24`.

From Site Mapper:

```bash
python3 scripts/telemetry/industrial-lab.py --bfdb-dir /absolute/path/to/bfdb-telemetry-gateway
# Review .runtime/industrial-lab/{profiles,points,logical}.json before starting.
python3 scripts/telemetry/industrial-lab.py --bfdb-dir /absolute/path/to/bfdb-telemetry-gateway --action up
python3 scripts/telemetry/industrial-lab.py --bfdb-dir /absolute/path/to/bfdb-telemetry-gateway --action status
python3 scripts/telemetry/industrial-lab.py --bfdb-dir /absolute/path/to/bfdb-telemetry-gateway --action logs
python3 scripts/telemetry/industrial-lab.py --bfdb-dir /absolute/path/to/bfdb-telemetry-gateway --action stop
```

Preparation only writes ignored private configuration; it does not start services. Secrets are generated
once, retained in a mode-0600 file and reused. It preserves existing private profiles, logical registry
and point manifest. After upgrading an older private manifest, deliberately append approved v3 points;
do not delete its pin or volumes to bypass immutability. Copying examples over a FIELD configuration is
not part of the launcher. An alternative subnet can be supplied with `--subnet`; stop the dedicated lab
before changing it and use the same argument on subsequent operations. Do not run a second lab project
with this subnet. Environment values used by Compose come from generated configuration rather than
silently inherited shell overrides.

Compose DNS resolves `site-mapper`, `snmp-traps`, `lab-mosquitto` and `lab-snmp-01..03`. Three SNMP
agent/emitter containers use fixed addresses `.20`, `.21`, `.22` on the dedicated internal network.
Receiver profiles authorize those configured addresses AND their distinct authenticated v3 principals.
They do not rely on addresses assigned opportunistically by Docker. GET and notifications originate
from the same container. Three distinct source tokens authenticate receiver-to-app delivery. The
persistent receiver engine ID is explicit. MQTT serials/topics are `EMU-BFDB-01..03` and
`data/dev/EMU-BFDB-01..03`; legacy source-unit map and active logical aliases use the same serials.
The private broker is anonymous inside this development-only internal network and has no host port.
Docker does not publish usable host ports for a container connected **only** to an internal network.
For local UI/Modbus/database inspection, the launcher also attaches the existing host-facing
Site Mapper, Modbus, MongoDB, TimescaleDB, telemetry-store and trap receiver services to an
independent `host-access` bridge. Their existing Docker Compose port bindings remain
`127.0.0.1`-only. MQTT/SNMP emulator containers and the anonymous broker remain **only** on
the private internal network; no emulator, broker, or secret receives a public host port.
Docker assigns an available network to the access bridge independently of the operator's
`--subnet` selection. If host access is refused, first inspect `docker port
site-mapper-industrial-lab-site-mapper-1` and `docker port
site-mapper-industrial-lab-modbus-tcp-1`, then check host port conflicts; do not delete
volumes or prune unrelated networks.
FIELD security requires separately approved credentials/TLS, not the laboratory Compose.

App/Mongo/Timescale/Modbus host ports keep the existing loopback bindings. Site Mapper opens at
`http://localhost:3000`. Bootstrap/access control and real equipment association use the existing app
workflow. No inventory seed, customer object mutation or volume removal is performed by preparation.

BFDB's `config/eltek-sequence.example.json` is mounted into each synthetic agent/emitter. It defines
ON, V/A/temperature measured-object updates, heartbeat, unknown varbind, all 16 notifications and OFF.
Steps carry explicit bounded delays and raw values; `repeat` is deliberate. `eltek-sequence.mjs` can
also run standalone using `SNMP_SEQUENCE_FILE`, target/version/credentials and inform options.
The unified service adds a read-only rev54 lab agent, updates its scalars from the same sequence and
allows receiver GET polling. These are declared synthetic periodic readings, not real hardware traces.
SNMP SET access is not enabled. Original BFDB generic/Delta agent entry points remain available.

## Diagnose and stop safely

Use the launcher's status/logs actions and existing authenticated industrial diagnostics/catalog.
`operational.history` reports pending Timescale chunks, oldest age, failure count and last delivery.
`TIMESCALE_DELIVERY_LAG` means pending work is older than 60 seconds; `TIMESCALE_DELIVERY_FAILED`
means failure has occurred since the last successful delivery. Mongo work is retained while the
historical service is unavailable. Capture/spool failures remain separate MQTT/SNMP alerts. Historical
failure does not silently convert live readings to zero or acknowledge failed Mongo persistence.

A correct container list has one Site Mapper Mongo, one Timescale, one telemetry-store and one Modbus
service, plus capture/broker/emulators. Seeing BFDB `telemetry-gateway` or a second Timescale indicates
the wrong Compose invocation. Use `stop`; no launcher command removes volumes. Never share private
`.runtime` files or `docker compose config` output containing secrets. Investigate tokens, address/
principal, profile scale, queue lag and publication authority separately. An INFORM transport ACK
alone is not proof of Mongo/Timescale commit.

## Controlled LAB to FIELD substitution

1. Confirm actual source serial/topic or controller identity, address, firmware, OIDs, units/decimal
   settings, destination credentials and real inventory target with the client. Review the existing
   commissioning ledger and snapshot approved configuration; retain original catalog/history.
2. Add an approved FIELD source profile and credentials using the same MQTT or SNMP adapter. Keep
   unknown scaling UNKNOWN until evidence exists. Compute its transport SHA from
   `[protocol, sourceIdentity, topic-or-empty-string, key]`, the same legacy algorithm.
3. Quiesce the retiring transport before cutover so its final alarm evidence is durable. Append the FIELD SHA to the existing logical point's aliases, set it as the sole active signal,
   retain `logicalPointId`/`publicationSignalId`/unit/old aliases and increment registry version.
   Disable the old transport at its source/receiver profile when retiring capture; historical aliases
   remain in the registry. Review the complete change and mount the same registry in all app replicas.
4. Stop/recreate the relevant services after editing private profiles/environment. Keep the existing
   Modbus point manifest, unit and address unchanged. Apply the new registry to all replicas together;
   an older replica is refused by the durable version pin. A replacement without data reports
   UNOBSERVED; do not approve downstream consumption until source/quality/timestamps are verified.
5. Query logical history across the transition, verify source provenance, legacy 0–767, the same
   extension address and alarm ON/OFF behavior. Record actual register evidence and client acceptance.
   To reverse authority, use a newly incremented registry version, not a version rollback.

## Inventory boundary and client inputs

The supplied updated equipment workbook was inspected read-only. Its single sheet has pre/post
migration feed-position columns, with three BDFB sections corresponding to the client's 2/4/5
references. Those columns describe physical migration intent; they do not supply MQTT serials,
SNMP OIDs/scales, target IDs or telemetry authority. No customer rows are copied into the repository
and no inventory is renamed, redistributed or overwritten. Laboratory unit 1/2/3 and example logical
paths are synthetic; they are not a mapping to real QDF 2/4/5.

Client approval remains required for actual pre/post distribution, source-to-logical-point association,
FIELD serials/addresses/security principals, firmware-dependent scales/temperature mode, timestamp
trust and retention, network access, Metasys point interpretation and final operational acceptance.
The existing physical graph remains the inventory authority. A conceptual logical path such as
QDF02/PANELA3/VOLTAGE does not establish electrical connectivity by itself.

## Local acceptance gates (all pending)

| Gate                | Evidence to collect in the user's environment                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 0 Configuration     | Two approved branch checkouts, private secrets, one gateway, reviewed identities/units, no overlapping subnet                        |
| 1 MQTT              | Actual BFDB string U1/I1/P1/EP1, partial packet, original raw/type/msgid/time, explicit inventory bindings                           |
| 2 SNMP              | v3 authPriv GET plus ON/OFF, heartbeat, 16 notifications, unknown OID/binary, authenticated origin and raw event                     |
| 3 Persistence       | Mongo event/catalog/history, exactly-once Timescale identity after resend, restart recovery and no extra legacy-table insertion      |
| 4 Publication       | Approved CSV and exact FLOAT32/quality words, UNOBSERVED, stale measurements and latched alarm; legacy 0–767 unchanged               |
| 5 Resilience        | Historical service outage/recovery, process restart, queue lag/failure alert, capture saturation and no silent zero                  |
| 6 Substitution      | One active alias, reject ambiguous/unversioned configuration, LAB/FIELD history joined, same unit/address, restart with active alarm |
| 7 UI and inventory  | Existing inspector/history with explicit real association, source provenance/quality, migration map reviewed without inferred wiring |
| 8 Client acceptance | Actual FIELD packet/MIB scale evidence, downstream Metasys read and signed operational acceptance                                    |

No gate is marked passed by this document. Record exact commit IDs, environment, raw event references,
SQL/Modbus evidence, outcome and approver when those checks are later performed locally.


## Existing inventory recovery and additive industrial deployment (2026-10-23)

**Do not use the standalone industrial lab's `--action up` on an existing inventory.**
That mode intentionally owns new Mongo/Timescale volumes and its own bootstrap token,
so existing credentials and topology are not visible. The original operational
installation is the **`appm-site-mapper` Compose project**, with Mongo database
`site_mapper_crud_acceptance_02`, not `appm_site_mapper`.

A real operator recovery rehearsal on 2026-10-23 confirmed that the original
Mongo archive can restore 67 documents with zero failures, including 2 users,
25 topology nodes and 19 telemetry bindings. A separate TimescaleDB
`pg_restore` with `timescaledb_pre_restore()` and
`timescaledb_post_restore()` finished successfully; restored counts matched
the original: 39,734 `telemetry_samples` and 240,432
`telemetry_entity_samples` rows. Backup originals stay private in WSL,
and the laboratory's independent volumes must not be deleted. These facts
describe the recovery rehearsal only, **not** acceptance of the new integration.

Use the additive **existing-stack** launcher on this feature branch. It refuses
deployment when original container Compose labels, Mongo database name,
volume names, original authentication/store/Modbus credentials, Timescale DSN
or locally recorded backup SHA-256 checksums differ. It does not alter
the original `.env`; new industrial secrets, profiles, aliases and
point maps remain private under `.runtime/industrial-lab/`.

```bash
cd /mnt/c/Users/eduar/Desktop/Thradex/AppM-Site-Mapper
git pull --ff-only origin feat/site-mapper-work-2026-10-23

python3 scripts/telemetry/industrial-existing.py \
  --bfdb-dir ../bfdb-telemetry-gateway \
  --existing-db site_mapper_crud_acceptance_02 \
  --subnet 10.253.55.0/24 \
  --action prepare

python3 scripts/telemetry/industrial-existing.py \
  --bfdb-dir ../bfdb-telemetry-gateway \
  --existing-db site_mapper_crud_acceptance_02 \
  --subnet 10.253.55.0/24 \
  --backup-dir "$HOME/site-mapper-backups/20261023-161213" \
  --action preflight
```

Use the **different** subnet `10.253.55.0/24` because the stopped,
independent lab may still own `10.253.54.0/24`. The preflight checks every
Docker network for overlapping IPAM ranges. `prepare` and `preflight`
do not recreate containers or mutate databases. They never print secret values.

Only **after** `PREFLIGHT PASS` and operator review, use the same arguments
with `--action up`. That command explicitly executes the idempotent,
additive `004-industrial-observations.sql` against the **original**
TimescaleDB, then rebuilds/recreates only the existing Site Mapper,
telemetry-store and Modbus services and creates the trap receiver/broker/
emulator services. Docker Compose uses project `appm-site-mapper` and
`--no-deps`: it **does not recreate** MongoDB, TimescaleDB or mongo-init.
It adds an independent *internal* network for emulator traffic, keeping
existing application/Modbus HTTP ports and the original Compose network.
Only new lab secrets are used for SNMP sources and industrial projection;
the original bootstrap/admin credentials, telemetry-store token, Modbus
bridge token, source/unit mapping and backed-up data remain authoritative.

The `stop-lab` action stops only the new lab source/broker/trap services;
the original Site Mapper application and database remain up.
`status` and `logs` inspect the unified deployment. The old independent
project's Mongo/Timescale volumes remain untouched for future historical
provenance review; no automatic cross-database historical merge is attempted.
Industrial `LAB` sources are synthetic, do not certify physical QDF wiring
or promote any association to `FIELD` authority, and require explicit
inventory commissioning to show breaker-specific LIVE readings.

**Execution status:** This feature-branch code is prepared for the operator's
local preflight and acceptance. The author has not run Docker or test suites
against the user's workstation; a successful restoration of the old version
does not certify this new deployment.


### Initial backpressure and lab-only rate control (2026-10-23)

Operator evidence on the **existing** installation: the synthetic MQTT generator
produced approximately three messages per second, whereas the durable MQTT
capture worker completed about one message per second. Over approximately
36 seconds, the MQTT spool rose from 447 to 510 records and the MongoDB-to-
TimescaleDB outbox from 355 to 396 lots. There were zero recorded delivery
failures, zero rejected frames, and the original Mongo inventory remained
unchanged. The oldest historical delivery lot reached 63 seconds, so
`TIMESCALE_DELIVERY_LAG` should be treated as a degraded condition even
while transfers succeed. The initial sequential MQTT and historical outbox
workers explain the capacity mismatch; this observation does not prove
physical telemetry or a hardware fault.

**Containment without losing already-captured data:**

```bash
docker stop appm-site-mapper-lab-mqtt-1
```

This stops only the synthetic publisher; its durable MQTT spool, Mongo
industrial outbox, existing login, Modbus bridge, SNMP sources and both
original databases remain online. Do **not** run `stop-lab`, `up`, or
rebuild the original app as a response to this particular backpressure.

The existing-stack launcher now generates a private copy of the BFDB
`config/emulator.yaml` and mounts it **read-only** in `lab-mqtt`. The
default `publish.intervalSeconds` is **10.0**, versus the BFDB emulator's
original 1.0 s rate. Other emulator configuration stays unchanged. This is
a LAB-only capacity control, not a production throughput guarantee. A
specific `--mqtt-interval-seconds 3..120` updates only the private
copy; the BFDB checkout and physical inventory are never edited.

Once the source is stopped and both spool depths have fallen to **100 or
less**, resume only the synthetic MQTT service using the guarded launcher:

```bash
cd /mnt/c/Users/eduar/Desktop/Thradex/AppM-Site-Mapper
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/industrial-existing.py \
  --bfdb-dir ../bfdb-telemetry-gateway \
  --existing-db site_mapper_crud_acceptance_02 \
  --subnet 10.253.55.0/24 \
  --backup-dir "$HOME/site-mapper-backups/20261023-161213" \
  --mqtt-interval-seconds 10 \
  --action resume-mqtt
```

The `resume-mqtt` command checks original project labels, volume
identity, credentials, backed-up file hashes, queue depths and that
the synthetic publisher is stopped, **before recreating lab-mqtt only**.
If either queue exceeds 100 it refuses automatically; an operator should
continue to let the existing workers drain and investigate any failure.
It never modifies Mongo/Timescale or restarts Site Mapper. Before
acceptance verify backpressure remains bounded across multiple
observations while MQTT, SNMP and legacy UI operations coexist.


### Capture worker repair with both synthetic publishers stopped

An additional operator observation showed MQTT disk spool stalled at **725**
records (diagnostic timestamp remained at 21:51:08 UTC), while the Mongo
historical outbox grew beyond **1,072** entries, reporting **zero**
historical failures and a newly advancing `lastDeliveryAt`. The
`site-mapper` container remained `running` without restart. MQTT/SNMP
generators have now been stopped; do not interpret a fresh Timescale delivery
timestamp as proof that the MQTT spool is draining.

Review of `MongoObservationStore.commit()` revealed sequential
`findOne + updateOne + insertOne` operations for each signal, all in one
transaction. An individual MQTT batch can contain many circuit signals,
so this causes hundreds of sequential Mongo commands for one packet.
The feature branch now fetches existing signals together and executes
ordered `bulkWrite` catalog changes plus an `insertMany` history
write **inside the original Mongo transaction**. It keeps the existing
event fingerprint/idempotence, source cursor, transaction session, signal
evolution, alarm precedence, out-of-order history and the 10,000-signal
catalog limit. This optimization is **not yet locally verified**.

When the 3 SNMP synthetic emitters and the MQTT emulator are stopped,
the guarded app-only operation can deploy the repaired worker **without
restarting any publishers or databases**:

```bash
cd /mnt/c/Users/eduar/Desktop/Thradex/AppM-Site-Mapper
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/industrial-existing.py \
  --bfdb-dir ../bfdb-telemetry-gateway \
  --existing-db site_mapper_crud_acceptance_02 \
  --subnet 10.253.55.0/24 \
  --backup-dir "$HOME/site-mapper-backups/20261023-161213" \
  --action repair-app
```

The action refuses to run unless all four synthetic publishers report
not running, the original database identity and fixed volumes still
match, prior credentials match, and original backup checksums match.
It runs `docker compose up -d --build --no-deps site-mapper` only.
Existing Mongo/Timescale historical samples and two durable capture
spools are never removed. The app UI may momentarily disconnect.

Afterwards, compare at least two timestamped readings of
`/data/industrial-mqtt/diagnostics.json` and Mongo
`industrial_timescale_outbox.countDocuments({})` with the publishers
stopped. Both queues must trend down and there must be no new
`deliveryFailures` or `lastFailureAt`. Never clear a spool to make
acceptance pass. Only then use guarded `resume-mqtt` with 10s cadence.
SNMP legacy `EMU-DELTA-BFDB-01` bindings and synthetic
`EMU-SNMP-QDF-xx` identifiers are not automatically interchangeable.


### Verified recovery after the app-only repair

With all four synthetic generators stopped and the repaired application
started, an operator inspected the **actual persistent MQTT spool files**
rather than its potentially stale `diagnostics.json` checkpoint:

- Two observations 30 seconds apart: **zero** UUID-shaped MQTT capture
  files remained under `/data/industrial-mqtt`.
- MongoDB `industrial_events`: **3,234** preserved industrial events in
  each observation.
- Historical `industrial_timescale_outbox`: **504 → 344** pending lots.
- Historical pending lots with a `lastFailureAt` field: **zero**.

This is evidence that the captured MQTT backlog fully drained and
historical delivery continued. It does not yet certify live subscription,
real field equipment, Modbus acceptance or successful convergence of
the historical outbox to zero.

**Launcher correction:** `resume-mqtt` now checks the actual persisted
UUID-named capture files inside the current Site Mapper container, not
the stale `diagnostics.json` `pending` checkpoint. It continues to
require the original database/credential/volume/backup preflight, a
stopped publisher and a historical outbox depth **at most 100**. The
private emulation interval defaults to 10 seconds; avoid applying the
full-stack `up` action solely to restart the publisher.


### Low-rate MQTT acceptance evidence; SNMP coexistence pending

The operator confirmed the private `lab-mqtt` configuration in the
running container: `publish.intervalSeconds: 10.0` and
`publish.batchSize: 24`. Two observations separated by 60 seconds
reported:

| Observation | Industrial events in Mongo | MQTT spool files | Mongo-to-Timescale pending lots | Failed lots |
| --- | ---: | ---: | ---: | ---: |
| First | 3,258 | 0 | 0 | 0 |
| Second | 3,276 | 0 | 0 | 0 |

The 18 new events over one minute are consistent with three BFDB
simulators publishing every 10 seconds; an event count alone does not
establish exact source attribution. The reduced-rate MQTT recovery
condition is **observed passing for the measured interval**, not yet
a sustained-load or FIELD acceptance result.

After these two observations, the operator started
`appm-site-mapper-lab-snmp-01-1`,
`appm-site-mapper-lab-snmp-02-1`, and
`appm-site-mapper-lab-snmp-03-1`. Docker reported successful starts.
SNMP+MQTT simultaneous freshness, backlog stability, inventory LIVE
state and Modbus word/quality readings **remain to be confirmed**;
do not mark the corresponding client-acceptance gates as passed yet.


### Operator evidence: concurrent MQTT+SNMP and Modbus (2026-10-23)

The operator locally measured the following on the **original** `appm-site-mapper` project
and the preserved `site_mapper_crud_acceptance_02` Mongo database after restarting
three synthetic SNMP emitters alongside the throttled MQTT generator:

| Protocol | Source identity | Rows in `industrial_observations` | Age of latest record |
| --- | --- | ---: | ---: |
| MQTT | EMU-BFDB-01 | 98,882 | 3.1 s |
| MQTT | EMU-BFDB-02 | 98,882 | 3.1 s |
| MQTT | EMU-BFDB-03 | 98,882 | 3.1 s |
| SNMP | EMU-SNMP-QDF-01 | 7,938 | 1.6 s |
| SNMP | EMU-SNMP-QDF-02 | 7,938 | 1.6 s |
| SNMP | EMU-SNMP-QDF-03 | 7,925 | 2.6 s |

Total at snapshot: **320,447 industrial observations**. The Mongo-to-Timescale
industrial outbox held **7** batches, with **zero** batches marked as failed.
An earlier MQTT-only, one-minute observation established 3,258 to 3,276
industrial events, with MQTT spool depth 0, industrial historical outbox
depth 0 and no historical failures in both measurements.

The operator performed a read-only FC03 Modbus TCP request against
`127.0.0.1:1503`, register offset **1024** (FLOAT32 ABCD) and quality
offset **1026** (UINT16) for each Unit ID:

| Unit ID | Voltage, FLOAT32 | Quality word | Meaning |
| --- | ---: | ---: | --- |
| 1 | 12.229999542236328 | 1 | VALID |
| 2 | 14.920000076293945 | 1 | VALID |
| 3 | 13.779999732971191 | 1 | VALID |

**Observed pass:** six synthetic source identities have recent history;
the industrial historical outbox was nearly empty and had no recorded
delivery failures at that instant; the three commissioned synthetic
Modbus extension voltage points returned quality VALID. This is
operator-supplied runtime evidence, not an assistant-executed test.

**Not yet proven:** breaker-level LIVE indicators and data provenance in
the UI, verification of all original topology references after the final
restart, continuous full-load stability, all extension registers and
alarms, original 0–767 register regression, source substitution,
physical QDF mapping, true Eltek FIELD scalings, Metasys acceptance or
field-production authorization. Legacy SNMP bindings for
`EMU-DELTA-BFDB-01` must not be silently reassigned to any
`EMU-SNMP-QDF-xx` synthetic identity.


### Operator UI evidence: physical hierarchy and live breakers

The operator supplied multiple screenshots of their logged-in, original Site
Mapper workspace and the existing BDFB-01 physical/composition views. This
visual evidence is separate from the earlier Timescale/Modbus checks:

- **Inventory preserved:** original TELXIUS-LURIN-1 / EDIFICIO-01-TELXIUS /
  LEVEL-01 / SALA DE TRANSMISIONES / Rack-01-BDFB / BDFB-01 path appears in
  the navigation tree. BDFB physical view shows one shelf, two frames and
  four 24-position panels; FRAME-01/PANEL-01 has **3 installed, 21 available**
  positions, and the other shown panels have 0 installed.
- **Panel inspection:** FRAME-01/PANEL-01 shows **3/24 positions MQTT LIVE**
  and all three installed breakers with voltage, current, power and energy
  counter columns marked LIVE.
- **Breaker-specific evidence:** BDFB-01-PANEL-01-CB-01 shows **12.20 V,
  1.09 A, 13.30 W, 0.2633 kWh**, marked LIVE with MQTT source
  `EMU-BFDB-01` and source timestamp visible. The two neighboring breakers
  also have LIVE readings.
- **Hierarchical inspector:** screenshots of the chassis and shelf show
  **three descendant breakers reporting** and grouped V/I/P/E, distinguished
  from any incoming SNMP/DC feed totals. The home overview shows **1/1 BDFB
  monitored**, one of two primary devices reporting, and **3/11**
  associated equipment reporting.
- **SNMP physical boundary remains fail-closed:** the two original incoming
  shunts (A/B) display PENDING/UNVERIFIED and no certified current,
  rated capacity, available capacity or total input load. The original
  controller identity in the feed inspector is `EMU-DELTA-BFDB-01`, distinct
  from the `EMU-SNMP-QDF-01..03` synthetic lab sources.
- **SNMP and MQTT history:** charts exist for separate streams. Historical
  simulated SNMP shunt A/B power/current and derived energy (e.g. **163.1281
  kWh** at capture) are explicitly described as estimates from observed
  segments, **not** a measured SNMP energy counter nor a physical input
  certification. MQTT descendant metrics (e.g. **12.22 V, 3.16 A,
  38.65 W, 0.2722 kWh** at one capture) remain a different calculation.

**UI observation requiring a reproducibility check:** the FRAME-01 detail
screenshot shows `0/2 immediate children with MQTT LIVE` and `0 live
breakers below`, although the separately captured shelf, panel and breaker
views show LIVE descendants. Code inspection found both
`EquipmentFocusInspector` and `PhysicalEquipmentDiagram` initialize an
independent SSE `useTelemetryStream` subscription with an empty sample
array and `hasSnapshot=false` before the first snapshot. They compute
coverage from that empty array, which can render **zero prematurely**.
Screenshots from separate page visits cannot establish whether the frame's
zero persisted after subscription hydration. Recheck the frame after its
first SSE snapshot and verify consistent values across descendants; show a
loading/unknown state rather than a false zero if this proves transient.
Do not rewrite logical associations or promote SNMP physical authority
based on this screenshot alone.

**UI gate:** LAB breaker-level LIVE propagation is visually demonstrated
for the active panel and three breakers. Consistent settled frame coverage,
source identity display for all levels, layout/responsive behavior, and
production FIELD mapping remain pending. No real-device approval is implied.


### Operator RAW / NORMALIZED Docker I/O observer (read-only)

The existing containers intentionally emit operational counters and failure
events, rather than dumping sensitive or high-volume raw traffic into every
Docker log. Use the repository's **read-only** observer to see one persisted
MQTT frame, one SNMP GET and one SNMP INFORM capture, together with normalized
industrial signals correlated via `industrial_signal_history.eventId`. It
queries the original `site_mapper_crud_acceptance_02` database from the
existing Mongo container and performs **only Modbus FC03 reads** over the
existing host-loopback port 1503:

```bash
cd /mnt/c/Users/eduar/Desktop/Thradex/AppM-Site-Mapper
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/inspect-industrial-io.py --mode all --units 1 --legacy
# Continuously display new MQTT capture events; CTRL+C stops the observer:
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt --follow --interval 15
# View full signals from both forms of SNMP capture:
python3 scripts/telemetry/inspect-industrial-io.py --mode snmp --max-signals 256
# Query all three emulated BFDB/Eltek Unit IDs for extended Modbus points:
python3 scripts/telemetry/inspect-industrial-io.py --mode modbus --units 1,2,3
```

**RAW MQTT/SNMP** is the exact parsed capture envelope retained in the
`industrial_events.envelopeJson` field, **not** the original MQTT wire
byte sequence or SNMPv3 encrypted UDP datagram. SNMP values are the
decrypted, decoded varbinds before interpretation/scaling. To see an
unchanged live MQTT payload direct from the private broker, use:

```bash
docker exec appm-site-mapper-lab-mosquitto-1 \
  mosquitto_sub -h 127.0.0.1 -p 1883 -t 'data/dev/#' -C 1 -W 20 -v
```

**NORMALIZED** shows each signal's original rawValue, interpreted value,
unit, quality, MIB name and alarm state from the **same eventId**; there
is no positional association inferred from circuit numbers. Default is
12 normalized signals per event, configurable with `--max-signals`.

**Modbus** prints actual transmitted request and received response bytes
in hex alongside FLOAT32 ABCD and UINT16 quality decoded from each
3-register extension point. The point addresses are read from the live
bridge's **published registry** under `/data/registry.json`, not guessed
from a stale document; if unavailable, the script warns and falls back
explicitly to the example lab offsets. A `--legacy` flag also requests
the legacy circuit 1 offsets 0..7. Quality 1 means VALID; invalid or
unseen values can decode to NaN, not fabricated zero.

The read-only observer **is itself a temporary Modbus TCP client**;
its replies are what a compatible Metasys FC03 client would receive at
that moment. This does **not** establish that a Johnson Controls Metasys
controller is actually connected or reading. Transport data may contain
customer equipment metadata: keep raw captures local, do not publicly
paste authentication strings or private device identifiers.

For native Docker operational logs (not full wire frames):

```bash
docker logs --since 2m -f --tail 30 appm-site-mapper-snmp-traps-1
docker logs --since 2m -f --tail 30 appm-site-mapper-site-mapper-1
docker logs --since 2m -f --tail 30 appm-site-mapper-modbus-tcp-1
```

No Compose services, credentials, databases, emulators or Modbus registry
are modified by the observer. Avoid enabling unbounded raw wire logging
on a production network; SNMPv3 raw datagrams are encrypted by design.


### Observer fix: MongoDB projection and SNMP event transport

The first operator run of `inspect-industrial-io.py` produced
`MongoServerError: Cannot do inclusion on field signal in exclusion projection`
during event history lookup. **This was a read-only observer query error,
not a failure of capture or normalization.** The raw FC03 requests and
responses nevertheless confirmed Modbus read-only values and quality 1
(VALID) on Unit ID 1 for the legacy circuit-1 block and extension
addresses 1024–1050, including synthetic SNMP 48.1 V, 12.5 A, and 25.3°C.

The corrected observer now reads industrial history rows directly without
the invalid `{projection:{_id:0,signal:1}}` wrapper. It also selects
SNMP GET versus INFORM/TRAP from the **stored `envelopeJson.transport`**;
the event document stores top-level `protocol` but not a top-level
`transport` field. An operator should obtain the fix with:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/inspect-industrial-io.py --mode all --units 1 --legacy
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt --follow --interval 15 --max-signals 96
python3 scripts/telemetry/inspect-industrial-io.py --mode snmp --max-signals 32
```

No Docker rebuild, app restart, database migration, or binding mutation is
required. The correction is **not yet re-validated against the operator's
local Docker installation**. The observer remains read-only and does not
enable raw payload dumps in production logs.


### BDFB-02 / BDFB-03 original-stack placement plan

The operator's *original*, preserved `site_mapper_crud_acceptance_02` database
was inspected in read-only mode. `SALA DE TRANSMISIONES` contains **three
bays and four racks**:

| Bay | Rack name | Rack ID | Observed occupancy |
| --- | --- | --- | --- |
| Bay-01 | Rack-01-BDFB | `63b7c24c-6a36-4e28-92e6-db1268c43d15` | Original BDFB-01, 1 CAS EQUIPPED; **untouched** |
| Bay-01 | Rack-Switch | `0ca2fad5-d897-46bb-9803-45ed1a8849ed` | Original Cisco switch, 1 CAS EQUIPPED; **untouched** |
| Bay-02 | Rack-01-Bay-02 | `5b53762f-cc60-4118-8dbc-94ef841882a4` | No devices / 0 CAS occupied or reserved |
| Bay-03 | Rack-01-Bay-03 | `164fe884-28b0-4d80-b504-af92d0b80f15` | No devices / 0 CAS occupied or reserved |

The original BDFB-01 has Device ID
`157fcac1-cb34-44ad-b0e4-c127ad94999a` and serial **`EMU-BFDB-10`**.
Do **not** silently change its serial to the synthetic MQTT source
`EMU-BFDB-01`; the physical and telemetry identities are distinct.

The same read-only inspection reported **13** active MQTT `EQUIPMENT`
bindings for `EMU-BFDB-01` and **one** each for `EMU-BFDB-02` and
`EMU-BFDB-03`. The latter **must be audited by targetId** before
automatically adding a SOURCE or point-level MQTT binding.

An **atomic dry-run-by-default** commissioning script for the precise two
empty racks is available:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
```

The planned laboratory fixture for each new BDFB is 1 device + 1 chassis +
1 shelf + 2 frames + 4 panels with 24 occupied synthetic breaker positions
per panel (96 total), 4 MQTT metrics per position, and 1 source-level
binding. Unlike the original BDFB's three installed breakers, this full
occupancy is **an explicit saturation-lab choice**, not an observation
about field-installed breakers. Planned physical CAS placement copies the
original BDFB's measured rack U-range only when both target racks have
sufficient canonical available capacity.

**DO NOT APPLY THE PLAN YET** while the original `EMU-BFDB-02` and
`EMU-BFDB-03` MQTT bindings have unresolved destinations. The script
prints their IDs and targets and fails closed in `apply` mode rather than
reassigning original links. The user's manual output is required to review
these conflicts; no database writes or local run have been performed by
the assistant. Only after the operator verifies current backups and
approves safe source mapping should an atomic apply be considered.

Do not run the unrelated `/api/dev/seed-bfdb-emulator` endpoint against
the preserved original Mongo stack: that seed targets an isolated
memory-mode synthetic network, not the operator's surveyed physical racks.


### Serial collision resolved without editing the original BDFB-01

Original-stack dry-run evidence from 2026-10-23 confirms:

| Publisher serial | Existing active physical owner | Existing binding | Interpretation |
| --- | --- | --- | --- |
| `EMU-BFDB-02` | `BDFB SHELF` Equipment `540efb3c-d6a8-4633-b6d3-3dc719f511c5` under **BDFB-01** | `auto:mqtt:bb137f93188ec2f23b90b1c40f940d1cc4ce8adb6526e1934c2e9f4936e0dbe8`, SOURCE to shelf | ORIGINAL, DO NOT MOVE |
| `EMU-BFDB-03` | `BDFB-01-SHELF-01-FRAME-01` Equipment `4e9b6c5a-ffc8-4d06-84b2-34845b6cdfaa` under **BDFB-01** | `auto:mqtt:88cffc3d56c7eea4e6dc31b457d72eb20bc77d5a040cbe9190c2abba7579a9b0`, SOURCE to frame | ORIGINAL, DO NOT MOVE |

Both MQTT publisher identifiers had been legitimately assigned **inside the
first BDFB**, so using them as newly created BDFB-02/03 Device serials would
cause active-serial uniqueness conflicts and break the user's original
inventory contract.

The standalone targeted provisioning script was therefore revised to
**topology-only, opt-in** with dedicated unique Device serials
`LAB-BDFB-02` and `LAB-BDFB-03`. Each new Device carries
`proposedPublisher: EMU-BFDB-0x` and
`mqttCommissioning: UNMAPPED_PENDING_SOURCE_CONFLICT` as explicit
LAB metadata. It creates 96 installed *synthetic* breaker fixtures per
BDFB to support capacity demonstration and establishes matching physical
CAS allocations only in the two verified empty racks, using the existing
BDFB's 40-U mount and clearance geometry. It creates **zero MQTT
bindings** and does not alter original SOURCE bindings, historical data,
shunt mappings, registers, emulators or environment variables.

Operator workflow:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
# Read-only preflight, repeat before any write:
docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
```

If the preflight reports no dedicated LAB serial conflicts, the target
racks remain empty, and the original data backup has been reverified,
the operator can choose an explicitly scoped topology-only write:

```bash
docker exec -i \
  -e SITEMAPPER_PROVISION_MODE=apply \
  -e SITEMAPPER_PROVISION_ACK=TOPOLOGY_ONLY \
  appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
```

The script atomically adds 210 topology nodes and allocates the two
existing rack CAS ranges; it does **not** connect new breakers to live
MQTT. This is intentionally different from a finished 3-BDFB LIVE
demonstration. A later, explicitly authorized synthetic source-alias
or remapping design must allow independent LIVE simulation on BDFB-02
and BDFB-03 without moving or duplicating their publishers' existing
SOURCE bindings. New publisher aliases require matching topic **and**
`sn` payload fields and should not increase queue load without an
admission-capacity check. The existing `EMU-BFDB-02/03` physical owner
and SOURCE bindings must be preserved.

The modified script's read-only `plan` branch was exercised with a
minimal in-memory representation of the user's supplied rack, serial and
binding inventory, and its JavaScript syntax was checked; an actual
MongoDB `apply` transaction has **not** been executed by the assistant.


### Original-stack topology-only apply: UUID serialization failure

On 2026-10-23 the operator reconfirmed the dry-run source owners and verified
both original backup checksums: `mongodb-original.archive.gz: OK` and
`timescale-original.dump: OK`. The approved topology-only `apply` then
stopped with `PREFLIGHT BLOCKED: UUID generator is unavailable` while
constructing the first fixture. **The exception occurred before the
Mongo transaction was opened and before any write operations.** No new
BDFB topology, CAS occupancy or telemetry bindings were committed by
that failed run.

Root cause: the provisioning helper tried to extract a UUID string using
a regular expression over `String(UUID())`. The shell `UUID()` API
returns a BSON UUID object; its string representation is not guaranteed
to match this approach across mongosh versions. Topology `id` fields
need plain RFC-4122 UUID strings. The helper now uses mongosh's
`require("node:crypto").randomUUID()` to produce strings, validates
their v4 form, checks for intra-batch ID duplication, and probes the
generator **during plan mode**. MongoDB documents Node built-in
`require()` support in mongosh scripts.

The fixed script's full read-only `plan` and topology-only `apply`
control flows were exercised against a purpose-built in-memory
representation of the operator's 2 free racks and 2 reserved original
publisher owners: plan performed no mock writes; apply constructed
210 new topology nodes, including 192 breaker Equipment nodes, 2
42U CAS allocations, and **zero** MQTT bindings. This mock is not a
live Mongo execution.

Operator action after pull:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
# only after reviewing no new LAB serial collisions and verifying backups:
docker exec -i -e SITEMAPPER_PROVISION_MODE=apply \
  -e SITEMAPPER_PROVISION_ACK=TOPOLOGY_ONLY \
  appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
```

No app rebuild, Docker restart, data migration or volume deletion is
needed. The repository update alone does not provision the operator's
local database.


### Three BDFB lab: physical provisioning confirmed, MQTT commissioning staged

The operator's original MongoDB stack reported:

```text
APPLY COMMITTED: 210 topology documents, 0 MQTT bindings, 2 rack CAS allocations.
BDFB-01 serial=EMU-BFDB-10 rack=63b7... breakers=3
BDFB-02 serial=LAB-BDFB-02 rack=5b537... breakers=96
BDFB-03 serial=LAB-BDFB-03 rack=164fe... breakers=96
```

Therefore **195 currently installed breakers** across the three BDFBs,
of which 192 are explicitly synthetic saturation-fixture records.
Do not report 288 installed breakers; that would conflate available
addressing capacity with actual inventory.

The next phase is entirely separate. The original MQTT publisher identities
`EMU-BFDB-02` (BDFB-01 shelf) and `EMU-BFDB-03`
(BDFB-01 frame) are retained without any alias reassignment.
The new LAB Devices **already have** serials `LAB-BDFB-02` and
`LAB-BDFB-03`; they will publish under their own names and wire
`sn` values.

Two new scripts stage this transition:

1. `scripts/telemetry/commission-bdfb-lab-mqtt.mongosh.js` maps
   **96×4 electrical points plus one SOURCE per new device**,
   totaling **385×2 = 770 additive bindings**. It validates every
   parent/child ownership edge, raw point prefix, rack CAS allocation,
   LAB serial uniqueness, device provenance and the two original SOURCE
   owners. Its default mode is read-only plan; atomic `apply` inserts only
   the new LAB bindings. A second apply is idempotent (0 writes) when all
   770 active bindings exactly match.
2. `scripts/telemetry/publish-bdfb-lab-pair.py` publishes directly to
   the existing `appm-site-mapper-lab-mosquitto-1` broker via
   `docker exec mosquitto_pub`; no compose restart or new dependencies.
   Topics and payload `sn` are `data/dev/LAB-BDFB-02` /
   `LAB-BDFB-02` and `data/dev/LAB-BDFB-03` /
   `LAB-BDFB-03`. It publishes 24 panelized points per source every
   5 seconds (96 per 20 seconds), with V/A/W/monotonic synthetic
   kWh values. Broker QoS 1, retain false. This cadence avoids the
   obvious 40s scan vs 30s stale mismatch in the old synthetic feed
   under normal processing; it does not guarantee freshness if ingestion
   stalls. The publisher defaults to preview, and foreground `--publish`
   is explicit. Stopping it allows quality to decay normally.

Operator steps **after a fresh post-topology database backup**:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23

# Diagnostic, no writes:
docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/commission-bdfb-lab-mqtt.mongosh.js
python3 scripts/telemetry/publish-bdfb-lab-pair.py

# LAB-only bindings, after confirming dry-run and backup:
docker exec -i -e SITEMAPPER_MQTT_COMMISSION_MODE=apply \
  -e SITEMAPPER_MQTT_COMMISSION_ACK=LAB_ONLY \
  appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/commission-bdfb-lab-mqtt.mongosh.js

# Four batches per source (partial demonstration, then stale):
python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish --cycles 4

# For sustained LIVE demonstration (foreground; Ctrl+C stops):
python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish
```

The new bindings do **not** alter industrial Modbus unit register
commissioning, nor connect Metasys. Existing Unit ID 2/3 output may
continue to reflect the old `EMU-BFDB-02/03` synthetic publishers;
the new LAB source wiring to Modbus is a distinct approval/review step.

The two-phase synthetic topology + binding sequence was run through a
side-effect-free JavaScript in-memory integration mock: 210 synthetic
topology nodes, 192 simulated breakers, no original SOURCE binding edits,
read-only MQTT commission plan, 770 additive bindings, followed by a
second idempotent apply (0 additional records). The operator has **not
yet executed** the 770-binding apply or the two LAB publishers on the
local original stack.


### MQTT lab commissioning mongosh `.some` guard

Operator executed the 210-document topology commit, then confirmed the
original BDFB-01 still had 3 installed breakers and each of LAB-BDFB-02
and LAB-BDFB-03 had 96. The synthetic publisher preview passed
without publishing messages. However both the first MQTT plan and the
`LAB_ONLY` apply failed before a transaction with:

```text
TypeError: Array.prototype.some called on null or undefined
```

The script used `rack.cas?.some(...)` and
`breaker.accessPorts?.some(...)` on Mongo-backed records. Both
accessors were replaced with explicit `Array.isArray` guards and
`for...of` checks. Errors now identify malformed CAS or accessPorts
instead of assuming empty values. The script also logs which BDFB it
is validating. Original publisher SOURCE binding IDs, target IDs and
owner serials are now pinned exactly to the operator-provided evidence.

A mocked in-memory run exercised the current full commissioning source
with the actual supplied existing SOURCE identities, confirming a
zero-write plan, 770 LAB-only new bindings, a second apply making zero
additional inserts and no original binding target changes. This is
not yet validation inside the original mongosh runtime.

Rerun the dry-run after pulling, and run `apply` only if both BDFBs
report `READY`. **No original Mongo volume or original MQTT mapping
was modified by the failed commissioning run.**


### Missing LAB industrial events after 770-binding MQTT commissioning

Operator evidence (2026-10-24, after successful 770-binding transaction):
`LAB-BDFB-02` and `LAB-BDFB-03` each have 385 active MQTT bindings.
A query against only the last 300 global MQTT `industrial_events` returned
zero for both; **this is not equivalent to a source-indexed historical
count**. The raw industrial inspector selected a recent `EMU-BFDB-03`
event from its globally latest query, not a LAB source. Its `0_2_1`
measurements were `UNKNOWN / UNINTERPRETED`, consistent with the
current original profiles' narrow `/reported/0_1_1` rules.

The industrial capture engine reads **`INDUSTRIAL_PROFILES_JSON`** on
application startup, separate from MongoDB's `telemetry_bindings`.
A LAB binding alone does not commission industrial source capture.
`getTelemetryRuntime` explicitly filters sources against the loaded
MQTT industrial profiles before enqueueing their original RAW packet.
Whether these sources are currently loaded in the operator's actual
app container is checked by the new diagnostic script, not assumed.

Added:
- `scripts/telemetry/diagnose-bdfb-lab-ingress.py`: read-only
  comparison of the active container's profile source names, broker
  subscription filter, capture outbox counters, Compose project/config
  labels, exact source-indexed industrial event counts and catalog sizes.
- `scripts/telemetry/prepare-bdfb-lab-profiles.py`: read-only by
  default; derives profiles from exactly 385 persisted MQTT bindings per
  new BDFB. Each new LAB profile has 480 rules: 96 breakers x
  `U1` V, `I1` A, `P1` W, `EP1` kWh, `state` enumeration.
  The destination `targetId` is the exact breaker Equipment record,
  not an inferred circuit index. `U2/I2/P2/EP2` remain uncommissioned
  RAW evidence with UNKNOWN quality. Profiles use numeric decimal-string
  opt-in and laboratory-only evidence. It rejects any conflict with
  original `EMU-BFDB-02/03` SOURCE bindings.
- `INDUSTRIAL_PROFILES_FILE` (bounded, read-only and absolute): source
  profile file loaded by the Site Mapper runtime and diagnostics.
  Backwards-compatible with original `INDUSTRIAL_PROFILES_JSON` for
  installations without the file. File backing avoids Linux single-env
  value limits when serializing 960 detailed LAB rules plus existing
  profiles. The launcher now mounts the file read-only and passes
  a small `INDUSTRIAL_PROFILES_JSON='[]'` fallback.
- MQTT RAW observer `--source LAB-BDFB-02` and `--source LAB-BDFB-03`
  to avoid reporting an unrelated global latest MQTT event.

On the operator's WSL checkout:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/diagnose-bdfb-lab-ingress.py
python3 scripts/telemetry/prepare-bdfb-lab-profiles.py
```

The diagnostic is read-only and will explicitly say whether the current
container already has LAB industrial profiles. `prepare` is plan-only;
it does not write to MongoDB or configuration.

**Only after confirming profiles are absent, a fresh backup exists,
and the plan passes:**

```bash
python3 scripts/telemetry/prepare-bdfb-lab-profiles.py --apply
```

This updates **only three private lab config files** with separate backup
copies: `.runtime/industrial-lab/profiles.json`, `compose.json` and
`lab.env`. In particular, it does not overwrite original MQTT/SNMP
profiles, alter `telemetry_bindings`, change Modbus registers, touch
MongoDB data, or restart containers.

The **running Site Mapper container still has its old startup capture
source list**. Restart/rebuild ONLY the existing Site Mapper app service
through its **verified current Compose project and config files**;
inspect the output of `diagnose-bdfb-lab-ingress.py` first. Do not
guess the Compose project, run a generic `docker compose up` across
all services, drop volumes or restart databases. If the container
does not belong to a Compose project with the generated industrial-lab
overlay, reconcile the deployment definition separately before a restart.

After an explicitly controlled app-only rebuild/recreation, re-run
`diagnose-bdfb-lab-ingress.py`. It should report both LAB MQTT profiles
loaded, 480 rules each. Then publish a four-batch snapshot (two LAB
sources, 24 points each per five seconds):

```bash
python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish --cycles 4
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt \
  --source LAB-BDFB-02 --max-signals 32
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt \
  --source LAB-BDFB-03 --max-signals 32
```

Expect nonzero industrial source-indexed captures plus
`PROFILE / VALID` values for the explicitly mapped U1/I1/P1/EP1 and
state signals. Raw `msgid`, `sn` and uncommissioned secondary
measurements can correctly remain UNKNOWN. Check old sources and
original SOURCE targets remain intact before declaring success.
**Nothing in this change remaps Modbus unit IDs or certifies
Metasys reads.** Local deployment and acceptance remain pending.


### 2026-10-24: original stack uses existing-compose.json, not compose.json

The operator's new read-only diagnostic definitively identified the
**active** deployment as:

```text
com.docker.compose.project = appm-site-mapper
config_files = docker-compose.telemetry.yml,
               docker-compose.industrial.yml,
               .runtime/industrial-lab/existing-compose.json
```

`site-mapper` is subscribed to `data/dev/#`, and the MQTT industrial
outbox shows `pending=0`, but the running application has only six MQTT
profiles from `INDUSTRIAL_PROFILES_JSON`. Specifically both
`LAB-BDFB-02` and `LAB-BDFB-03` are **not** loaded; active LAB
bindings are 385 each while industrial events/catalog entries are 0
for both. Original `EMU-BFDB-02` and `EMU-BFDB-03` industrial sources
each have 875 events and remain independent.

The first approved
`python3 scripts/telemetry/prepare-bdfb-lab-profiles.py --apply`
successfully staged the 480+480 new rules under
`.runtime/industrial-lab/profiles.json`, but incorrectly modified the
**inactive isolated-stack files** `compose.json`/`lab.env`, so the
running original stack did not change. No MongoDB or service was
modified. The script has now been **corrected** to apply its read-only
`profiles.json` mount and lightweight environment fallback to the
actual `existing-compose.json` and `existing.env` files; these
changes are additive and backed up. It validates that `existing.env`
selects `site_mapper_crud_acceptance_02`, that the isolated lab
broker and original logical-points mount remain in place, and that
original MQTT/SNMP profiles are retained. Both LAB serials are appended
to the app's expected-source diagnostics, without removing old sources.

`industrial-existing.py` was updated too. Its `prepare()` function
recreates the original-stack overlay on any action; it now preserves
the same file-backed profile mount instead of overwriting the changes
on later preflight or status operations. The original `.env` is left
untouched.

Do not use the secondary isolated-stack project
`site-mapper-industrial-lab` to restart the operator's
`appm-site-mapper` application. Do not run a global Compose
`up`, `down`, volume cleanup or original database re-seeding.

**Operator runbook after the corrected branch pull:**

```bash
# Actual original project is appm-site-mapper.
git pull --ff-only origin feat/site-mapper-work-2026-10-23

# Read-only; verifies active original-stack env and LAB rules:
python3 scripts/telemetry/prepare-bdfb-lab-profiles.py

# Explicitly stage profiles onto existing-compose.json + existing.env.
# Already-staged full profile file remains preserved.
python3 scripts/telemetry/prepare-bdfb-lab-profiles.py --apply

# Read-only, strict check that the ACTIVE Compose stack matches original
# DB, secrets, mounts, project labels, LAB profile file and old services:
python3 scripts/telemetry/redeploy-bdfb-lab-app.py

# After fresh post-commission DB backup and successful strict preflight,
# explicitly rebuild and recreate only the Site Mapper application.
python3 scripts/telemetry/redeploy-bdfb-lab-app.py --apply

# Verify actual container now reads 2 LAB profiles with 480 rules each.
python3 scripts/telemetry/diagnose-bdfb-lab-ingress.py

# Publish complete 4-panel snapshot for the two synthetic sources,
# then inspect the exact source-indexed capture.
python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish --cycles 4
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt \
  --source LAB-BDFB-02 --max-signals 32
python3 scripts/telemetry/inspect-industrial-io.py --mode mqtt \
  --source LAB-BDFB-03 --max-signals 32
```

The redeploy command is restricted to
`docker compose --project-name appm-site-mapper ... up -d --build
--no-deps --force-recreate site-mapper`. Its dry-run preflight compares
the existing container's exact Compose file labels and DB, preserved
secret-sensitive environment keys, existing mounts including persistent
volumes, and dependent-service identities, **without printing
credential values**. If any critical field drifts, it fails closed
instead of recreating the application. It does not restart, migrate or
recreate original data stores, MQTT broker, Modbus gateway or SNMP labs.

Published synthetic measurements are not proof of persisted industrial
capture. Success requires a source-indexed industrial event and
`PROFILE / VALID` readings for LAB V/A/W/kWh. Do not retroactively
reinterpret original `UNKNOWN` values without evidence, nor claim
Modbus Unit ID 2/3 was changed or certified.


### 2026-10-24: LAB-BDFB-02/03 persisted industrial capture and normalization CONFIRMED

Operator command-log acceptance evidence confirms the preserved
`appm-site-mapper` Compose project passed strict app-only redeploy
preflight. The fresh post-commission Mongo backup at
`$HOME/site-mapper-backups/bdfb-lab-20261024/mongodb-bdfb-lab.archive.gz`
passed SHA-256 verification. The app was rebuilt/recreated with
`--no-deps` **without targeting Mongo, Timescale, MQTT, SNMP or Modbus**.

After app recreation, runtime diagnostics reported:

```text
telemetryEnabled=true
topicFilter=data/dev/#
industrialMqttProfiles=8
profileDelivery=mounted-file
LAB-BDFB-02 profileLoaded=true rules=480
LAB-BDFB-03 profileLoaded=true rules=480
EMU-BFDB-02 profileLoaded=true rules=4
EMU-BFDB-03 profileLoaded=true rules=4
captureOutbox pending=0, rejected=0, deliveryFailures=0, spoolFailures=0
```

The zero persisted LAB event counts in that particular diagnostic were
measured **before** the user published the new complete LAB cycle and
must not be treated as the final result.

The user then ran exactly four LAB batches per source, showing raw
MQTT circuit ranges `0_1_1..0_1_24`,
`0_2_1..0_2_24`, `0_3_1..0_3_24`, and
`0_4_1..0_4_24`. Source-filtered historical inspection subsequently
returned separate persisted MQTT industrial events and linked normalized
histories for **each source**, 222 signals in each shown P4 event.
The following P4/C1 values were normalized with
`quality=VALID, interpretation=PROFILE`:

| Signal | LAB-BDFB-02 | LAB-BDFB-03 |
|---|---:|---:|
| state | ONLINE (1) | ONLINE (1) |
| U1 | 12.41 V | 12.64 V |
| I1 | 2.93 A | 2.13 A |
| P1 | 36.31 W | 26.87 W |
| EP1 | 0.17315 kWh | 0.17311 kWh |

`msgid`, `sn` and uncommissioned `U2/I2/P2/EP2`
remain faithfully stored RAW with `UNKNOWN/UNINTERPRETED`. This
is not a normalization failure; assigning them engineering meaning
requires an explicit additional field contract.

**Proved:** 2 LAB sources, 96 synthetic breaker positions each, four
24-point publisher batches per source, persisted MQTT industrial RAW
capture, correct per-point normalization for representative P4 signals
and preservation of the original MQTT source owners.

**Not proved solely by this log:** 96x5 latest catalog coverage for
*every* breaker, sustained real-time LIVE in the UI, Timescale delivery
end-to-end, Modbus Unit IDs 2/3 mapped to these two LAB publishers, or
any Metasys field reading. Existing Modbus mapping was set to
`EMU-BFDB-01/02/03` and was deliberately not changed, so avoid
claiming the new LAB feeds are exposed as Units 2/3.

A new **read-only** checker
`scripts/telemetry/audit-bdfb-lab-capture.mongosh.js` reports
full 2x96 historical industrial catalog coverage, per-breaker
`PROFILE/VALID` electrical metrics and ONLINE state, equipment
target/point binding equality, four-panel coverage, source event counts
and the last-event age. It hard-checks that original BDFB-01 still has
three installed breakers and original `EMU-BFDB-02/03` serial+SOURCE
owners remain intact. Its PASS is a historical-capture acceptance gate;
a 90s recent event indicator is displayed separately, and passing
does not by itself certify LIVE/Modbus/Timescale.

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
  --file /dev/stdin < scripts/telemetry/audit-bdfb-lab-capture.mongosh.js
```

The checker passed a full in-memory 2x96 sample mock with 480 signals
per source and original owner fingerprints preserved; it has **not**
been run against the operator's real MongoDB by the assistant.


### 2026-10-24: FULL 192-circuit industrial catalog audit PASSED

The operator ran `scripts/telemetry/audit-bdfb-lab-capture.mongosh.js`
on the preserved original database. Actual results:

```text
BDFB-02 | raw events=4 | industrial catalog=870 | 4-metric VALID=384/384
        | ONLINE/VALID=96/96 | fully verified circuits=96/96
        | P1=24/24 P2=24/24 P3=24/24 P4=24/24
BDFB-03 | raw events=4 | industrial catalog=870 | 4-metric VALID=384/384
        | ONLINE/VALID=96/96 | fully verified circuits=96/96
        | P1=24/24 P2=24/24 P3=24/24 P4=24/24
RESULT: PASS — full historical 2x96 circuit capture coverage
```

Original BDFB-01 serial, three breaker records and
`EMU-BFDB-02/03` SOURCE owners passed the read-only checks.

The last events were 330 seconds old because the deliberate
`--publish --cycles 4` publisher had stopped. Thus this is a
**historical acceptance PASS, not continuous LIVE**. Mongo catalog
`quality=VALID` is the last interpreted sample; it is not a
real-time freshness guarantee. Site Mapper's MQTT runtime computes
`LIVE` only for a subscribed source with a source-level sample age
up to 15 seconds; 15–300 seconds is `STALE` and above 300 seconds
is `OFFLINE` (subject to a source-level sample being present).
The industrial lab profile `staleMs` is configured independently.

To inspect uninterrupted synthetic acquisition, launch
`python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish`
in one terminal (5-second source cadence) and run the read-only
audit in another. The audit reports `recent<=90s`, which is **a
weaker criterion** than MQTT runtime's 15-second LIVE threshold.
Stop the synthetic sources with Ctrl+C after the observation;
the catalog remains historically valid while freshness decays.

Industrial Timescale delivery, read-only UI values and Modbus mapping
remain independent gates. The Modbus bridge still uses its existing
`MODBUS_SOURCE_UNITS_JSON` publisher-to-Unit-ID mapping: do not
silently repoint Units 2/3 from the original `EMU-BFDB-02/03`.
A future explicitly approved additive Unit ID mapping (or a controlled
migration) must preserve the original operator's field contract.


### 2026-10-24: Repeat LAB publishing, 17 persisted events per source

The operator ran `publish-bdfb-lab-pair.py --publish`, demonstrating repeated
4-panel publication loops, then stopped the foreground publisher with
`Ctrl+C`. The subsequent source-indexed historical audit returned:

```text
BDFB-02 | raw events=17 | catalog=870 | VALID electrical=384/384
        | ONLINE/VALID=96/96 | circuits=96/96
        | P1=24/24 P2=24/24 P3=24/24 P4=24/24
        | latest MQTT event age=14s | recent<=90s=YES
BDFB-03 | raw events=17 | catalog=870 | VALID electrical=384/384
        | ONLINE/VALID=96/96 | circuits=96/96
        | P1=24/24 P2=24/24 P3=24/24 P4=24/24
        | latest MQTT event age=14s | recent<=90s=YES
RESULT: PASS — historical full 2x96 circuit catalog capture coverage
```

This closes the **recent historical industrial capture** gate, but not
continuous frontend LIVE, independent Timescale delivery, or Modbus Unit
ID assignment. The user ran the auditor after stopping the sender.
The runtime LIVE threshold for source-level telemetry is 15s and depends
on an active subscribed transport. The BDFB UI descendant telemetry
aggregator uses a separate 30s freshness bound for explicit breaker
metric bindings.

The additional read-only diagnostic
`scripts/telemetry/audit-bdfb-lab-downstream.py` queries Timescale
`industrial_observations` directly, prints Mongo's durable Timescale
outbox count, and reads the Modbus bridge's **actual** environment
source-to-Unit-ID mapping. It does not perform a Modbus FC03 read,
restart services or mutate any registry.

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/audit-bdfb-lab-downstream.py
```

For a current frontend LIVE check, run the foreground LAB publishers in
a separate terminal and inspect `/api/telemetry/diagnostics` in the
already authenticated Site Mapper browser session. Expected when
publisher is running and current readings are accepted:
`LAB-BDFB-02` and `LAB-BDFB-03` source rows report
`freshness=LIVE`; inspect the BDFB device inspector as an independent
visual gate. Never infer that status from the older industrial catalog's
`VALID` quality alone.

The original Unit ID 2 and 3 registrations for
`EMU-BFDB-02/03` must **not** be silently reassigned to the new LAB
publishers; an additive assignment to unused IDs is an explicit later
change requiring a separate backup and register-level acceptance.


### 2026-10-24: Browser telemetry diagnostics confirms LIVE 96/96 for both LAB BDFBs

The operator opened the authenticated Site Mapper browser's
`/api/telemetry/diagnostics` endpoint via its own JavaScript console
while publishing LAB-BDFB-02 and LAB-BDFB-03 continuously.

Observed runtime evidence:

```text
MQTT connection: subscribed
rejectionReasons: {}
LAB-BDFB-02: rawMessages=21, pointCount=96, mappedBreakerCount=96,
             unmappedPointCount=0, freshness=LIVE
LAB-BDFB-03: rawMessages=21, pointCount=96, mappedBreakerCount=96,
             unmappedPointCount=0, freshness=LIVE
```

Source targets were Device IDs
`13dcec28-70ed-4cc0-b29a-0f6ae57afaee` (BDFB-02) and
`1563f240-7a92-4da5-9955-2e18fd36417c` (BDFB-03).
These correspond to the two new independently commissioned LAB
sources, not the original BDFB-01 shelf/frame serial owners.

**Accepted:** runtime MQTT subscribed; ongoing LAB messages accepted
without recorded rejection; all 96 breaker addresses per new BDFB
mapped, no unmapped points; runtime source freshness LIVE.
This is stronger than a purely historical industrial catalog audit.

**Still separate:** device inspector actually rendering measured values
(the browser diagnostics response is a runtime inspection, not an
inspector screenshot); durable Timescale delivery; and a tested
Modbus FC03 contract for the new LAB identities. The existing
`EMU-BFDB-02/03` Unit IDs remain untouched. If stopped,
publisher freshness naturally degrades to STALE/OFFLINE; LIVE
describes the observed state at the screenshot time, not permanence.

For independent downstream evidence, the read-only
`scripts/telemetry/audit-bdfb-lab-downstream.py` will inspect
Timescale industrial-observation rows, Mongo's durable Timescale
outbox, and Modbus bridge source ownership without changing a mapping.


### 2026-10-24: Timescale durable history confirmed, additive Modbus eligibility next

The original operator's read-only downstream audit reported:

```text
LAB-BDFB-02 Timescale rows=8658; unique signals=870; VALID measurement rows=3744
LAB-BDFB-03 Timescale rows=8658; unique signals=870; VALID measurement rows=3744
Timescale durable Mongo outbox pending=109, retrying=0, last delivery 01:49:39 UTC, failure count=0
Bridge pointLayout=panels-4x24
EMU-BFDB-01 -> Unit 1 PRESERVED
EMU-BFDB-02 -> Unit 2 PRESERVED
EMU-BFDB-03 -> Unit 3 PRESERVED
LAB-BDFB-02 -> NOT MAPPED
LAB-BDFB-03 -> NOT MAPPED
```

**Accepted:** independently persisted Timescale industrial history
for both LAB sources (17,316 combined rows, 7,488 VALID
measurement samples), while original Modbus Unit IDs 1–3 retain
their source identities.

**Outstanding:** 109 durable Mongo Timescale delivery batches
were still pending at the sampling instant. Zero retries/failures
does not mean the queue was empty, and no data loss is implied.
With publishers stopped, repeat the downstream audit to observe
whether the queue is draining. Do not restart services while
the delivery backlog is high.

The installed Modbus bridge already supports a `panels-4x24`
address layout, 96 circuits × four FLOAT32 measurements (768
holding registers) per source Unit ID. The proposed additive mapping
is LAB-BDFB-02 → **Unit ID 4** and LAB-BDFB-03 → **Unit ID 5**,
leaving all original associations and register layouts untouched.

Before any configuration change, run the new **read-only**, 
fail-closed checker:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/plan-bdfb-lab-modbus.py
```

It reads the *running* app and bridge mapping from Docker rather than
assuming local .env values, checks bridge port/auth/layout consistency,
verifies original Unit IDs 1–3 and no collision at 4–5, checks the
actual active Compose project/file overlay, confirms both new
LAB Device identities and all 770 active point/source bindings, and
reads the Mongo Timescale outbox. It never modifies the
original `.env`, Compose, MongoDB, TimescaleDB or Modbus
register state.

**No Unit ID 4–5 assignment has been written, staged or deployed
by this change.** Assignment requires an operator-approved,
separate app+bridge-only configuration deployment and read-only
FC03 acceptance against the new Units. Publishing with the
old map cannot validate new LAB Modbus registers.


### 2026-10-24: additive LAB Modbus 4/5 deployment prepared with explicit gates

The operator's original-stack read-only Modbus preflight returned
`READ-ONLY PLAN PASS` and confirmed:

```text
EMU-BFDB-01 -> Unit 1
EMU-BFDB-02 -> Unit 2
EMU-BFDB-03 -> Unit 3
LAB-BDFB-02 -> proposed Unit 4
LAB-BDFB-03 -> proposed Unit 5
MODBUS_POINT_LAYOUT=panels-4x24
96 circuits × 4 x FLOAT32 = 768 registers per new Unit
Timescale outbox pending=0 retrying=0 during preflight
```

A subsequent independent downstream audit showed
`LAB-BDFB-02=9324` and `LAB-BDFB-03=9324`
Timescale historical rows, 870 distinct industrial signals for
each source and 4032 valid electrical readings per source.
The durable Mongo outbox then had `pending=1, retrying=0`,
which is compatible with a moving asynchronous queue, not data
loss. **Restarting must be blocked while any backlog remains.**

A separately audited add-only migration has now been staged
**in source code only**:
`scripts/telemetry/commission-bdfb-lab-modbus.py`.

It has three operating modes:

- Default: read-only; inspect actual app + bridge source identities and
  active Compose file list, compare source maps and report proposed Unit
  4/5 configuration.
- `--stage`: create a private backup of the active
  `.runtime/industrial-lab/existing-compose.json`, then add identical
  `MODBUS_SOURCE_UNITS_JSON` overrides to the **existing**
  `site-mapper` and `modbus-tcp` service sections. The original
  `.env` and `existing.env` are never edited and no container
  is restarted.
- `--deploy` without `--backup-dir`: run strict read-only preflight
  comparing the resolved Compose configs to original in-use environments,
  service token, original DB volume IDs and app/bridge mounts.
  The check rejects pending Mongo Timescale outbox batches, durable MQTT
  spool records and active LAB Python host publishers.
- `--deploy --backup-dir ...`: additionally validate the integrity of
  the actual post-commissioning Mongo archive and recreate **only**
  `modbus-tcp` and `site-mapper` with
  `docker compose ... up -d --no-deps --no-build --force-recreate
  modbus-tcp site-mapper`. Afterward, compare the two active source maps
  and refuse completion if they differ from the five-source contract.

Because `--no-build` is used, the previously accepted Site Mapper app
and gateway images are reused. Every existing volume and Compose mount
is compared against its active container before recreation. This is
**not an instruction to run a global docker-compose up/down**.

`industrial-existing.py prepare` has also been updated to recognize
the exact approved five-source mapping if present in both services of
the original overlay and retain it rather than silently losing the
Modbus commissioning configuration on a future prepare.

**Operator sequence (new branch):**

```bash
cd /mnt/c/Users/eduar/Desktop/Thradex/AppM-Site-Mapper
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 scripts/telemetry/commission-bdfb-lab-modbus.py
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --stage
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --deploy
```

The `--stage` command modifies one private Compose overlay file; the
other commands above are read-only. **STOP HERE** if the queues are not
zero, if a LAB publisher remains active, or if any deployed secret/mount
comparison fails.

After the queue is drained, the original source publishers are stopped
and the post-commission Mongo backup archive's SHA256 matches:

```bash
python3 scripts/telemetry/commission-bdfb-lab-modbus.py \
  --deploy --backup-dir "$HOME/site-mapper-backups/bdfb-lab-20261024"
```

No Unit ID 4/5 commissioning is claimed complete until actual
operator deploy output confirms both services. Then run the publisher
continuously in a separate terminal and read Unit IDs 4 and 5 with:

```bash
python3 scripts/telemetry/publish-bdfb-lab-pair.py --publish
python3 scripts/telemetry/verify-bdfb-lab-modbus-fc03.py
```

The new **FC03-only** checker reads panel-1..4 Circuit-1's four
FLOAT32 ABCD metrics in both new Units and compares them to
recent source-indexed RAW MQTT evidence from Mongo. It verifies
that Unit IDs 1/2/3 preserve their original serial assignments.
For full field acceptance, record the actual gateway FC03 packets,
stale/offline quality policy, all 96 circuits and Metasys reads
separately. The FC03 checker is a local laboratory integration
check, not field commissioning.

**At publication time no operator deployment of Unit IDs 4 and 5
has occurred.** This stage does not alter any historical industrial
telemetry, topology, bindings, original MQTT owners or Modbus registry.


### 2026-10-24: Unit 4/5 staged; deployment blocked by heterogeneous Compose labels

The operator ran the dry-run and explicit `--stage` command for the
additive Unit ID 4/5 mapping. The baseline source-to-unit map was
`EMU-BFDB-01:1, EMU-BFDB-02:2, EMU-BFDB-03:3`, and staging produced
a private original-overlay backup at
`.runtime/industrial-lab/existing-compose.json.before-lab-modbus-20261024T020028Z`.
Neither Modbus nor Site Mapper was recreated.

Both `--deploy` and `--deploy --backup-dir ...` stopped *before any
write or container recreation* with:
`COMMISSION BLOCKED: active Compose file set changed`.

Root cause in the source: the `inspect()` helper enforced the same
*three-file* Compose provenance for **every** container, despite
non-coincident service recreation history. The app had previously been
recreated with all three Compose files; the running bridge and base
database containers may correctly retain a shorter Compose file set.
Recreating the bridge and original data stores solely to align labels
would be an unnecessary risk.

The check now validates **per-service** provenance:
- exact original Compose project name, working directory and service
  identity label;
- one, two or three **ordered exact prefixes** of the approved
  `docker-compose.telemetry.yml`,
  `docker-compose.industrial.yml`, `existing-compose.json` list;
- Site Mapper specifically must have all three, as confirmed by
  earlier operator diagnostic;
- Modbus bridge may carry any approved exact historical prefix
  (base-only, base+industrial, or all three); its actual mount paths,
  effective environment and token configuration must still match the
  fully resolved three-file deployment before recreation;
- MongoDB and TimescaleDB can have any approved prefix, but retain
  their immutable original persistent volume names.

Every other deployment guard remains in place: matching app/bridge
tokens and precise source map, credential and environment comparison
against resolved Compose, exact mount topology, outbox and durable
capture-spool zero, no active LAB publisher, SHA256-verified
post-commission archive, and `--no-deps --no-build` reconstruction
of only app + bridge. The script now logs each service's approved
Compose *file count* without revealing secrets.

Operator follow-up **after pulling the fixed commit**:

```bash
python3 -m unittest discover -s tests/python -p test_lab_modbus_compose_provenance.py -v
python3 scripts/telemetry/commission-bdfb-lab-modbus.py
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --deploy
```

The first command is a standard-library provenance unit test; the
second and third do not modify the deployment. The staged original
overlay persists, so do **not** rerun `--stage`. If strict preflight
succeeds and publisher is stopped with all outboxes empty, the approved
operator can execute `--deploy --backup-dir ...` as documented above.

As of this incident report: the new Unit IDs remain **STAGED, NOT
DEPLOYED**; Timescale and MQTT captures remain undisturbed.


### 2026-10-24: Timescale historic Compose label guard corrected for unmodified DB

The operator confirmed all five Compose provenance tests passed
(`Ran 5 tests ... OK`), and the updated real preflight reached:

```text
COMPOSE PROVENANCE OK site-mapper | approved files=3
COMPOSE PROVENANCE OK modbus-tcp | approved files=3
COMPOSE PROVENANCE OK mongodb | approved files=1
COMMISSION BLOCKED: unapproved Compose provenance for
  appm-site-mapper-timescaledb-1 (file count=2)
```

No service or Mongo/Timescale state was modified because the error
occurred during preflight. This showed that TimescaleDB's historical
Compose file labels are not an ordered prefix of the current
app/Modbus deployment's three Compose files. The correct fix is **not**
to recreate TimescaleDB or blindly accept the differing file list for
the two services being changed.

`commission-bdfb-lab-modbus.py` now distinguishes targeted
`site-mapper`/`modbus-tcp` services from preserved MongoDB/TimescaleDB
dependencies:

* For **targets**, it requires exact current project, service label,
  working-directory and strictly approved ordered Compose-file provenance;
  the app must be an exact three-file deployment.
* For **untouched databases**, it still requires the correct live
  project, service label, working-directory and a non-empty historical
  Compose-file label, but does **not** require the database to have
  been created with the current app's Compose files. Its Mongo and
  Timescale persistent-volume identities are checked against exact
  original names before any restart.
* A new test extends the existing provenance unit test to ensure
  different historical database overlay lists are allowed only for
  untouched database containers; project and working-directory
  mismatches still fail closed; unapproved overlays remain forbidden
  on app and bridge targets.

After pulling, rerun these **read-only** commands:

```bash
python3 -m unittest discover -s tests/python -p \
  'test_lab_modbus_compose_provenance.py' -v
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --deploy
```

The earlier Unit ID 4/5 original-stack configuration was successfully
staged with its private backup and **does not require staging again**.
If the preflight still stops due to actual environment/mount drift,
do not force a restart; examine the new specific refusal. After a clean
queue, stopped LAB publisher and verified post-commissioning backup,
the scoped two-service deployment can be explicitly requested.
No Unit ID 4/5 deploy or FC03 acceptance was performed by this fix.


### 2026-10-24: Timescale queue race during two-service Modbus deployment — bridge-only alternative

The operator's next proof conclusively verified that the original
application/bridge/database Compose guards and mount checks passed, but
the writer kept creating Mongo Timescale outbox records during the
pre-deployment gap:

```text
--deploy (read-only)   pending=0 retrying=0 captureSpool=0   PRECHECK PASSED
--deploy --backup-dir  pending=3 retrying=0 captureSpool=0   COMMISSION BLOCKED
```

Those Mongo outbox batches represent durable industrial history;
they are not failed/rejected deliveries and **must not be deleted
or manually marked completed** to obtain a momentary empty queue.
They will be delivered and acknowledged by the existing historian.

The engineering resolution is a new explicit **bridge-only**
commissioning mode `--bridge-only`. The source publisher to
Modbus bridge path in
`src/modules/telemetry/infrastructure/telemetry-runtime.ts`
forwards accepted, point-bound breaker readings to the bridge's
`/internal/accepted-breaker` endpoint by source identity and raw
panel point. The Modbus bridge independently owns the serial-to-Unit-ID
mapping and converts it to local holding registers. Thus the gateway
can be updated first without restarting Site Mapper or blocking its
Mongo → Timescale history delivery.

`--bridge-only` performs the existing exact current project, app/
bridge token, source owner map, Compose config and mount comparisons,
along with preserving the Mongo/Timescale persistent volume identities.
It requires the already created post-commission Mongo backup SHA-256
for **actual deployment**. It recreates exactly the existing
`modbus-tcp` service with Compose `--no-deps --no-build`; Site Mapper
and its industrial capture/outbox worker remain online throughout.
An active Mongo Timescale delivery outbox is permitted **only in
this bridge-only mode**, precisely because no historian is stopped
or recreated.

**Operator sequence:**

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 -m unittest discover -s tests/python -p 'test_lab_modbus_bridge_only.py' -v
# No changes or service restarts:
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --bridge-only
# Only after successful preflight and verified prior post-commission backup:
python3 scripts/telemetry/commission-bdfb-lab-modbus.py --bridge-only \
  --backup-dir "$HOME/site-mapper-backups/bdfb-lab-20261024"
```

The original override was already **staged** in
`.runtime/industrial-lab/existing-compose.json` and backed up:
do not rerun `--stage`. No Mongo/Timescale queue draining, SQL
deletions, SNMP disablement or publisher manipulation is part of
bridge-only commissioning.

A gateway-only restart **will briefly interrupt existing Modbus
clients** and reset its volatile latest-state register cache.
Original Unit IDs 1/2/3 remain assigned to
`EMU-BFDB-01/02/03`, but recent values must be repopulated from
subsequent accepted source observations. Register values may
temporarily read zero or unavailable, depending on missing-data
policy. Time that maintenance appropriately; it is not a hot reload
of the Modbus server.

After the gateway bridge-only deploy, the active Site Mapper process
intentionally still has the **old** three-source Modbus mapping in
its environment. This is an explicitly supported *transitional*
state; the staged original Compose config has the complete five-source
mapping for both services. No original Unit is reassigned.
The bridge's source map is five-source. MQTT ingestion and its
historian are independent of the local Modbus source-to-Unit map and
continue working.

Verify the gateway's actual config through
`python3 scripts/telemetry/audit-bdfb-lab-downstream.py`, then publish
LAB MQTT packets continuously and verify FC03 on Units 4 and 5 via
`scripts/telemetry/verify-bdfb-lab-modbus-fc03.py`. The FC03 verifier
checks eight representative panel/circuit blocks, not all 192 circuits
and not an external Metasys installation.

Later, during an explicitly approved quiet interval with captured
backlogs drained, `--deploy --backup-dir ...` will detect the
transitional old-app/new-bridge mapping and **recreate only
site-mapper**, not the gateway again, thus bringing runtime app config
into agreement. Until then, do not claim the complete two-service
environment reload has occurred. Original database/publisher sources
remain unchanged and no data is re-seeded.


### 2026-10-24: FC03 three direct matches; 25-second static snapshot race corrected

After successful **bridge-only** activation of LAB Modbus Units 4/5
(with EMU 1/2/3 preserved and Site Mapper/Timescale retained), the
operator ran the read-only FC03 verifier while LAB MQTT published in
four rotating panels per source, 24 circuits per panel, at 5-second
panel-batch intervals. The first three direct register block checks
matched the source MQTT values to FLOAT32 precision:

```text
LAB-BDFB-02 Unit 4 P1/C1 regs 0..7
  MQTT=(12.43,2.62,32.57,0.10353), age=20.1s        MATCH
LAB-BDFB-02 Unit 4 P2/C1 regs 192..199
  MQTT=(12.41,2.95,36.65,0.12758), age=16.2s        MATCH
LAB-BDFB-02 Unit 4 P3/C1 regs 384..391
  MQTT=(12.43,2.85,35.45,0.15163), age=11.1s        MATCH
FC03 FAILED: LAB-BDFB-02 panel 4 sample stale: 25.2s
```

The failure is a **static Mongo-snapshot age guard** (25s)
interacting with a 4 × 5s cyclic publisher and sequential FC03 reads.
There was no reported FC03 numeric mismatch, exception or Modbus
write failure in those three accepted blocks. The old verifier read
Mongo once and rejected panel4 at 25.2 seconds.

The revised `verify-bdfb-lab-modbus-fc03.py` keeps the bridge
30-second missing/stale contract unchanged and:
- accepts individual persisted panel packets only while their age
  remains <=27 seconds, leaving a small safety margin before the
  gateway's actual 30-second stale register policy;
- separately requires recent industrial capture at the **source**
  level (latest persisted packet <=15 seconds old per source);
- compares U1/I1/P1/EP1 numerical values against actual FC03
  FLOAT32 high-word-first registers, never accepting stale zero as
  a valid measurement;
- polls fresh Mongo evidence for still-unverified panels only for
  a bounded 55-second deadline and retains already-matched panel
  proofs; noisy intermediate age/mismatch snapshots cannot fail
  an otherwise healthy cycling emitter;
- after all 8 blocks match, checks **both** source identities still
  have recent persisted MQTT activity before returning `FC03 PASS`;
- prints missing panel, stale source, Modbus exception, or numeric
  mismatch causes when the bounded check fails.

Regression tests in
`tests/python/test_lab_modbus_fc03_rotating_panels.py` cover the
actual 25.2-second boundary, new panel arrival, stale/stopped
publisher rejection, zero-register mismatch, and end-of-audit
source-freshness rejection.

No new container, publisher, DB or Modbus change is required:

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 -m unittest discover -s tests/python -p \
  'test_lab_modbus_fc03_rotating_panels.py' -v
# Keep existing LAB 02/03 publisher running in a separate terminal:
python3 scripts/telemetry/verify-bdfb-lab-modbus-fc03.py
```

Evidence at the time of this previous 25-second failure: 3 actual
matching P1..P3 Unit 4 blocks, before the later 8/8 acceptance below.
A representative 8-block local integration check is not a 192-breaker
exhaustive Modbus certification nor Metasys field acceptance.


### 2026-10-24: Operator FC03 PASS, LAB Unit IDs 4/5 (8/8)

The operator's **actual WSL / original-stack / local gateway** run
of `python3 scripts/telemetry/verify-bdfb-lab-modbus-fc03.py`
returned the following, with a continuously rotating 24-point
per-panel publisher in a separate terminal:

```text
LAB-BDFB-02 Unit 4 P1/C1 regs 0..7     age=11.1s  MATCH
LAB-BDFB-02 Unit 4 P2/C1 regs 192..199 age= 6.2s  MATCH
LAB-BDFB-02 Unit 4 P3/C1 regs 384..391 age= 1.1s  MATCH
LAB-BDFB-02 Unit 4 P4/C1 regs 576..583 age=14.7s  MATCH
LAB-BDFB-03 Unit 5 P1/C1 regs 0..7     age=10.9s  MATCH
LAB-BDFB-03 Unit 5 P2/C1 regs 192..199 age= 5.9s  MATCH
LAB-BDFB-03 Unit 5 P3/C1 regs 384..391 age= 1.0s  MATCH
LAB-BDFB-03 Unit 5 P4/C1 regs 576..583 age=14.5s  MATCH
FC03 PASS: 8/8 independent panel samples matched;
both sources remain LIVE; original Unit IDs preserved.
```

Each tested FC03 request read 8 holding registers (four
high-word-first FLOAT32 values, U1/I1/P1/EP1) from Circuit 1
of the designated panel. Address starts 0, 192, 384, 576,
corresponding to four 24-circuit panels per Unit ID.

**IMPORTANT: A MATCH is defined by the verifier's documented
numeric tolerances, not bytewise identity with an identical
source timestamp.** In this acceptance run, seven checks had
negligible differences except that **both P3/C1 blocks** differed
slightly in the concurrently rotating snapshots:

```text
LAB-BDFB-02 Unit 4 P3/C1:
  MQTT = (12.42, 2.97, 36.90, 0.15727)
  FC03 = (12.43, 2.92, 36.23, 0.15708)
  deltas ~ (0.01 V, 0.05 A, 0.67 W, 0.00019 kWh)
LAB-BDFB-03 Unit 5 P3/C1:
  MQTT = (12.65, 2.17, 27.46, 0.15503)
  FC03 = (12.66, 2.12, 26.78, 0.15489)
  deltas ~ (0.01 V, 0.05 A, 0.68 W, 0.00014 kWh)
```

All P3 deltas were within the verifier's fixed engineering
tolerances (voltage <=0.1 V; current <=0.4 A; power <=5 W;
energy <=0.001 kWh), likely reflecting different observation
instants while the emulator continues to publish. This does
**not** prove an identical packet was observed on both sides;
packet-level temporal correlation remains a separate evidence
goal if exact equivalence is required.

The repository's 6 focused rotation/regression unit tests also
returned `OK`, but **only the separate actual FC03 process run**
establishes the eight real lab observations above.

**Acceptance for this gate:** local gateway Unit ID 4/5
FC03 representative reading validated; both sources live at
completion; Units 1/2/3 serial assignments unchanged; gateway
commissioned using the bridge-only method, without recreating
Site Mapper, MongoDB or TimescaleDB.

**Not yet certified:** FC03 for every one of the 192 LAB
breakers and every metric, external Metasys interoperability,
on-wire stable-sample exact equality, UI inspector presentation
and BDFB-descendant equipment summaries. The Site Mapper
application still runs the original three-source
`MODBUS_SOURCE_UNITS_JSON`, whereas the deployed bridge
has five mappings; the original Compose overlay is staged
with the complete five-source map for both services. Only
reconcile that app-side environment during an approved quiet
window with empty durable queues and a verified fresh backup.

No additional global `docker compose up/down`,
`--bridge-only`, `--stage`, inventory migrations or volume
changes are required to retain this verified gateway behavior.


### 2026-10-24: visual SNMP acceptance gap (BDFB-01/02/03)

The operator confirmed that the original Site Mapper application is
running and displayed:

- `BDFB-03` panel composition: 24/24 MQTT LIVE circuit readings
  with individual voltage/current/power/energy; previous device-level
  Modbus Unit 4/5 8/8 FC03 acceptance remains valid.
- `BDFB-01` **SNMP Inputs**: independently inventoried shunts A and B,
  both `UNVERIFIED` with no fresh displayed current/voltage. The
  screenshot shows `SHUNTS REPORTING 0/2` and old SNMP timestamps
  from 2026-10-23; historical presence is not current acceptance.
- `BDFB-02` and `BDFB-03` **SNMP Inputs**: `PENDING`,
  `0/0 fresh feeds`, explicitly "No SNMP input feeders
  inventoried on this BDFB."
- `BDFB-02` and `BDFB-03` **SNMP Charts**: "No samples stored for the
  selected range." These charts query *SNMP shunt/feed* TimeScaleDB
  series, not the already persisted MQTT circuit historical signals.
- `BDFB-01` original three breaker inventory and existing rack
  topology are still present.

The missing input measurements are **not** a regression of
MQTT, Modbus or historical industrial batch delivery. The distinct
SNMP path requires physical external POWER INPUT AccessPort inventory,
hardware profile CONFIG_2 or CONFIG_4, explicitly commissioned OID+
controller source identity per feed/metric, valid independent-input
verification (or clearly labeled, deliberate synthetic-only
lab commissioning), and a reachable read-only SNMP collector. The
Site Mapper collector is opt-in, not started by MQTT/Modbus
commissioning. No actual Delta OID mapping or independent field
wiring has been verified from screenshots.

The upstream source identities for the synthetic SNMP emulator are
`EMU-DELTA-BFDB-01/02/03`, **not** `LAB-BDFB-02/03`; never infer
SNMP inputs from MQTT breaker source names or 96 outgoing circuits.

#### Zero-write local gap audit

A dedicated auditor was committed to
`scripts/telemetry/audit-bdfb-snmp-readiness.py`. It reads only the
original `appm-site-mapper` Mongo topology and telemetry bindings,
lists the available local `snmp-collector` containers and checks only
the presence of relevant app configuration (it never prints tokens):

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 -m py_compile scripts/telemetry/audit-bdfb-snmp-readiness.py
python3 scripts/telemetry/audit-bdfb-snmp-readiness.py
```

The auditor reports each active BDFB's hardware profile, PANEL and
CIRCUIT_BREAKER inventory counts, external POWER INPUT ports, shunt
physical verification flags, linked panels and active CURRENT/VOLTAGE
OID bindings, plus collector presence. It does **not** claim live
SNMP telemetry or field wiring certification. Do not add ports,
automatically remap A/B to A1/A2/B1/B2, replace active OIDs,
mark a shunt verified or start new services until the audit is read.

**IMPORTANT TOPOLOGY PRESERVATION:** The generic
`scripts/lab/bfdb-snmp-config4.sh up` path launches a *different*
two-repository Compose lab and has a broad list of up/build targets
including `site-mapper`, `modbus-tcp`, databases and publisher
services. Do **not** run it over the currently certified
`docker-compose.telemetry.yml + docker-compose.industrial.yml +
.runtime/industrial-lab/existing-compose.json` stack: this could
overwrite runtime configuration, cause unintended service recreation
or generate entirely new datasets. Treat
`bfdb-telemetry-gateway` as separate if a dedicated SNMP agent
is needed; integrate only through a subsequent approved strictly
additive Compose overlay without replacing the MQTT/Modbus topology.

Next engineering gate after the audit: agree on a synthetic lab
hardware profile per BDFB (Config2 = two independent shunts
A/B; Config4 = four A1/A2/B1/B2), create only confirmed missing
POWER INPUT ports with distinct identity and links to the four
existing panels, and commission simulation-only OIDs with
`SYNTHETIC_LAB_ONLY` labels. Start the matching isolated SNMP
agent + collector; verify `LAB_LIVE`, SNMP 24h trend evidence
and no regressions to MQTT/Modbus. Physical field SNMP
commissioning still requires verified MIB/OID, management network,
SNMPv3 credentials and independent wiring sign-off.


### 2026-10-24: SNMP read-only audit confirmed, additive Config2 BDFB-01 lab ready

The operator ran `scripts/telemetry/audit-bdfb-snmp-readiness.py` on
the actual WSL2 original-stack Compose project
(`appm-site-mapper`, database `site_mapper_crud_acceptance_02`).
The **observed** facts were:

```text
APP_ENV=development
SNMP_INGEST_TOKEN_configured=true
SNMP_LAB_ENABLED=UNSET
TELEMETRY_HISTORY_ENABLED=true
RUNNING SNMP COLLECTORS=none

BDFB-01:
  hardwareProfile ELTEK_BDCBB_CONFIG_2
  4 PANELS, 3 existing breakers
  INPUT-SHUNT-A/B: 2/2 external POWER INPUT ports
  physical verification=False on both
  each port serves 2 panels
  4/4 SNMP bindings source EMU-DELTA-BFDB-01
  CURRENT and VOLTAGE OIDs on both inputs
  commissioning SYNTHETIC_LAB_ONLY

BDFB-02:
  4 PANELS, 96 breakers
  hardwareProfile NOT SELECTED
  0 SNMP POWER INPUT ports / 0 SNMP bindings

BDFB-03:
  4 PANELS, 96 breakers
  hardwareProfile NOT SELECTED
  0 SNMP POWER INPUT ports / 0 SNMP bindings
```

**Operational implication:** The 192 LAB MQTT breakers and newly
commissioned Modbus Units 4/5 do not provide SNMP incoming shunt
readings, and existing BDFB-01 synthetic OID inventory does not mean
an SNMP agent or collector is running. Site Mapper's
`SNMP_LAB_ENABLED` switch enables only explicit synthetic mapping
assistant endpoints; the normalized ingest endpoint already has a
separate token configured, without requiring that opt-in assistant
flag. No SNMP hardware/controller/physical wiring is certified.

#### Additive first gate — BDFB-01 only

The exact **Config2 A/B** profile has both inventory and approved
synthetic bindings present on BDFB-01. It is the only current device
eligible for a no-topology-change SNMP laboratory activation. We
created an intentionally narrow, opt-in extra Compose file at
`infra/lab/bfdb-snmp/original-stack-config2-bdfb01.yml`,
containing exactly two new services:

1. `snmp-lab-agent-01`: SNMPv3 authPriv, private container network
   UDP/1161 only, synthetic Config2 A/B telemetry and the existing
   controller identity `EMU-DELTA-BFDB-01` from the separately
   checked-out `thradexIT/bfdb-telemetry-gateway` emulator.
2. `snmp-lab-collector-01`: polls only four Config2 `2026.48.*`
   OIDs, 30s interval, and POSTs normalized observations to the
   **unchanged** private original Site Mapper `/api/telemetry/snmp/ingest`
   with the running app's existing SNMP bearer token.

An explicit preflight/launch helper at
`scripts/telemetry/commission-bdfb01-snmp-lab.py` validates:

- active original Mongo, Site Mapper and five-unit Modbus gateway;
- exact original BDFB-01 three breaker / four panel / two input layout,
  A/B synthetic-only source ownership, and four distinct CURRENT/
  VOLTAGE OIDs; no verified physical feeder claims;
- approved external emulator Git checkout, SNMPv3 authPriv credentials
  (secrets neither logged nor placed into Git) and an original
  Site Mapper `SNMP_INGEST_TOKEN` already present;
- Compose project identity, app token consistency, profile/source/URL
  ownership, **zero exposed host ports**, default private Docker
  network only, no service overrides in the additive overlay;
- Docker container names are unused to prevent unnoticed replacement
  of an earlier lab.

**Default is read-only; no action was performed on the operator's
running Docker by committing this code.** The opt-in `--apply`
requires `--ack-synthetic-only` and invokes Compose
`up -d --no-deps --build` **only** for the two named new services.
It does not recreate the old app, bridge, Mongo, TimescaleDB,
existing MQTT publisher or existing BFDB inventory.

Operator commands (only after separately confirming the external
BFDB emulator checkout and private `.env.snmp` credentials exist):

```bash
git pull --ff-only origin feat/site-mapper-work-2026-10-23
python3 -m unittest discover -s tests/python -p 'test_bdfb01_snmp_additive.py' -v
python3 scripts/telemetry/commission-bdfb01-snmp-lab.py
# Optional synthetic-only start AFTER the above preflight is clean:
python3 scripts/telemetry/commission-bdfb01-snmp-lab.py \
  --apply --ack-synthetic-only
# If BFDB checkout is at a different path:
#   --bfdb-repo /absolute/approved/bfdb-telemetry-gateway
```

If the BFDB checkout or the ignored `.env.snmp` is absent, the
preflight must fail closed; **do not run the broad**
`scripts/lab/bfdb-snmp-config4.sh up` command in this original
industrial stack. Do not enable SNMPv2c to work around missing
SNMPv3 credentials.

Once the additive services are genuinely running, verify only
BDFB-01's independent SNMP feed A/B statuses `LAB_LIVE` and SNMP
TimescaleDB 24h history separately from MQTT breaker history.
The two sources are different synthetic measurements and cannot
be used to mathematically certify physical current conservation.

**BDFB-02 and BDFB-03 are not silently modified.** Their
independent shunt hardware configuration is unknown: Config2
(A/B) and Config4 (A1/A2/B1/B2) cannot be inferred from
four output panels or from MQTT/Modbus success. The next scoped
operation for each of those two requires explicit simulated lab
profile choice (clearly synthetic), creation of matching distinct
external POWER INPUT AccessPorts with non-verified physical flags,
and OID mappings to the matching SNMP emulator profile; never copy
BDFB-01's existing source identity or mark such a synthetic
port as field-verified.


### 2026-10-24: Operator started additive BDFB-01 SNMPv3 synthetic agent and collector

The operator's live original-stack WSL commands confirmed:

```text
python3 -m unittest discover -s tests/python -p 'test_bdfb01_snmp_additive.py' -v
Ran 7 tests ... OK
ORIGINAL BDFB-01 OK: 4 panels, 3 breakers, Config2 A/B,
  4 lab-only SNMP OIDs; physical shunts NOT certified
EMULATOR: .../bfdb-telemetry-gateway |
  SNMPv3 authPriv Config2 | source EMU-DELTA-BFDB-01
SNMP BDFB-01 PREFLIGHT PASS:
  two new isolated lab services only
python3 scripts/telemetry/commission-bdfb01-snmp-lab.py \
  --apply --ack-synthetic-only
START: snmp-lab-agent-01 + snmp-lab-collector-01 (no dependencies)
SNMP LAB BDFB-01 STARTED:
  collector polls synthetic A/B only.
```

This output confirms **two synthetic SNMP services were launched**
and the strict source/inventory/original Modbus mapping preflight
succeeded. The command does **not** prove that a UDP SNMP GET
returned valid values, that the collector POST received HTTP 202,
that all four normalized SNMP points were accepted into the
original Site Mapper TimescaleDB, or that the browser shows
`LAB_LIVE` A/B inputs and actual SNMP chart samples.

Next acceptance actions, with no Compose or database mutation:

```bash
docker logs --tail 50 appm-site-mapper-snmp-lab-agent-01-1
docker logs --tail 80 appm-site-mapper-snmp-lab-collector-01-1
```

Expected collector records, **not yet observed in supplied evidence**:
`snmp.collector.started`, then `snmp.poll.accepted` for
`EMU-DELTA-BFDB-01` with `pointCount=4`. Any
`snmp.poll.failed` or non-202 response should be diagnosed
before changing the original application.

Next, navigate to BDFB-01 → Inputs and BDFB-01 → Charts;
verify that only Config2 feed A/B are labeled synthetic
`LAB_LIVE`, have fresh current/voltage and persist a
distinct SNMP Timescale history. BDFB-02/03 still have zero
SNMP input ports, zero SNMP OID bindings and no authorized
physical shunt profile; their SNMP status remains pending.
MQTT 192 LAB breakers and Modbus Unit IDs 1–5 are not
affected and are independently evidenced.

Important: `SNMP_LAB_ENABLED=UNSET` in the app disables its
interactive synthetic-commissioning helper, but does **not**
disable the already configured normalized SNMP ingest endpoint.
BDFB-01 bindings were present before service start. Do not
recreate the app to change this flag just to test incoming
synthetic SNMP metrics. Do not claim field SNMP certification
from laboratory readings.


### 2026-10-24: Real SNMPv3 collector HTTP acceptance confirmed for Config2 BDFB-01

The operator validated the exact generated Compose instance names
`appm-site-mapper-snmp-lab-agent-01-1` and
`appm-site-mapper-snmp-lab-collector-01-1`, each **Up** in the
original `appm-site-mapper` project.

Real agent log:

```text
snmp.emulator.ready
kind=LAB_SYNTHETIC_NOT_DELTA
bfdbId=BFDB-01
sourceIdentity=EMU-DELTA-BFDB-01
udpPort=1161
scenario=NORMAL
hardwareProfile=ELTEK_BDCBB_CONFIG_2
snmpVersion=3
points:
  CURRENT A 1.3.6.1.4.1.8072.9999.2026.48.1.1.0
  VOLTAGE A 1.3.6.1.4.1.8072.9999.2026.48.2.1.0
  CURRENT B 1.3.6.1.4.1.8072.9999.2026.48.1.2.0
  VOLTAGE B 1.3.6.1.4.1.8072.9999.2026.48.2.2.0
```

Collector log confirmed `snmp.collector.started` with
SNMPv3, `pointCount=4`, `pollIntervalMs=30000`, and
**nine consecutive** `snmp.poll.accepted` records for the
unchanged source `EMU-DELTA-BFDB-01`, at these UTC times
on 2026-10-24:

```text
15:49:43.362  accepted
15:50:12.205  accepted
15:50:40.781  accepted
15:51:09.563  accepted
15:51:38.117  accepted
15:52:06.698  accepted
15:52:35.149  accepted
15:53:03.879  accepted
15:53:32.477  accepted
```

No `snmp.poll.failed` records were shown. From the actual
`infra/snmp-collector/server.mjs`, `snmp.poll.accepted`
is logged only after a completed SNMP GET, normalization,
and a successful 2xx POST response from the Site Mapper
ingest endpoint. The code in
`src/app/api/telemetry/snmp/ingest/route.ts` returns HTTP
202 only after the feed service accepts the input, whose
configured historical path calls `commitSnmpBatch`.
This is therefore real collector-to-Site Mapper protocol
ingress evidence, **not merely a simulated unit test**.

**Still requires separate explicit acceptance:** BDFB-01
Inputs must show A/B as `LAB_LIVE` with nonempty current and
voltage; BDFB-01 Charts / 24H must show actual stored
TimeScaleDB SNMP series. The browser queries
`GET /api/telemetry/snmp/feeds?deviceId=<deviceId>` for
live status and
`GET /api/telemetry/snmp/feeds/trends?deviceId=<deviceId>&window=24h`
for historical buckets. The latter explicitly tags both
feed source modes as `SYNTHETIC_LAB_ONLY`. These endpoints
require an authenticated `telemetry:read` session and
should be checked in the running UI rather than declaring
success based solely on the collector log.

The field-physical status remains **not verified**. There
are no active SNMP input profiles or OIDs for BDFB-02/03,
and no need to restart/redeploy Site Mapper, Modbus or
the databases for this verification.
