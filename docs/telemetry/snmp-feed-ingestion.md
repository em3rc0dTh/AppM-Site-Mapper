# SNMP input-feed telemetry — Site Mapper MK1

**Status:** Site Mapper ingestion foundation (collector/emulator commissioning pending)  
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
- No SNMP credentials, real agent, BFDB emulator or SNMP poller is deployed by
  this change. **The next stage** is an independent SNMP Collector that queries
  a real Delta controller OR an SNMP-speaking BFDB simulator and posts the
  **same exact payload** to this endpoint.

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

## Acceptance gate before the BFDB SNMP emulator

- Create at least two external feed AccessPorts on a representative BDFB.
- Commission separate CURRENT OIDs and send a synthetic **normalized** payload
  (not a simulated SNMP agent yet) to the Site Mapper endpoint.
- Validate two different feed loads, complete total, partial/UNMAPPED behavior,
  conflict rejection, token rejection, stale timestamps and history query.
- Confirm MQTT point/breaker presentation still works and does not count an SNMP
  feeder as a breaker.
- Only then build the SNMP agent emulator in the BFDB repository. It must expose
  SNMP OIDs over UDP and be queried by a real collector; simply emitting MQTT
  is insufficient to certify the SNMP wire protocol.
- Final commissioning remains dependent on actual Delta SNMPv3 credentials,
  management IPs, MIB version, OID table walk, feed wiring and controller-local
  readings. Never declare the real integration certified from emulator results.
