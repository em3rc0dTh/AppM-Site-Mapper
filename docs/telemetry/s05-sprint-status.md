# Sprint 05 — Commissioning and integrations

Status date: 2026-11-05

## Objective

Make the SNMP/MQTT commissioning path understandable, maintainable, observable and reproducible without weakening the existing topology, telemetry-history or security contracts.

## Source-of-truth boundary

| Source | Authority |
| --- | --- |
| Operator post-migration QDF workbook | Declared physical breaker destination map. |
| Acrel C&P workbook | Documentary gateway/meter hardware, serial and RS485 assignment. |
| Field LAN-scanning evidence | Field verification that gateway IPv4 assignments are unique and mapped by hardware serial. |
| Site Mapper runtime / MongoDB | State actually applied to the installation. |
| TimescaleDB | Durable telemetry history. |
| SNMP collector/configuration | Commissioned OID and controller mapping. |

Exact customer-network values, real credentials and private normalized commissioning manifests are stored under `.runtime/` or another approved secret/private evidence location and are not committed.

## Current reconciliation

- 74 declared post-migration breakers are represented by the current seed definition:
  - QDF-2: 26;
  - QDF-4: 12;
  - QDF-5: 36.
- The three Acrel gateway hardware serials agree with the current Site Mapper seed and prior MQTT laboratory mapping.
- Panel-to-Modbus Slave IDs agree across the documentary source and current seed: A3=1, A2=3, B3=5, B2=7.
- Field LAN evidence supersedes the duplicate IPv4 placeholder/documentary value in CP_Acrel_v0.3. Gateway identity remains the hardware serial, never the IPv4 address.
- Gateway MAC uniqueness is not yet promoted to FIELD VERIFIED from the supplied screenshot.
- Three meter serial assignments disagree between the documentary C&P workbook and the current seed. They remain `CONFLICT` and block automatic APPLY until authoritative physical/runtime evidence resolves them.

## Story status

| Story | Status | Current evidence |
| --- | --- | --- |
| HU-033 — identify MQTT/SNMP sources per QDF | IN PROGRESS | Source/profile observability added on the S05 branch; runtime diff still required. |
| HU-034 — inspect equipment/breaker/shunt bindings | IN PROGRESS | Sanitized binding inventory and source grouping added; runtime acceptance pending. |
| HU-035 — distinguish provenance, freshness and communication | IN PROGRESS | Projection supports LAB/FIELD/DECLARED and LIVE/STALE/OFFLINE/ERROR; runtime acceptance pending. |
| HU-036 — repeatable commissioning without duplicates | IN PROGRESS | Existing transactional binding guards preserved; read-only external-reference diff added; APPLY remains blocked. |
| HU-037 — keep credentials/secrets out of public surfaces | IN PROGRESS | Real workbook credentials are excluded from Git and UI observability; rotation decision remains operational. |
| HU-038 — controlled recovery and durable history | PENDING S05 | Existing Timescale/MQTT recovery baseline will be verified after reconciliation. |

## Repository implementation

S05 work is isolated on `feat/s05-commissioning-audit` and PR #163.

The slice adds:

- a read-only external-reference/runtime auditor;
- a synthetic public reference schema;
- safe documentation of field-network evidence;
- a commissioning observability projection;
- sanitized MQTT/SNMP source and binding views;
- a read-only UI panel;
- ES/EN copy;
- unit/CI coverage for the projection.

## Gate before APPLY

No seed, communication profile or telemetry binding may be automatically corrected until:

1. the private commissioning manifest is executed against the deployed TFARM04 MongoDB;
2. all `CONFLICT` and `MISSING_IN_RUNTIME` findings are classified;
3. the three meter serial conflicts are resolved from authoritative evidence;
4. a PLAN diff is reviewed;
5. the operator explicitly approves APPLY.

The S05 audit is deliberately read-only and is not an APPLY mechanism.
