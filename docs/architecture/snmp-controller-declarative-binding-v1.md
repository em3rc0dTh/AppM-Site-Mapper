# Site Mapper — Declarative SNMP controller presentation and feed commissioning (v1)

## Scope and physical truth

- A BDFB Device owns its power INPUT AccessPorts through its Equipment. Device and Equipment remain peer inventory kinds; the Equipment access port is the measurement target.
- Manufacturer Config 2 expects two independent feeds (A and B) covering four panels. The physical feed labels are data on ports, not inferred from Data Log headers.
- SmartPack2 Data Log A3/B3 are display aliases: their appearance does not change a customer's installed Config 2 wiring.
- The observed 273 RAW load current and 138/132 A log snapshot must not be treated as live commissioned independent feed measurements.

## Existing contracts reused

1. Hardware profile is persisted in DEVICE.attributes.bdfbHardwareProfile, selected through the existing API.
2. A physical input is an active POWER/INPUT/EXTERNAL AccessPort with snmpFeedInput, feed, independentInputConfirmed, and servedPanelIds.
3. Commissioned OID is a persistent SNMP TelemetryBinding targeting that AccessPort, explicitly confirmed through /api/telemetry/snmp/commission.
4. SNMP ingest accepts engineering units A/V, never unverified RAW values.
5. QDF sums, utilization, voltage coherence and power remain fail-closed until all expected independent feeds have real, verified, coherent samples.

## New read-only controller profile

Stored on DEVICE.attributes.snmpControllerProfile, validated against this example schema (illustrative, NOT a deployment default):

```json
{
  "schemaVersion": 1,
  "title": "Controller display name",
  "sourceIdentity": "controller-source-id",
  "signals": [
    { "oid": "1.3.6.1.4.1.12345.1.2.3.0", "label": "Operator-defined signal", "displayMode": "RAW" }
  ]
}
```

- No fixed QDF UUID, source identity, ELTEK OID, A3/B3 alias or feed mapping is compiled into the controller widget.
- RAW is displayed without units or scaling; ENUM optionally uses an existing enum label, otherwise raw.
- Each signal has its own recency and quality. Poll 60 seconds, stale after 130 seconds.
- GET requires telemetry permission. POST requires topology and power write permissions, same-origin request, strict validation, optimistic update and bounded profile history.
- The display profile never creates commissioned A/B bindings, changes collector behavior, or changes the electrical totals.
- No network credentials are stored in this profile.

## Operator workflow

1. BDFB -> Maintenance/Settings -> SNMP controller declarative presentation.
2. Enter display title and stable source identity.
3. Discover already observed SNMP signals from the authenticated industrial catalog; add selected OIDs, or a manually identified OID.
4. Select RAW or ENUM presentation, label each signal, and save with confirmation.
5. Open Operation -> Summary. The generic card renders only for BDFBs with a saved profile.
6. For Inputs A/B, separately verify physical source points, engineering scale, wiring and independence, then use the canonical chassis AccessPort SNMP commissioning path.

## Safe rollout and migration

The previous runtime widget contained a hardcoded QDF-5 UUID and SmartPack2 source/OIDs. The dependency has been removed; there is intentionally NO automatic migration.
After deploying this version, the old SmartPack2 raw card will be absent until an authorized operator saves its profile. Prepare that configuration from approved field records before promoting the release. Do not prepopulate made-up A/B values or reclassify global current as an individual feed.
No container, database, broker or field device changes are performed by this PR.

## Acceptance

- Controller card uses independent responsive instrumentation tiles (no fixed four-column layout or empty fourth tile); quality, freshness and raw values remain visible but visually distinct.

- BDFB without profile shows no controller card; configured BDFB shows only its own source.
- Invalid/duplicate OIDs and malformed profile mutations are rejected.
- Stale, absent or invalid signals do not appear live.
- RAW display does not alter feed A/B, sum, capacity, power or alarms.
- Config 2 remains two independent feeds despite A3/B3 display aliases.

## Unresolved field item

The real ELTEK agent returned CurrentMonitor=0, FlexiMonitor=0 and unavailable monitor tables. Data Log contains two currents, but individual SNMP OIDs have not yet been demonstrated. A/B are not commissioned.

## Release gate

No merge or field deploy until the controller profile migration is prepared.
