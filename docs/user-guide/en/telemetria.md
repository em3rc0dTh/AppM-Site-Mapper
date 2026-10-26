# 5 · MQTT commissioning: associate a signal with the correct breaker

**Goal:** associate a publisher's source and point with the exact installed breaker, and interpret telemetry without confusing signal mappings and measurements.

> **Commissioning is an assertion about physical identity.** It must not be confirmed based only on a matching number or a similar name. MQTT may be actively sending data for a different circuit.

## Before selecting Confirm

An authorized technician must have:

- A real inventory **PANEL** with POSITIONAL slots, e.g. 24.
- A confirmed source/publisher serial, such as EMU-BFDB-01 **in a laboratory only**.
- A documented **MQTT point prefix**, such as 0_1.
- A CIRCUIT_BREAKER Equipment actually installed in its correct slot, e.g. Position 01.
- Evidence that the publisher's **raw point** physically measures *that breaker*, not another.
- Permission to write commissioning mappings.

A point like 0_1_1 is **suggested from position**; it is **not** evidence of wiring or source ownership.

~~~mermaid
flowchart LR
  P["PANEL: EMU-BFDB-01"] --> F["Prefix 0_1"]
  F --> S["Installed Position 01"]
  S --> Q["Proposed point 0_1_1"]
  Q --> C{"Verified in field?"}
  C -->|"Yes"| B["Four metric bindings to CB-01"]
  C -->|"No"| H["Stop; no commissioning"]
~~~

## Step-by-step UI procedure

1. Open the correct **PANEL Equipment** (not the breaker).
2. Find **MQTT POINT COMMISSIONING**. Review **Source**, **prefix**, **capacity** and each installed-position row.
3. Find **Position 1 · [breaker]** and inspect the proposed point.
4. Interpret **0/4 metric bindings** as unmapped and **4/4 metric bindings · VERIFIED MAPPING** as all four mappings registered.
5. If unmapped and conflict-free, first verify the source/point physically, then check **I verified that [source] / [point] physically measures this breaker**.
6. Select **Confirm and commission point**.
7. Confirm the row changes to **4/4 metric bindings · VERIFIED MAPPING**; use **Refresh commissioning** if necessary.
8. Open the child CIRCUIT_BREAKER and inspect **LIVE TELEMETRY → Own readings**. If an accepted recent packet exists, values should show measurement units, timestamps, source and point.

The four independent metrics are **VOLTAGE (V)**, **CURRENT (A)**, **POWER (W)** and **ENERGY (kWh)**. Commissioning does **not** create an electrical PowerPath.

## Interpreting states

| Status | Interpretation |
| --- | --- |
| 0/4 | No metric mappings |
| 1/4–3/4 | Partial mapping requiring investigation |
| 4/4 VERIFIED MAPPING | Four mappings persisted; not proof of a recent packet |
| CONFLICT | Source/point/breaker ownership collision; stop |
| LIVE | Recent accepted observation for this Equipment |
| NO DATA / UNMAPPED | No usable recent observation or accepted mapping |
| STALE | Previous observation is too old to be considered live |

**4/4 does not imply LIVE.** A valid mapping may coexist with a stopped broker, publisher or expired credentials.

## Where the values come from

~~~mermaid
sequenceDiagram
  participant S as BFDB source
  participant M as MQTT broker
  participant A as Site Mapper
  participant H as History store
  S->>M: data/dev/EMU-BFDB-01, point 0_1_1
  M->>A: Published packet
  A->>A: Validate publisher, point and bindings
  A->>H: Persist accepted sample
~~~

Site Mapper maps accepted source data to the breaker, latest state, and (when available) TimescaleDB history. Modbus is a separate output; successful Modbus reads do not certify the MQTT source identity.

## If CONFLICT appears

Do not change another Device's serial or retire someone else's source to make the screen green. Ask the commissioning owner to verify source ownership and existing bindings. **Retire SOURCE** is a controlled destructive logical action, not part of a beginner exercise.

## Verify without editing a database

Use Equipment LIVE, then choose **24H** and **7D** for history. API query values are case-sensitive: **LIVE**, **24h**, **7d**, **15d**, **1M**. Operators should use UI controls rather than editing API URLs.

**Pass:** explain Panel, source, installed position, raw point, breaker, 4/4, LIVE and historical evidence; distinguish each state.

[Next: status and diagnostics](verificacion.md).
