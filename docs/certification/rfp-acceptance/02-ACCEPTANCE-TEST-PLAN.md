# Acceptance Test Plan — Site Mapper / QDF Telemetry

## 1. Objective

Define how Site Mapper acceptance is planned, executed, evidenced and approved for the QDF project.

This plan is deliberately stricter than “CI is green.” CI is supporting evidence. Contractual
acceptance requires a frozen release, a known environment, explicit expected results and an
execution record.

## 2. Scope

### In scope

- Site Mapper authentication/authorized access required to operate telemetry surfaces.
- QDF/BDFB topology sufficient to identify the tested QDF.
- breaker telemetry through commissioned Equipment bindings;
- canonical QDF total Voltage, Current, Power and Energy;
- historical storage and retrieval;
- local web visualization;
- QDF Load Report;
- read-only Modbus TCP publication and register-map behavior;
- restart/persistence and fail-closed behavior;
- evidence, release identity and handoff documentation.

### Field scope tracked but not automatically certified in lab

- customer production network and firewall route;
- actual Metasys driver/point commissioning;
- physical QDF/controller/sensor wiring;
- actual QDF-2/QDF-4/QDF-5 source identities and breaker mapping;
- physical door display;
- physical 1200 A QDF capacity;
- final As-Built electrical/network information;
- training and final customer sign-off.

## 3. References

Repository authorities:

- `docs/telemetry/qdf-unified-vipe-contract.md`
- `docs/telemetry/detached-workbench-load-report.md`
- `docs/telemetry/modbus-tcp-output.md`
- `docs/telemetry/metasys-register-map.md`
- `docs/telemetry/industrial-integration.md`

Customer source references are listed in the compliance matrix and remain externally controlled.

## 4. Roles

One person may hold multiple roles in a laboratory run, but the record must state who performed each
role.

| Role | Responsibility |
| --- | --- |
| Acceptance Lead | Freezes scope/release, confirms prerequisites, owns final test disposition. |
| Test Operator | Executes procedures exactly and records observations. |
| Evidence Recorder | Captures sanitized screenshots, API responses, logs and timestamps. |
| Software Owner | Investigates FAIL results; may not silently change expected results to create a PASS. |
| Field/OT Representative | Confirms customer network, Metasys, physical mappings and field-only items. |
| Customer/Project Representative | Approves final field acceptance or punch-list disposition where required. |

## 5. Release freeze

Before testing, complete `09-RELEASE-IDENTIFICATION.md`.

Minimum release identity:

- repository;
- branch/tag;
- exact commit SHA;
- build/release identifier if available;
- date/time;
- container/image identifiers if used;
- configuration profile name;
- hash/version of private source/binding/register mappings without publishing their secrets.

No code change is allowed inside an acceptance run. If a fix is required:

```text
FAIL
  -> stop affected case
  -> create separate code/config change
  -> produce new release identity
  -> repeat impacted cases
```

## 6. Environment record

Record at minimum:

| Component | Required record |
| --- | --- |
| Site Mapper | commit/release, URL, runtime mode |
| Browser | product/version |
| MongoDB | version/topology |
| TimescaleDB/PostgreSQL | version |
| MQTT broker | product/version and security mode |
| SNMP source/collector | profile/version when used |
| Modbus sidecar | release/image, bind address and policy |
| BDFB/QDF | tested canonical Device ID and field label |
| Bindings | approved binding-set revision/hash |
| OT/BMS | only for field run: approved endpoint/driver configuration record |

Do not commit credentials or private customer addresses to this repository.

## 7. Data classes

Every measurement used for acceptance must identify its provenance:

- `FIELD`: commissioned field evidence;
- `LAB`: simulation/emulator evidence.

A contractual field PASS must not be produced from mixed or LAB-only data unless the acceptance
scope explicitly says “laboratory.”

## 8. Test result states

### PASS

Use only when:

1. all prerequisites were satisfied;
2. procedure was executed;
3. observed result matches expected result;
4. required evidence exists;
5. no contradictory observation remains unresolved.

### FAIL

Use when the product behavior does not meet the expected result.

A FAIL cannot be waived by editing the result narrative. Fix or formally change the accepted
requirement/scope.

### BLOCKED

Use when the procedure cannot be completed because an external prerequisite is unavailable, for
example no customer Metasys access or no physical door display.

### N/A

Use only with written rationale and an identified approver.

### NOT_RUN

Default state before execution.

## 9. Evidence standard

Every executed case gets an evidence directory:

```text
evidence/ACC-XXX/
├── README.md
├── ui-*.png
├── api-*.json
├── history-*.json
├── modbus-*.txt
└── notes-*.md
```

Only artifacts actually needed by that case should be included.

Each evidence README records:

- case ID;
- release SHA;
- execution timestamp with timezone;
- operator;
- target QDF;
- data provenance (FIELD/LAB);
- artifact list;
- sanitization performed;
- result.

Evidence must not include secrets, customer-confidential RFP pages, private IP addresses, serial
numbers or credentials in a public repository.

If evidence cannot be sanitized safely, store it in the controlled project repository and put only a
stable evidence reference here.

## 10. Measurement rules

Acceptance must consume existing authorities.

### Voltage

- do not sum bus voltages;
- use canonical coherent QDF Voltage output;
- invalid/incoherent total is not converted to zero.

### Current

- total QDF Current is the canonical sum of complete independently verified input feeds;
- partial input sets cannot pass total-current acceptance.

### Power

- contractual/presentation unit is kW;
- internal breaker/feed storage remains W where designed;
- acceptance must not independently recompute a different total.

### Energy

- QDF E1 is energy for the requested historical window;
- it is not a lifetime totalizer;
- omitted/incomplete buckets are not zero-filled.

### Breaker data

Breaker rows are accepted only through explicitly commissioned bindings. Breaker measurements do not
replace the authoritative QDF totals.

## 11. Sequence

Recommended order:

1. ACC-001 Release identity.
2. ACC-002 Local web access.
3. ACC-003 Breaker V/A/kW/kWh historical telemetry.
4. ACC-004 through ACC-007 QDF total V/A/kW/kWh.
5. ACC-008 Load Report.
6. ACC-009 quality/fail-closed.
7. ACC-010 persistence/restart.
8. ACC-011 identity/isolation.
9. ACC-012 authorized access.
10. ACC-013 Modbus laboratory contract.
11. ACC-014 Metasys field integration.
12. ACC-015 through ACC-017 physical/As-Built gates.
13. ACC-018 final operability/handoff review.

## 12. Entry criteria

Formal execution starts only when:

- release identity is frozen;
- required services are healthy;
- tested QDF exists in topology;
- required bindings are approved;
- time synchronization is adequate for historical comparison;
- operator can distinguish LAB from FIELD data;
- evidence storage location is ready;
- known limitations have been reviewed.

## 13. Exit criteria

Software acceptance can close when:

- no software case remains FAIL;
- all direct software obligations have PASS or approved disposition;
- results and evidence references are complete;
- field-only items remain explicitly BLOCKED/OPEN if not executed.

Final project acceptance additionally requires field obligations, As-Built, operability certificate
and project/customer sign-off as applicable.

## 14. Retest policy

A change to any of the following requires impact review and possible re-test:

- canonical V/A/P/E semantics;
- telemetry binding behavior;
- history persistence/query;
- Load Report;
- Modbus register map or units;
- source/unit mapping;
- authentication/permissions;
- deployment network/configuration affecting the accepted path.

The retest record must identify both the superseded and new release SHAs.
