# RFP Compliance Matrix — Site Mapper / QDF Telemetry

## 1. Purpose

This matrix maps the customer RFP to explicit Site Mapper acceptance cases. It is a traceability
document, not a claim of customer acceptance.

The confidential RFP itself is controlled outside this repository. References below identify the
customer section/page without copying the source document.

## 2. Interpretation rules

- `Direct`: the RFP explicitly requires the capability.
- `Supporting`: not a separately named RFP function, but required to demonstrate safe/valid
  operation of a direct requirement.
- `Field`: requires physical/customer environment validation.
- `Outside software`: tracked because it is in the RFP but cannot be certified by Site Mapper.

Initial result is `NOT_RUN` even when implementation and engineering evidence already exist.

## 3. Functional and integration traceability

| ID | RFP reference | Class | Acceptance obligation | Site Mapper authority / implementation | Readiness | Formal test | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RFP-QDF-001 | §2.1.2, pp.26–27 | Direct | Provide local/remote measurement capability associated with each new QDF. | Site Mapper web UI + telemetry ingestion architecture. | IMPLEMENTED | ACC-002, ACC-003 | NOT_RUN |
| RFP-QDF-002 | §2.1.2, p.27 | Direct | Observe current consumption for installed breakers. | Equipment telemetry bindings/history. | IMPLEMENTED | ACC-003 | NOT_RUN |
| RFP-QDF-003 | §2.1.2, p.27 | Direct | Observe total QDF/rack current in real time. | Canonical QDF TOTAL_CURRENT authority. | IMPLEMENTED | ACC-004 | NOT_RUN |
| RFP-QDF-004 | §2.1.3, p.28 | Direct | Measure Voltage over time at total-QDF and breaker scope. | `qdf-vipe-v1` total Voltage + Equipment history for breakers. | IMPLEMENTED | ACC-003, ACC-005 | NOT_RUN |
| RFP-QDF-005 | §2.1.3, p.28 | Direct | Measure Current over time at total-QDF and breaker scope. | `qdf-vipe-v1` total Current + Equipment history for breakers. | IMPLEMENTED | ACC-003, ACC-004 | NOT_RUN |
| RFP-QDF-006 | §2.1.3, p.28 | Direct | Measure Power over time in kW at total-QDF and breaker scope. | Canonical internal W; contractual/UI boundary kW. | IMPLEMENTED | ACC-003, ACC-006 | NOT_RUN |
| RFP-QDF-007 | §2.1.3, p.28 | Direct | Measure Energy over time in kWh at total-QDF and breaker scope. | QDF Energy E1 window projection + breaker Equipment history where commissioned. | IMPLEMENTED | ACC-003, ACC-007 | NOT_RUN |
| RFP-QDF-008 | §2.1.3, p.28 | Direct | Make measurements accessible locally through a web platform. | Site Mapper web application. | IMPLEMENTED | ACC-002 | NOT_RUN |
| RFP-QDF-009 | §2.1.3, p.28 | Direct | Generate load reports from the local web platform. | Detached Workbench / explicit QDF Load Report. | IMPLEMENTED | ACC-008 | NOT_RUN |
| RFP-QDF-010 | §2.1.2, p.27 | Direct | Expose a network integration path compatible with Metasys. | Read-only Modbus TCP output and generated register map. | EVIDENCE_AVAILABLE | ACC-013, ACC-014 | NOT_RUN |
| RFP-QDF-011 | §2.1.2, p.27 | Field | Configure the actual customer IP/network path necessary for Metasys communication. | Deployment-specific; not provable from repository CI. | FIELD_REQUIRED | ACC-014 | NOT_RUN |
| RFP-QDF-012 | §2.1.3, p.28 | Field | Read load information from the physical display at the QDF door. | Physical QDF/display supplier scope; Site Mapper does not certify hardware display. | FIELD_REQUIRED | ACC-015 | NOT_RUN |
| RFP-QDF-013 | §2.1.2, pp.26–27 | Outside software | New QDF plant capacity and physical installation requirements, including 1200 A capacity. | Hardware/installation scope. | OUTSIDE_SOFTWARE | ACC-016 | NOT_RUN |

## 4. Quality, validation and handoff traceability

