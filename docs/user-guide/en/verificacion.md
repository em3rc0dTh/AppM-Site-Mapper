# 6 · Verify status and troubleshoot safely

**Goal:** distinguish an inventory record, placement, electrical path, MQTT commissioning and actual measurements.

## Five independent kinds of evidence

| Evidence | Where to inspect | Proves | Does not prove |
| --- | --- | --- | --- |
| Inventory | Topology tree, Rack, Equipment | Object exists with identity | Physical mounting or wiring |
| Placement | Blueprint, Rack Elevation, CAS | Registered location/allocation | That a circuit has voltage |
| PowerPath | CONNECTED, VIEW POWERPATH, Full Power Trace | Ports are linked in the system | Energization, redundant live feeds |
| MQTT 4/4 | PANEL → MQTT POINT COMMISSIONING | Four metrics mapped to a breaker | Fresh publisher data |
| LIVE and history | Equipment → LIVE TELEMETRY / HISTORY | Recent and/or persisted accepted observations | Calibrated field sensor accuracy |

## Breaker CB-01: example

~~~mermaid
flowchart TD
  P["PANEL-01 · 24 slots"] --> B["Position 01 · CB-01"]
  B --> A["POWER OUTPUT"]
  A -->|"Recorded Feed A"| N["NETWORK BOARD INPUT"]
  B --> M["4/4 · EMU-BFDB-01 / 0_1_1"]
  M --> L{"Recent packet?"}
  L -->|"Yes"| V["LIVE V / A / W / kWh"]
  L -->|"No"| X["STALE or NO DATA"]
  V --> H["History if store available"]
~~~

This is a limited training scenario, not evidence for every breaker in a facility.

## Daily read-only verification procedure

1. Open the exact **Equipment**, not just its parent Device.
2. In **ACCESS PORTS**, inspect whether a terminal is CONNECTED, identify its peer and open **VIEW POWERPATH**. If the peer seems incorrect, **do not create another path**.
3. Inspect **FULL POWER TRACE** and assess Feed A and B **separately**. A VALID/VERIFIED path is not complete redundant supply if Feed B is missing.
4. Review **LIVE TELEMETRY → Own readings** and note units, observed/received time, source and raw point.
5. Inspect history using **24H** and **7D**. Old chart samples are not proof of a live reading now.
6. If values are missing, distinguish source offline, binding absent, sample stale or historical store unavailable. Do not change PowerPaths to repair MQTT.

## Frequent messages and what to do

| Message | Meaning | Safe next step |
| --- | --- | --- |
| SOURCE_ALREADY_CONNECTED | Output terminal already linked | Open VIEW POWERPATH; do not add another |
| TARGET_ALREADY_CONNECTED | Destination input already occupied | Inspect existing connection |
| FEED_MISMATCH | Fixed A/B feed constraints conflict | Verify actual circuit; do not relabel randomly |
| 4/4 but not LIVE | Mapping exists, fresh observation missing | Check publisher/broker with administrator |
| UNMAPPED | No accepted mapping for Equipment | Verify approved Panel commissioning |
| NO DATA | No usable observation available | Check source diagnostics |
| STALE | Last sample too old | Do not represent as instantaneous live power |
| HISTORY_STORE_UNAVAILABLE | Historical store could not be queried | Report to admin; preserve the database |
| Last matching packet: — | Matching observation not displayed | Do not assume data were deleted |
| Power B · No recorded path | No B-side connection recorded | Do not claim A+B redundancy |
| Placement: not mounted | Rack context exists, mounting not recorded | Review CAS; do not invent a mount |

## Write a useful incident report

Record **screen**, **Equipment identity**, **time**, **expected value**, **observed state**, **source** and **point** if known. Example:

> Panel-01 / CB-01 has 4/4 bindings under EMU-BFDB-01 / 0_1_1, but LIVE shows STALE since 10:25; the registered Feed A path remains CONNECTED. Please inspect the source and telemetry ingestion.

Never paste passwords, tokens or private customer data into the report.

## Extended administrator checks

The administrator can review authenticated telemetry diagnostics, Panel commissioning, and Equipment LIVE/24h APIs. Distinguish broker connectivity, binding ownership, store availability and age of samples. For field integrations verify that Modbus UNIT/offset and timestamp refer to the expected breaker; missing values may be published as zero or quality flags depending on the agreed contract.

**Pass:** explain precisely which evidence is present or missing without changing topology, ports, telemetry bindings or databases.

[Next: guided practice](practica-guiada.md).
