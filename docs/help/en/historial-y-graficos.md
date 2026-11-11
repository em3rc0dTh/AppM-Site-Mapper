# See how readings changed

History answers a simple question: **how did this measurement change over the last hours or days?** A historical value does not always describe what is happening right now.

![Real SNMP input and MQTT reading history on a BDFB](/help/screenshots/history-charts.png)

## View earlier readings from equipment

![Panel history with separate charts for each metric](/help/screenshots/panel-history.png)

1. From **EXPLORE**, open the correct room, rack and equipment.
2. Find **LIVE TELEMETRY** or its history section.
3. First check the time of the latest reading.
4. Choose **24H** for the previous day or **7D** for the past week, if available.
5. Check the unit and time period shown.

## View QDF input history

1. Open the **BDFB Device**.
2. Go to **INSPECTOR → Charts**.
3. Choose a time period and a value such as **Current** or **Voltage**.
4. Check which input (A, B or another) belongs to each line.

Some QDF views also offer **15D** or **1M**.

## Downloadable reports

### Complete QDF report

From the BDFB you can open a report for **24H, 7D, 15D or 1M**. The summary describes overall QDF behavior without mixing it with one individual breaker.

When data is available, it includes:

- Minimum, average, maximum and voltage variation for the period.
- Average and peak current.
- Average and peak power.
- Period energy.
- Data availability.
- A table of installed breakers with their observed historical values.
- CSV export and Print / PDF.

### Individual breaker report

From a Breaker open **Operation → Charts → Open Breaker Report**.

The report uses the same **24H, 7D, 15D or 1M** periods and shows only that circuit: Voltage, Current, Power, latest Energy counter, recorded intervals and historical detail.

This lets you inspect one breaker without mixing it with the other QDF circuits.

## If the chart is empty

There may be no stored readings for the selected period. Try another available period and check whether the unit has recent readings.

## Keep these separate

- **LIVE:** a recently received reading.
- **History:** observations from earlier times.
- **Estimated power or energy:** calculations that may be shown separately from directly measured values.

**You're done when:** you can identify the value, equipment and time period shown on a chart.

[Recent readings](telemetria.md) · [Status messages](verificacion.md).
