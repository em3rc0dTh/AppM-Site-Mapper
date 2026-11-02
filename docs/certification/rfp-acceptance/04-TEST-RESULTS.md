# Acceptance Test Results

## 1. Status

This file is the formal execution register.

**Initial state:** no contractual/customer acceptance is implied by this template. Populate it during
an actual acceptance run against the frozen release.

## 2. Run header

| Field                   | Value                           |
| ----------------------- | ------------------------------- |
| Acceptance run ID       | `<YYYYMMDD-site-mapper-qdf-XX>` |
| Release SHA             | `<commit>`                      |
| Deployment ID           | `<deployment/image>`            |
| Date/time               | `<ISO-8601 with timezone>`      |
| Environment             | `LAB / PRE-PROD / FIELD`        |
| Data provenance         | `LAB / FIELD`                   |
| Acceptance Lead         | `<name/role>`                   |
| Test Operator           | `<name/role>`                   |
| Field/OT representative | `<name/role or N/A>`            |

## 3. Summary

| Result  | Count |
| ------- | ----: |
| PASS    |     0 |
| FAIL    |     0 |
| BLOCKED |     0 |
| N/A     |     0 |
| NOT_RUN |    18 |

**Overall disposition:** `NOT_EXECUTED`

Do not change the overall disposition to PASS while any in-scope software FAIL remains.

## 4. Result register

| Test    | Scope                         | Result  | Evidence reference | Observation / action |
| ------- | ----------------------------- | ------- | ------------------ | -------------------- |
| ACC-001 | Release identity              | NOT_RUN | —                  | —                    |
| ACC-002 | Local web platform            | NOT_RUN | —                  | —                    |
| ACC-003 | Breaker V/A/kW/kWh            | NOT_RUN | —                  | —                    |
| ACC-004 | QDF total Current             | NOT_RUN | —                  | —                    |
| ACC-005 | QDF total Voltage             | NOT_RUN | —                  | —                    |
| ACC-006 | QDF total Power               | NOT_RUN | —                  | —                    |
| ACC-007 | QDF Energy                    | NOT_RUN | —                  | —                    |
| ACC-008 | Load Report                   | NOT_RUN | —                  | —                    |
| ACC-009 | Fail-closed quality           | NOT_RUN | —                  | —                    |
| ACC-010 | Persistence/restart           | NOT_RUN | —                  | —                    |
| ACC-011 | QDF/source isolation          | NOT_RUN | —                  | —                    |
| ACC-012 | Authorized telemetry access   | NOT_RUN | —                  | —                    |
| ACC-013 | Modbus lab contract           | NOT_RUN | —                  | —                    |
| ACC-014 | Metasys field integration     | NOT_RUN | —                  | —                    |
| ACC-015 | Door display                  | NOT_RUN | —                  | —                    |
| ACC-016 | Physical QDF capacity/install | NOT_RUN | —                  | —                    |
| ACC-017 | As-Built review               | NOT_RUN | —                  | —                    |
| ACC-018 | Final operability/handoff     | NOT_RUN | —                  | —                    |

## 5. Per-test execution record template

Copy this block for each executed case.

```text
TEST ID:
TITLE:

Release SHA:
Environment:
Target QDF:
Data provenance: FIELD | LAB
Started at:
Completed at:
Operator:

Prerequisites:
- [ ] ...

Procedure deviations:
- None
or
- <explicitly describe approved deviation>

Expected result:
<from 03-TEST-PROCEDURES.md>

Observed result:
<objective observation>

Evidence:
- <controlled or repository evidence reference>

Result:
PASS | FAIL | BLOCKED | N/A

Defect / punch-list reference:
<if applicable>

Reviewed by:
<name/role/date>
```

## 6. Failure handling

For a FAIL:

1. create a defect/change record;
2. do not edit the expected result to match the failure;
3. correct code/configuration under a separate controlled change;
4. freeze the new release SHA;
5. re-run the affected case and any impacted regression cases;
6. retain the failed historical record.

## 7. Blocked handling

For a BLOCKED result record:

- exact missing dependency;
- dependency owner;
- field/customer action needed;
- whether software acceptance can continue;
- planned SAT/field test reference.

Typical legitimate blockers include:

- no production Metasys access;
- no approved OT route;
- physical QDF/display not available;
- final QDF-2/QDF-4/QDF-5 mapping not commissioned.

## 8. Final approval record

| Role                            | Name | Decision | Date | Signature/reference |
| ------------------------------- | ---- | -------- | ---- | ------------------- |
| Acceptance Lead                 |      |          |      |                     |
| Software Owner                  |      |          |      |                     |
| Field/OT Representative         |      |          |      |                     |
| Customer/Project Representative |      |          |      |                     |

Final approval must use the same release SHA and scope stated in the Operability Certificate.
