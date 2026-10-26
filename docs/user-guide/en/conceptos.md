# 0 · Essential concepts and permissions

## What is Site Mapper?

Site Mapper is an inventory with **physical location context**. Each object has a type, identity and parent; the hierarchy lets you find a component from its physical location.

~~~mermaid
flowchart TD
  N["Network"] --> S["Site"]
  S --> B["Structure"]
  B --> L["Level"]
  L --> R["Room / Substructure"]
  R --> Y["Bay / Cluster"]
  Y --> P["Position"]
  P --> K["Rack / Container"]
  K --> D["Device"]
  D --> E["Equipment"]
  E --> PA["PANEL"]
  PA --> CB["CIRCUIT_BREAKER"]
~~~

The diagram is illustrative, not a universal requirement that every installation contains each intermediate item.

## Operator glossary

| Term | Meaning |
| --- | --- |
| Network | Overall context grouping facilities |
| Site | Physical facility |
| Structure | Building or structure in a Site |
| Level | Building floor/level |
| Room / Substructure | Spatial room within the structure |
| Bay / Cluster | Grouping inside a Room |
| Position | Physical place for a Rack |
| Rack / Container | Structure housing Devices |
| Device | Inventory unit placed in a Rack, such as BDFB-01 |
| Equipment | Identifiable component within a Device or another Equipment |
| PANEL | Equipment with internal slots, e.g. 24 positions |
| CIRCUIT_BREAKER | Installed breaker modeled as Equipment |
| DYNAMIC | Children are not numbered |
| POSITIONAL | Children occupy numbered slots |
| Access Port | Physical terminal owned by a specific Equipment |
| PowerPath | Recorded connection between two Access Ports |
| MQTT Source | Identity of a publisher, e.g. EMU-BFDB-01 |
| Raw point | Publisher measurement identifier, e.g. 0_1_1 |
| TelemetryBinding | Verified source/point/metric-to-Equipment assignment |
| LIVE | A recent accepted observation |
| History | Persisted samples selected by interval |

Room / Substructure and Rack / Container are alternatives at the same conceptual layer, not extra nested layers.

## Different truths, different checks

**Identity** identifies the asset; **location** tells you where it is; **PowerPath** records which terminals are logically connected; **telemetry** describes which mapped readings were accepted.

An object can exist without being mounted, connected or measured. A recorded PowerPath does not certify physical voltage. MQTT **4/4** refers to four configured metrics, not proof that fresh data exists. **LIVE** is a recent accepted measurement, not proof of field sensor calibration.

## Permissions

**STANDARD** reads permitted information. **ADMIN** edits operational topology/power with validation. **SUPERADMIN** can additionally manage accounts. A missing button is often the correct role restriction.

## Five common mistakes

1. Placing Device directly below Room instead of an appropriate Rack.
2. Confusing Rack CAS U allocations with Panel breaker slots.
3. Creating a second PowerPath on a terminal already CONNECTED.
4. Assuming an MQTT point from a similar name is the correct physical breaker.
5. Equating LIVE, historical curves or Modbus data with certified field wiring.

**Pass:** locate any Equipment through its Room and Rack and explain what the system has recorded versus what it has actually observed.

[Next: infrastructure](entidades.md).
