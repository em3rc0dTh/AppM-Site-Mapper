# BDFB-01 — SNMPv3 synthetic lab, visual acceptance (2026-10-24)

Operator-supplied running Site Mapper screenshots confirm:

- BDFB-01 Inputs: `LAB SIMULATED`, 2 shunts reporting, INPUT-SHUNT-A `LAB LIVE · SIMULATED`, 228.90 A and -53.10 V, source EMU-DELTA-BFDB-01.
- BDFB-01 Charts > 24H > Current: nonempty, separately labeled historical SNMP series for `A (LAB)` and `B (LAB)` in TimescaleDB. Screenshot legend: A 219.9 A, B 209.5 A.
- Estimated energy in screenshot: 65.7687 kWh, 344.0 feed-minutes. Derived from paired voltage and current; **not** physical energy-counter evidence.
- Independent MQTT equipment history is visible for the original three breakers (87 buckets in user-supplied textual UI observation). Its measurements are not SNMP input-shunt measurements.
- Previously shared original Docker logs confirm an SNMPv3 agent, active collector, and nine successful 4-point ingestion events. The UI now demonstrates stored history and live display beyond the collector logs.

**Decision: PASS for local, synthetic BDFB-01 Config2 A/B SNMP end-to-end demonstration.** This does not certify a real Delta controller, physical wiring, or shunt calibration. BDFB-02 and BDFB-03 still have no selected SNMP hardware profiles, SNMP input ports, or SNMP OID bindings. Preserve their existing MQTT breaker inventory and Modbus Unit IDs 4 and 5; no broad Compose restart is needed.
