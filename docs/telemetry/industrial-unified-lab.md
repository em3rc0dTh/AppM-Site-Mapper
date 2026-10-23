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
