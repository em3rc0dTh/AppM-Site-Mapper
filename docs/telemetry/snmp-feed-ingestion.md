# SNMP input-feed telemetry — Site Mapper MK1

**Status:** Site Mapper operational readiness implementation; field commissioning still pending  
**Scope:** BDFB/QDF DC input feeds, NOT breaker readings.  
**Decision:** Accept normalized SNMP observations independently of the agent implementation.

## Contractual assumption H-01

Assume each BDFB/QDF input feeder is instrumented and its current is readable from a
Delta/Eltek SNMP controller. This is a **design assumption** for delivery sequencing,
**not a field-certified fact**. The actual agent firmware, MIB, OID indexes, shunt
configuration and feed-to-panel wiring must be verified with operations.

Sources: Eltek BDCBB/BDFB Installation Guide 2105531 issue 3 (2019), pages 10,
18–25, 33–36, 54–57, 65–68; Eltek Controller Configuration Guide 370013.063
issue 1 (2013), pages 45–55; the supplied eNexus MIB and the Eltek common MIB.
The source manuals describe shunt measurements and SNMP capability but **do not
prove** each target installation exposes every expected OID.

## What is implemented now

- A normalized observation receiver `POST /api/telemetry/snmp/ingest`, protected by
  a **separate collector token**; this is **not** an SNMP/UDP listener.
- Explicit OID + agent identity + metric -> **external BDFB POWER INPUT AccessPort**
  commissioning in `POST /api/telemetry/snmp/commission`.
- Input feed aggregation in `GET /api/telemetry/snmp/feeds?deviceId=<bdfb-id>`.
- Optional feed history through `GET /api/telemetry/snmp/feeds/history?feedAccessPortId=<port-id>&window=24h`;
  accepted observations are stored as canonical ACCESS_PORT entity samples in
  the existing Site Mapper TimescaleDB store.
- BDFB inspector displays a **separate** SNMP DC INPUT FEEDS block. Existing
  MQTT breaker telemetry and existing POWER OUTPUT PowerPaths are unchanged.
- An **opt-in** SNMPv3 authPriv poller runs as a separate Node container in
  `infra/snmp-collector`, enabled with Compose profile `snmp`. It performs
  read-only GET requests to the configured real or simulated agent and POSTs
  the same normalized payload. It does **not** run by default.
- No SNMP credentials, real agent or BFDB emulator are deployed by this change.
  Field verification and agent emulation are subsequent stages.

The SNMP collector owns UDP/161, SNMPv3 authentication/privacy credentials,
OID polling, vendor MIB parsing, raw value scaling and any trap listening on UDP/162.
Site Mapper receives only scaled measurement values. SNMPv3 `authPriv` and
read-only permissions are preferred, with access restricted to the management
network.

## Commissioning the BDFB

1. Create the BDFB Device and its canonical CHASSIS/PANEL/BREAKER Equipment.
2. Create **one distinct, external, POWER INPUT AccessPort per incoming feeder**
   on the appropriate BDFB Equipment. Label e.g. `Feed A1`, `Feed B1`.
   These ports are electrical terminal identities, not child Equipment. Use
   `attributes.feed` = `A` or `B` where relevant; optionally
   `attributes.ratedCurrentA` = rated current for the actual feeder.
3. Obtain the physical feed schedule, Delta/Eltek controller identity,
   supported MIB/firmware and verified SNMP OID/index per feeder.
4. While signed in with `topology:write`, explicitly bind each OID and
   measurement to its verified feed AccessPort:

```http
POST /api/telemetry/snmp/commission
Content-Type: application/json

{
  "deviceId": "<existing-bdfb-device-id>",
  "feedAccessPortId": "<existing-external-power-input-port-id>",
  "sourceIdentity": "ELTEK-CONTROLLER-01",
  "oid": "1.3.6.1.4.1.12148.10.10.18.4.1.6.1.1",
  "metric": "CURRENT",
  "confirmPhysicalMapping": true
}
```

The OID above is **an illustrative eNexus candidate**. It is not a certified
OID for this installation. Repeat for `VOLTAGE` only when a voltage OID is
known and measured in V. The service refuses missing/conflicting bindings.

5. Set `SNMP_INGEST_TOKEN` on Site Mapper and the collector as a **separate
   high-entropy secret at least 32 characters**. Never commit it. In production,
   expose the HTTP receiver only over a private network/TLS reverse proxy.
   Restrict source IPs, apply request rate controls at ingress and prohibit
   untrusted user access. No browser cookie can authorize collector ingestion.
6. The collector (real or emulated) posts this normalized payload:

