# 4 · Connect POWER terminals without duplicating paths

**Goal:** identify where power originates, which Equipment receives it, the exact Access Ports at both ends and whether a connection already exists.

> Only authorized operators should record a PowerPath, after checking the physical installation. Recording a path **does not energize hardware**. The accepted rule is **one source Access Port → one destination Access Port**.

## 1. A port is not a connection

~~~mermaid
flowchart LR
  CB["CB-01 · CIRCUIT_BREAKER"] --> O["POWER OUTPUT"]
  O -->|"PowerPath · Feed A"| I["AP-01-01 · BIDIRECTIONAL"]
  I --> N["NETWORK BOARD"]
~~~

- **Access Port:** a terminal belonging to a specific Equipment; it may be available or occupied.
- **PowerPath:** persistent recorded relationship between two named terminals.
- **Feed A/B:** electrical source path identity. A recorded A does not imply B exists or that redundancy was proven.
- **CONNECTED:** the terminal already participates in a registered path.
- **VIEW POWERPATH:** opens that record for inspection.

The training case CB-01 Power output → NETWORK BOARD AP-01-01 on Feed A is a model of a **registered** relation, not an independent verification of real wiring.

## 2. Inspect both ends first

1. Open the source Equipment from its Rack or from navigation/search.
2. Locate **PHYSICAL TERMINALS**, select its POWER terminal, e.g. Power output.
3. Confirm Type POWER, Direction OUTPUT (or an approved BIDIRECTIONAL terminal) and current status.
4. If the source is **CONNECTED**, stop: inspect **FEEDS → destination Equipment/port** and use **VIEW POWERPATH**. Do not add a second path.
5. Open the destination Equipment. Inspect its POWER INPUT/BIDIRECTIONAL terminal; if occupied, it displays **CONNECTED** and **POWERED BY ← source/port**.
6. Confirm the actual pair of terminals with the electrical field owner. Equipment names alone are not sufficient.

## 3. Record a connection, only when both ports are free

1. On the source Equipment's **PHYSICAL TERMINALS**, select the verified OUTPUT and choose **CONNECT LOAD**.
2. In **1 · Electrical source**, confirm **Source Equipment / POWER OUTPUT**.
3. In **2 · Destination load**, use **Search destination Equipment** and choose the correct **Destination Equipment / POWER INPUT**.
4. In **3 · Verify and confirm**, inspect the source → destination summary. Select **Feed A** or **Feed B** only as supported by the real circuit; a fixed-feed endpoint may lock the option.
5. Optionally add a meaningful **Connection label**.
6. Only after physical confirmation, select **CONFIRM PHYSICAL CONNECTION**.
7. The application opens the recorded PowerPath; return to both Equipment views and confirm both ports now show **CONNECTED**.

The dialog is scrollable on laptops. Scroll to the bottom to review warnings and confirmation; never hide validation errors by changing zoom.

## 4. Busy ports and safe handling

~~~mermaid
flowchart TD
  P["Select source port"] --> C{"CONNECTED?"}
  C -->|"Yes"| V["Read peer and VIEW POWERPATH"]
  V --> S["Do not connect a second destination"]
  C -->|"No"| D["Confirm free destination INPUT"]
  D --> W["Verify wiring + Feed"]
  W --> A["CONFIRM PHYSICAL CONNECTION"]
~~~

A source already in use produces **SOURCE_ALREADY_CONNECTED**; an occupied target produces **TARGET_ALREADY_CONNECTED**. Same-Equipment routes or incompatible fixed feeds are also blocked. Never reuse a BIDIRECTIONAL terminal in multiple competing source/destination paths.

To distribute to several loads, use a **distribution Equipment** with separate physical output terminals, each connected to one distinct input. Do not draw multiple PowerPaths from the same breaker OUTPUT.

## 5. Confirm the result at both ends

| Where | Recorded evidence | Meaning |
| --- | --- | --- |
| CB-01 → PHYSICAL TERMINALS | Power output · CONNECTED | Source port is occupied |
| Selected source terminal | FEEDS → NETWORK BOARD / AP-01-01 · Feed A | Exact destination |
| NETWORK BOARD terminal | CONNECTED + POWERED BY ← CB-01 | Reverse link recorded |
| VIEW POWERPATH / FULL POWER TRACE | Feed A path | Auditable recorded route |
| Inspector Power A / B | A Path recorded; B No recorded path | Only A has a recorded path |

A VERIFIED path validates the represented link; it is **not proof of voltage, redundant feeds or accurate live sensor readings**.

## 6. Never do the following

- Connect a source already marked CONNECTED.
- Reuse one BIDIRECTIONAL Access Port on two distinct active paths.
- Change MQTT serials or TelemetryBindings to fix electrical connectivity.
- Create fictional Equipment or cables to make Feed B appear complete.
- Archive an old path automatically without an approved field-change procedure.

**Pass:** show both ends of the same PowerPath and accurately separate registered connection, LIVE measurements and redundancy.

[Next: MQTT](telemetria.md).
