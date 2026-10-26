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

## View SNMP input history

1. Open the **BDFB Device**.
2. Go to **INSPECTOR → Charts**.
3. Choose a time period and a value such as **Current** or **Voltage**.
4. Check which input (A, B or another) belongs to each line.

Some SNMP views also offer **15D** or **1M**.

## If the chart is empty

There may be no stored readings for the selected period. Try another available period and check whether the unit has recent readings.

## Keep these separate

- **LIVE:** a recently received reading.
- **History:** observations from earlier times.
- **Estimated power or energy:** calculations that may be shown separately from directly measured values.

**You're done when:** you can identify the value, equipment and time period shown on a chart.

[Recent readings](telemetria.md) · [Status messages](verificacion.md).