```http
POST /api/telemetry/snmp/ingest
Authorization: Bearer <SNMP_INGEST_TOKEN>
Content-Type: application/json

{
  "schemaVersion": 1,
  "sourceIdentity": "ELTEK-CONTROLLER-01",
  "observedAt": "2026-10-21T13:00:00.000Z",
  "measurements": [
    { "oid": "1.3.6.1.4.1.12148.10.10.18.4.1.6.1.1", "metric": "CURRENT", "value": 220, "unit": "A" },
    { "oid": "1.3.6.1.4.1.12148.10.10.18.4.1.6.2.1", "metric": "CURRENT", "value": 210, "unit": "A" }
  ]
}
```

Measurements must be engineering units after any vendor-specific scalar
conversion. A shunt specified as 1000 A / 60 mV is measurement metadata,
**not** an instruction to scale an already-converted SNMP amperage again.

## Aggregation and semantics

- The domain's `Equipment` hierarchy remains physical. `AccessPort` models
  independent incoming feed terminals. Existing `PowerPath` covers explicit
  circuit-to-load connections. The SNMP feed model must NOT attribute an input
  reading to a panel/breaker without additional dedicated measurement evidence.
- The feed summary considers **all active external BDFB POWER INPUT ports** to
  determine expected coverage. It only totals one verified CURRENT binding per
  port; missing/unmapped/stale/conflicting ports invalidate the whole-BDFB total.
- Individual readings carry `sourceIdentity`, exact OID, UTC observation time,
  units, a canonical AccessPort target and their binding IDs. The live status is
  valid for 90 seconds (initial contract); older readings are STALE, never zero.
- `measuredCurrentA` is a **partial** sum of fresh readings; `totalCurrentA`
  is returned **only** when the expected feed set is complete. No feed current
  is inferred from installed panel count or downstream connected equipment.
- The current total assumes **distinct, non-overlapping feeder shunts**; confirm
  this property in the approved wiring diagrams before operational certification.
  If a parent/bus reading and a child feed both measure the same current, they
  must not both be commissioned as independent inputs.
- Power (W) is not a direct SNMP field in this contract. Compute from
  `abs(V) * I` only if each independent feeder has aligned validated voltage
  and current samples. Do not sum nominal breaker ratings as actual load.
- The two sides A/B do not prove two independent upstream power plants.

## Deployment behavior and limitations

- `TELEMETRY_HISTORY_ENABLED=true` and `SNMP_INGEST_TOKEN` enable the existing
  history writer even when `TELEMETRY_ENABLED=false` (MQTT disabled).
- Live state shares the existing process-local `TelemetryHub`; a single
  Site Mapper runtime is required for a coherent LIVE view until a shared
  multi-instance state store is implemented.
- The history writer currently logs storage failures without failing ingest.
  A `202` confirms receipt/validation, **not durable historical commit**.
  Check the history-store health and diagnostics separately before certification.
- Agent credentials and OIDs can change without changing the normalized payload
  schema, only the collector's configuration / authorized commission mapping.

## Site Mapper readiness acceptance (emulator lives in separate BFDB repository)

- Create at least two external feed AccessPorts on a representative BDFB.
- Commission separate CURRENT OIDs and send a synthetic **normalized** payload
  (not a simulated SNMP agent yet) to the Site Mapper endpoint.
- Validate two different feed loads, complete total, partial/UNMAPPED behavior,
  conflict rejection, token rejection, stale timestamps and history query.
- Confirm MQTT point/breaker presentation still works and does not count an SNMP
  feeder as a breaker.
- The BFDB repository now provides a separate, optional synthetic SNMPv3 UDP agent lab.
  Use it only **after** the Site Mapper normalized intake, inventory, commissioning,
  history recovery and live UI have been verified. Do not treat lab OIDs as Delta OIDs.
- Final commissioning remains dependent on actual Delta SNMPv3 credentials,
  management IPs, MIB version, OID table walk, feed wiring and controller-local
  readings. Never declare the real integration certified from emulator results.

## Opt-in native SNMPv3 collector (already implemented, not commissioned)

The container is built from `infra/snmp-collector` and uses `net-snmp` v3.
It must reach the controller management network on UDP/161. It issues only
read-only SNMP GET; no SET, no automatic OID tree walk and no trap listener
are enabled in the first version. Polling is scheduled after each finished cycle,
so overlapping polls do not accumulate. An error in any OID prevents publishing
a partial batch. No passphrases are logged.

1. Configure a private .env with the `SNMP_...` settings in
   [environment reference](../operations/environment-reference.md).
2. Commission each verified OID to an external input feed AccessPort.
3. Start only when agent credentials/network are available:

```bash
docker compose --env-file .env -f docker-compose.telemetry.yml \
  --profile snmp up -d --build snmp-collector
```

4. Check collector logs and the authenticated `/api/telemetry/snmp/feeds`
   and history endpoints. Do not claim hardware integration from a successful
   emulated collector. A successful GET and HTTP 202 still do not independently
   prove electrical feeder-to-OID identity without site wiring verification.

