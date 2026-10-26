# View live equipment readings

Some equipment sends measurements that Site Mapper can display as **LIVE**. This view helps you identify **which value was received, for which item, and when**.

## Open breaker readings

![Real breaker view with LIVE readings](/help/screenshots/breaker-live.webp)

1. Open the Room and Rack containing the equipment.
2. Navigate to the Panel and select the breaker.
3. Open **Telemetry** or find **Own telemetry**.
4. Check the **LIVE** status, the values, and the **Source / Last packet** line.

## What each value means

| Value                  | Meaning            |
| ---------------------- | ------------------ |
| **V / Voltage**        | Voltage            |
| **I / Current**        | Current            |
| **P / Power**          | Power              |
| **E / Energy counter** | Accumulated energy |

![How input readings differ from circuit readings](/help/diagrams/en/readings.svg)

## What LIVE means

**LIVE means Site Mapper received a sample recently enough according to its configured freshness rules.** It is not a certification of wiring, physical power or sensor accuracy.

Check **Source** and **Last packet** before interpreting a value.

## Installed does not mean the same as reporting

A Panel may show **3/24 positions MQTT LIVE**, **3 installed** and **21 available**. In that example the Panel has 24 positions and three are occupied/reporting; it does not mean 24 breakers are installed.

## View earlier readings

Open **History & diagnostics · charts**. Depending on the screen, periods can include **24H**, **7D**, **15D** or **1M**.

## If you see STALE, NO DATA or another status

Do not assume the unit is switched off. The issue may be the source, signal mapping, freshness of the latest sample or stored history. Use [When equipment readings are missing](verificacion.md).

**Expected result:** you can identify the equipment, unit, latest sample time and whether the reading is recent.

[View circuits and power inputs](recorrido-completo-login-mqtt-snmp-modbus.md).
