# Link SNMP readings to a DC input

On BDFB units, **main power inputs** may have readings separate from the individual breakers. This guide explains how to prepare an input and link its readings.

![From DC input to readings](/help/diagrams/en/snmp.svg)

## Before you start

Check with the responsible person which hardware is installed. Site Mapper can use **Config2** (inputs A and B) or **Config4** (A1, A2, B1 and B2). Do not switch profiles just to fix an unexpected reading.

## Prepare the input

1. Open the correct **BDFB Device**.
2. Find its input configuration or **ACCESS PORTS** editor.
3. Review the selected hardware profile before adding inputs.
4. Create a power terminal of type **POWER → INPUT → EXTERNAL**.
5. Choose its input identification and which Panels it serves, as confirmed on site.
6. Enter the requested ratings and confirm the wiring **only after it has been physically verified**.

## Link the readings

1. On the same input, choose the SNMP reading setup option when available.
2. Enter the **Source** (controller) and verified **Current OID**.
3. Enter a **Voltage OID** if the correct value is known.
4. Confirm the mapping and save.
5. Reopen the input and check which readings are now linked.

## If the input saved but some readings did not

**Do not create another input.** The terminal may have saved successfully while one OID mapping failed. Reopen **that same terminal**, review the existing readings and finish only the missing mapping.

## Check the result

Open **INSPECTOR → Inputs** on the BDFB. When readings arrive, you'll see values and status. For earlier values, use **Charts**.

**You're done when:** you know which input you're viewing, which controller supplies its data and whether readings are available.

[Circuits and inputs](recorrido-completo-login-mqtt-snmp-modbus.md) · [Charts](historial-y-graficos.md).