The collector initially supports SHA1/AES SNMPv3 credentials, as documented
in the legacy Smartpack configuration guide. Firmware, permitted cryptographic
profiles and reachability of the real controller must be verified. Its
`SNMP_FEED_POINTS_JSON` values include engineering scale. Use `scale=1`
if the response is already in amperes or volts; never apply shunt scaling twice.

The HTTP receiver remains independent of the transport and works with
future collectors implemented in another language or service. The physical
agent emulator is still a separate task in the BFDB repository.

## Operator integration — release SNMP-READY

### BDFB incoming feeder inventory

On the canonical BDFB CHASSIS (or actual feeder owner Equipment), use the existing
AccessPorts editor to create POWER / INPUT / EXTERNAL terminals with:

- `snmpFeedInput=true` (only these ports count as SNMP inputs);
- an optional `feed=A|B` **side label** (not a unique source identity);
- rated current (A), shunt full-scale current (A), shunt full-scale voltage (mV);
- exact served PANEL Equipment IDs when verified, never inferred by panel order;
- `independentInputConfirmed=true` only after verifying shunt wiring and ensuring
  current measurements cannot overlap other incoming feeds.

Two or four independent incoming feeds can be configured without adding false
SHELF/FRAME objects or turning the shunt into fictitious inventory equipment.
The load summary excludes unverified inputs and never distributes total feed
current to panels or individual breakers.

### Operational commissioning

Open a BDFB inspector → **SNMP FEED COMMISSIONING → CONFIGURE**.
The UI calls `GET /api/telemetry/snmp/commission?deviceId=...` and allows a
privileged topology+power operator to bind a source identity and one or two
explicit verified OIDs to each physical feed. A previous binding must first be
retired explicitly via `DELETE /api/telemetry/snmp/commission`; retirement
preserves audit history and does not destroy TimescaleDB samples.

Credentials NEVER appear in this API or UI. Configure SNMPv3 username, keys,
agent management address and OID engineering scale on the external collector.
The target AccessPort and OID-to-feed identity stay in the persistent
TelemetryBinding repository, not in per-page browser state.

### Docker/Collector deployment

An opt-in `snmp-collector` Compose service exists in
`docker-compose.telemetry.yml`, profile `snmp`. It is stopped by default.
One instance queries one configured controller and submits normalized HTTP
observations over the private Site Mapper service network. Run additional
instances with separate environment/Compose overrides for further controllers;
do not assume two BDFBs require two controller IPs. Where the BFDB simulator
is deployed in a different Compose project, attach the two services to the
same dedicated private lab network and use its Docker service DNS address.
A host's loopback-only published UDP port is not reachable from arbitrary
containers as `127.0.0.1`.

Start only when configured (lab example):

```bash
docker compose --env-file .env -f docker-compose.telemetry.yml --profile snmp \
  up -d --build snmp-collector
```

For production ingress, use TLS/private networking, rate limits, and separate
per-controller secrets. The current Collector is SHA/AES authPriv (legacy
firmware compatibility); verify supported algorithms with Delta before field
deployment.

### Correctness and recovery

The ingest path returns failure if configured TimescaleDB history storage is
unavailable; it does not publish a new LIVE reading before acknowledged writes.
`GET /api/telemetry/snmp/feeds` may recover latest SNMP entity samples from
TimescaleDB following a Next.js process restart. Restored old observations
retain their original timestamps and are STALE, never silently refreshed.
The panel separately signals historical-store unavailability.

Whole-BDFB current is reported only when all inventoried independent incoming
feed currents are live. A feed without verified shunt independence is UNVERIFIED;
a feed with no binding is UNMAPPED. Per-feed utilization requires its rated
amperage. Approximate feed input power is `abs(voltage) * current`, only
when source/OID bindings and timestamp alignment are valid. Neither is a
breaker reading. The previous descendant Equipment average remains separate.

### Remaining certification gates

- Commission two independently metered inputs and supply distinct current OIDs.
- Validate 220 A + 210 A = 430 A, rated capacity, partial current, missing
  measurements and outdated data; validate that unverified/shunt-duplicate
  readings never appear in the certified whole-BDFB total.
- Stop the history store and confirm POST rejects the write and leaves the
  UI without an invented successful LIVE reading.
- Restart Site Mapper and confirm the latest sample is recovered as LIVE if
  still within the freshness window, otherwise STALE.
- Test a real SNMPv3 GET against the BFDB _lab_ agent, Collector normalization,
  Site Mapper historical commit and separate BDFB UI; leave original MQTT
  breaker averages and Modbus certification unchanged.
- Compare lab proof with physical Delta OID walk and wiring only when IP,
  credentials, firmware and engineering scales are made available.

No laboratory test certifies field Delta SNMP capabilities (hypothesis H-01).