| ID | RFP reference | Class | Acceptance obligation | Site Mapper / pack response | Readiness | Formal test | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RFP-QLT-001 | §2.7, pp.31–32 | Direct | Execute tests necessary to demonstrate validity of delivered products. | This Acceptance & Operability Pack plus existing CI/lab evidence. | PENDING_EXECUTION | ACC-001 through ACC-018 | NOT_RUN |
| RFP-QLT-002 | §2.7, pp.31–32 | Direct | Review generated documentation. | Structured pack + technical authorities. | IMPLEMENTED | ACC-018 | NOT_RUN |
| RFP-QLT-003 | §2.7, p.32 | Direct | Maintain configuration/change control. | Git release identity, immutable commit SHA, controlled topology/binding/config evidence. | IMPLEMENTED | ACC-001, ACC-017 | NOT_RUN |
| RFP-QLT-004 | §2.7, p.32 | Direct | Maintain records and corresponding reports. | Test results, evidence index, Load Report, dossier. | IMPLEMENTED | ACC-008, ACC-018 | NOT_RUN |
| RFP-HO-001 | §3.1, p.34 | Direct | Handover includes installation/configuration/commissioning plus As-Built and technical dossier. | As-Built template + Technical Dossier; field completion required. | FIELD_REQUIRED | ACC-017, ACC-018 | NOT_RUN |
| RFP-HO-002 | §3.1, p.34 | Direct | Project acceptance requires no unresolved installation observations. | Open-observation register must be zero for final field sign-off. | FIELD_REQUIRED | ACC-018 | NOT_RUN |
| RFP-HO-003 | §5, p.35 | Direct | Provide a detailed descriptive installation memorandum. | Technical Dossier + final project installation memorandum. | PENDING_EXECUTION | ACC-018 | NOT_RUN |
| RFP-HO-004 | §5, p.35 | Direct | Provide an operability certificate for installed items. | Operability Certificate template in this pack. | PENDING_EXECUTION | ACC-018 | NOT_RUN |
| RFP-HO-005 | §5, p.35 | Field | Update station single-line drawings when applicable. | Physical/electrical As-Built activity. | FIELD_REQUIRED | ACC-017 | NOT_RUN |
| RFP-HO-006 | §5, p.35 | Field | Train station personnel in operation, maintenance and administration. | Customer/vendor handover activity. | FIELD_REQUIRED | ACC-018 | NOT_RUN |
| RFP-HO-007 | §5, p.35 | Outside software | Warranty obligations for equipment and labor. | Commercial/supplier obligation, not software acceptance. | OUTSIDE_SOFTWARE | ACC-018 | NOT_RUN |

## 5. Supporting software acceptance

These rows are not substitutes for direct RFP clauses. They are safety/operability controls needed
to make the direct claims credible.

| ID | Supporting obligation | Why it matters | Test | Result |
| --- | --- | --- | --- | --- |
| SUP-001 | Missing/stale/unverified inputs must not become plausible contractual totals. | Prevents a broken source from appearing compliant. | ACC-009 | NOT_RUN |
| SUP-002 | Historical data must survive application restart. | Required for “measurement over time” to be operable. | ACC-010 | NOT_RUN |
| SUP-003 | QDF identities must remain isolated. | QDF-2/QDF-4/QDF-5 must not cross-contaminate. | ACC-011 | NOT_RUN |
| SUP-004 | Web telemetry surfaces require authorized access. | Local web access must remain governed. | ACC-012 | NOT_RUN |
| SUP-005 | Modbus publication must preserve units, addresses and source isolation. | Prevents incorrect Metasys interpretation. | ACC-013 | NOT_RUN |

## 6. Current engineering evidence available before formal execution

Existing evidence may be cited by a test operator, but it does not automatically set a matrix row
to PASS:

- unified QDF V/A/P/E contract documentation;
- QDF Load Report implementation and documentation;
- telemetry history and Timescale integration;
- read-only Modbus TCP output and Metasys register-map generator;
- synthetic/laboratory SNMP/MQTT evidence;
- repository CI and operational acceptance workflows.

Formal execution must identify the exact release and preserve the resulting evidence.

## 7. Closure rule

The matrix may be declared closed for the accepted Site Mapper scope only when:

- every software/direct row is `PASS`, approved `N/A` or an explicitly accepted `BLOCKED`;
- no `FAIL` remains;
- field rows are either executed or explicitly transferred to the SAT/installation punch list;
- every PASS points to an evidence directory and execution record;
- the Operability Certificate states the same boundary as this matrix.
