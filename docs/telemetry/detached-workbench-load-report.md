# Detached Telemetry Workbench and QDF Load Report

## Purpose

Site Mapper keeps the operational BDFB Physical View and its narrow Inspector unchanged. Large
telemetry analysis opens in a separate browser browsing context through a direct user action.

The detached Workbench is additive:

```text
BDFB Inspector preview
        |
        | user clicks ↗
        v
window.open(same-origin Workbench route)
        |
        +-- SNMP charts
        +-- MQTT charts
        +-- SNMP inputs
        +-- QDF Load Report
```

The browser remains authoritative about whether the requested browsing context is rendered as a
separate window or tab. Site Mapper requests a resizable popup-sized window and reuses a stable
window name per BDFB.

## Routes

- `/workbench/telemetry?deviceId=<id>&view=snmp`
- `/workbench/telemetry?deviceId=<id>&view=mqtt`
- `/workbench/telemetry?deviceId=<id>&view=inputs`
- `/workbench/load-report?deviceId=<id>&window=24h`

All routes require `telemetry:read`. The root AppShell is intentionally suppressed only for
`/workbench/*`; the normal Site Mapper view is not replaced.

## Load Report authority

The QDF summary is projected exclusively from `qdf-vipe-v1` historical points:

- Voltage: canonical coherent QDF voltage points.
- Current: canonical verified independent-input total current points.
- Power: canonical QDF total power in kW.
- Energy: E1 canonical window energy in kWh.

The report computes descriptive statistics (min/average/peak) over those accepted points. It does
not recalculate V/A/P/E or fill missing buckets.

Breaker distribution is a separate downstream context. It reads only canonical Equipment history
reachable through explicit MQTT Equipment bindings. It reports observed breaker averages/peaks and
the latest energy counter; it never replaces the QDF total contract.

## Export

CSV is generated from the already-loaded canonical report. “Print / PDF” delegates to the
browser print pipeline so an operator can print or save as PDF without creating a second reporting
engine.

## Compatibility

No MongoDB or TimescaleDB schema changes are introduced. MQTT topics, SNMP collection, Modbus
registers, `powerW/power_w`, Energy E1 and the existing BDFB Physical View remain unchanged.
