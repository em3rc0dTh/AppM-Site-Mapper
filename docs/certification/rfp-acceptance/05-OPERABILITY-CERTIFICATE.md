# Operability Certificate — Template

> This is a controlled template. It is **not a certificate of current production operability** until
> completed after acceptance execution and signed/approved by the responsible project parties.

## 1. Identification

| Field | Value |
| --- | --- |
| Project | QDF monitoring / Site Mapper |
| Customer/site | `<controlled project reference>` |
| System | Site Mapper |
| Release SHA | `<exact accepted commit>` |
| Acceptance run | `<run ID>` |
| Date | `<date>` |

## 2. Certified scope

State the exact scope. Example structure:

- Site Mapper web platform;
- target QDF/BDFB identities;
- accepted breaker telemetry;
- canonical QDF V/A/kW/kWh;
- historical telemetry;
- QDF Load Report;
- Modbus TCP publication if accepted;
- customer Metasys only if ACC-014 passed in the real field environment.

Do not include field items that remain BLOCKED.

## 3. Acceptance summary

| Category | PASS | FAIL | BLOCKED | N/A |
| --- | ---: | ---: | ---: | ---: |
| Software / web |  |  |  |  |
| Telemetry / history |  |  |  |  |
| Load reporting |  |  |  |  |
| Modbus / integration |  |  |  |  |
| Field / physical |  |  |  |  |

## 4. Operability statement

Use one of the following dispositions and remove the others.

### A. SOFTWARE OPERABILITY — PASS, FIELD ACCEPTANCE PENDING

> The identified Site Mapper release completed the software/laboratory acceptance cases listed in
> the referenced acceptance run with no open software FAIL. Field-dependent items identified as
> BLOCKED remain outside this certificate and require separate site/customer acceptance.

### B. FIELD OPERABILITY — PASS

Use only after all field obligations in the certified scope have passed:

> The identified Site Mapper release and field integration completed the applicable acceptance cases,
> including customer environment integration, with no open FAIL in the certified scope.

### C. NOT OPERABLE / CONDITIONAL

> Operability is not certified because the open items listed below prevent acceptance of the stated
> scope.

## 5. Open items and exclusions

List every known limitation or blocker. At minimum review:

- actual Metasys production commissioning;
- customer OT route/firewall;
- physical door display;
- physical QDF/controller/wiring;
- final breaker/source mapping;
- As-Built completion;
- outstanding installation observations.

“No known items” must never be used merely because a field test was not performed.

## 6. Evidence references

| Area | Evidence |
| --- | --- |
| Release identity | `09-RELEASE-IDENTIFICATION.md` |
| Compliance | `01-RFP-COMPLIANCE-MATRIX.md` |
| Procedures | `03-TEST-PROCEDURES.md` |
| Results | `04-TEST-RESULTS.md` |
| Technical dossier | `06-TECHNICAL-DOSSIER.md` |
| As-Built | `07-AS-BUILT.md` |
| Limitations | `08-KNOWN-LIMITATIONS.md` |
| Evidence artifacts | `evidence/<run/case>` or controlled project location |

## 7. Statement on telemetry authority

This certificate does not define new measurement formulas.

The accepted release must retain the documented canonical authorities:

- QDF Voltage: coherent canonical voltage projection;
- QDF Current: complete independently verified feed total;
- QDF Power: complete paired V/I canonical total, presented in kW;
- QDF Energy: E1 energy over the selected historical window;
- breaker distribution: explicit commissioned Equipment bindings.

## 8. Approval

| Role | Name | Organization | Decision | Date | Signature/reference |
| --- | --- | --- | --- | --- | --- |
| Acceptance Lead |  |  |  |  |  |
| Software Owner |  |  |  |  |  |
| Field/OT Representative |  |  |  |  |  |
| Customer/Project Representative |  |  |  |  |  |

The certificate is invalid if its release SHA, test results and stated scope do not agree.
