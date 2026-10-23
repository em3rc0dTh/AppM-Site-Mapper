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
