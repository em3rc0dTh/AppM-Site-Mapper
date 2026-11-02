# Acceptance Test Procedures — Site Mapper / QDF Telemetry

## 1. How to use this document

Each procedure defines:

- purpose and RFP traceability;
- prerequisites;
- steps;
- expected result;
- required evidence;
- field/lab boundary.

Do not mark a case PASS from historical memory. Execute it against the frozen release identified in
`09-RELEASE-IDENTIFICATION.md`.

---

## ACC-001 — Release identity and reproducibility

**Traceability:** RFP quality/configuration control; supporting all acceptance cases.

**Purpose:** prove that acceptance refers to one immutable Site Mapper release.

**Prerequisites**

- target repository/branch available;
- acceptance environment running or ready to run.

**Procedure**

1. Record exact Git commit SHA and branch/tag.
2. Record deployment/container/image identifiers.
3. Record database, broker and browser versions.
4. Record tested QDF ID/label.
5. Record private mapping/profile revision identifiers or hashes without exposing secrets.
6. Confirm working tree/deployment has no undocumented local modification.

**Expected**

- a complete release identity exists;
- every later evidence item can be tied to this release.

**Evidence**

- completed `09-RELEASE-IDENTIFICATION.md`;
- deployment/version output or controlled deployment record.

---

## ACC-002 — Local web platform access

**Traceability:** RFP §2.1.3, p.28.

**Purpose:** demonstrate that an authorized operator can access the QDF measurement platform from
the intended local deployment context.

**Procedure**

1. Open the deployed Site Mapper URL from the acceptance workstation.
2. Authenticate with an authorized operator account.
3. Navigate to the target QDF/BDFB.
4. Open the Inspector.
5. Confirm Overview/Inputs/Charts surfaces render.
6. Open a detached Workbench surface.

**Expected**

- Site Mapper is reachable in the accepted local context;
- authenticated operator can reach the target QDF;
- Workbench can open without replacing the main operational view.

**Evidence**

- sanitized UI captures;
- timestamp and target QDF;
- deployment record.

**Field note:** a lab URL proves software behavior, not the final TELXIUS network route.

---

## ACC-003 — Breaker V/A/kW/kWh measurement over time

**Traceability:** RFP §2.1.2 p.27 and §2.1.3 p.28.

**Purpose:** demonstrate historical breaker-level electrical measurements through explicit,
commissioned bindings.

**Prerequisites**

- at least one installed breaker with approved active bindings;
- telemetry history enabled;
- source provenance identified.

**Procedure**

1. Select a commissioned breaker.
2. Confirm the binding/source identity expected for that breaker.
3. Observe current telemetry.
4. Open historical view for an accepted window.
5. Verify available Voltage, Current, Power and Energy fields.
6. Confirm Power is presented in kW at the contractual/UI boundary.
7. Confirm Energy is presented in kWh.
8. Compare a sample against the persisted historical/API response.
9. Confirm another breaker does not receive the selected breaker’s data.

**Expected**

- only explicitly bound breaker data is shown;
- values are time-indexed;
- units are correct;
- missing measurements remain unavailable rather than invented.

**Evidence**

- UI capture;
- binding revision reference;
- history/API sample;
- optional Timescale query in controlled evidence store.

---

## ACC-004 — Canonical total QDF Current

**Traceability:** RFP §2.1.2 p.27 and §2.1.3 p.28.

**Purpose:** demonstrate total QDF Current without partial-feed fabrication.

**Procedure**

1. Select the target BDFB/QDF.
2. Confirm expected independent incoming feeds and their commissioned bindings.
3. Confirm all required FIELD feeds are valid/live for a positive test.
4. Observe canonical total Current.
5. Open historical total Current.
6. Record an accepted bucket.
7. For negative validation, make one required input unavailable/stale in a controlled lab or use
   existing certified negative evidence.
8. Confirm total Current becomes unavailable/invalid for incomplete evidence rather than a partial
   sum presented as valid.

**Expected**

- complete verified inputs produce total Current in A;
- incomplete/invalid input set does not produce a valid contractual total.

**Evidence**

- QDF contract/API output;
- feed inventory/binding revision;
- positive and negative observations.

---

## ACC-005 — Canonical total QDF Voltage

**Traceability:** RFP §2.1.3 p.28.

**Purpose:** demonstrate coherent QDF Voltage semantics.

**Procedure**

1. Confirm the BDFB has an approved voltage-tolerance configuration.
2. Confirm expected FIELD voltage feeds for both buses.
3. Observe BUS A and BUS B canonical voltages.
4. Observe TOTAL_VOLTAGE only when both buses are coherent within tolerance.
5. Inspect historical Voltage points.
6. Use an incoherent/missing-feed laboratory case or prior certified evidence to verify fail-closed
   behavior.

**Expected**

- Voltage is not summed;
- coherent buses can produce canonical total Voltage;
- incoherent/incomplete evidence cannot be represented as a valid total.

**Evidence**

- configuration/tolerance reference;
- canonical contract output;
- history sample;
- negative-case evidence.

---

## ACC-006 — Canonical total QDF Power in kW

**Traceability:** RFP §2.1.3 p.28.

**Purpose:** demonstrate contractual total QDF Power and unit boundary.

**Procedure**

1. Confirm complete verified paired Voltage/Current feed inventory.
2. Observe canonical QDF Power.
3. Verify contractual/UI unit is kW.
4. Open historical Power.
5. Open Load Report and confirm its summary uses the same canonical series.
6. Remove/invalidate one required pair in a controlled negative case or cite certified prior evidence.
7. Confirm an incomplete bucket is omitted/unavailable rather than partially summed.

**Expected**

- canonical total Power is expressed in kW;
- Load Report does not implement a different total-power authority;
- incomplete paired evidence cannot pass.

**Evidence**

- `qdf-vipe-v1` response;
- Load Report capture;
- historical sample;
- unit-contract reference.

---

## ACC-007 — Canonical QDF Energy in kWh

**Traceability:** RFP §2.1.3 p.28.

**Purpose:** demonstrate energy over the selected time window.

**Procedure**

1. Select an accepted historical window.
2. Confirm complete FIELD feed inventory and paired V/I historical coverage.
3. Observe QDF Energy points and total for the requested window.
4. Confirm unit is kWh.
5. Confirm cumulative value resets with a different requested window rather than pretending to be a
   lifetime hardware counter.
6. Confirm incomplete buckets are omitted rather than zero-filled.
7. Compare Load Report Energy with the canonical energy output for the same window.

**Expected**

- Energy is a valid kWh measurement over the requested window;
- scope is explicitly WINDOW;
- missing coverage does not become zero consumption.

**Evidence**

- canonical historical contract;
- Load Report capture;
- window/time record.

---

## ACC-008 — Load Report

**Traceability:** RFP §2.1.3 p.28.

**Purpose:** demonstrate an explicit load-report capability rather than treating raw charts as a
report.

**Procedure**

1. From BDFB Overview choose **Open Load Report ↗**.
2. Confirm it opens in the detached Workbench browsing context.
3. Select each supported standard window required by the accepted release.
4. Confirm summary includes canonical QDF Power, Current, Voltage, Energy and contract status/quality.
5. Confirm Power trend uses the canonical QDF Power series.
6. Confirm breaker distribution is clearly separate from QDF total authority.
7. Export CSV.
8. Use Print/PDF and verify the browser print output is readable.
9. Confirm repeated open action reuses/focuses the named Workbench rather than creating uncontrolled
   duplicate windows where supported by the browser.

**Expected**

- explicit load report is available from the web platform;
- report is traceable to canonical QDF data;
- export paths work;
- no alternate V/A/P/E calculation is introduced.

**Evidence**

- report UI capture;
- sanitized CSV;
- optional sanitized PDF;
- API/contract reference.

---

## ACC-009 — Fail-closed quality and unavailable data

**Traceability:** supporting validation for RFP measurement correctness and §2.7 quality.

**Purpose:** prove that missing, stale, unverified or incomplete inputs do not appear as plausible
contractual totals.

**Procedure**

1. Use a controlled test source/environment.
2. Establish a valid complete state and capture baseline.
3. Remove, stale or invalidate one required feed/binding.
4. Query canonical V/A/P/E outputs.
5. Inspect UI/Load Report quality.
6. Restore the source and confirm recovery follows normal freshness/validation rules.

**Expected**

- invalid evidence is visible as invalid/unavailable/omitted according to each contract;
- the application does not silently fabricate valid zero/partial QDF totals.

**Evidence**

- before/after canonical responses;
- UI status;
- event timestamps.

**Caution:** the legacy Modbus block may use a configured missing policy. That policy must be tested
separately and must not be confused with application-level canonical quality.

---

## ACC-010 — Historical persistence and restart

**Traceability:** RFP §2.1.3 measurement “over time”; supporting operability.

**Procedure**

1. Record an accepted breaker/QDF historical sample.
2. Record current latest/UI state.
3. Restart the Site Mapper application according to the acceptance environment procedure.
4. Re-open history.
5. Confirm historical data remains available.
6. Confirm no restart timestamp is used to make an old sample look newly observed.
7. If Modbus is in scope, verify restart/staleness behavior separately.

**Expected**

- persisted history survives application restart;
- source observation time/provenance remains intact.

**Evidence**

- pre/post history responses;
- restart record;
- timestamps.

---

## ACC-011 — QDF/source isolation

**Traceability:** supporting correctness for QDF-2/QDF-4/QDF-5 acceptance.

**Procedure**

1. Identify at least two configured QDFs or isolated lab sources.
2. Publish/observe distinguishable values.
3. Verify topology, history and any commissioned Modbus Unit ID/source mapping.
4. Confirm data from source A does not appear under source B.
5. Confirm breaker identities remain attached to the intended QDF.

**Expected**

- no cross-QDF or cross-source leakage.

**Evidence**

- sanitized source mapping reference;
- API/UI captures for both QDFs;
- optional Modbus read evidence.

---

## ACC-012 — Authorized telemetry access

**Traceability:** supporting operability/security and customer security obligations.

**Procedure**

1. Access telemetry with an authorized account and confirm allowed operation.
2. Attempt the same protected API/surface without valid authorization.
3. Confirm protected read access is denied according to application policy.
4. Confirm no credential or customer secret is exposed in UI/export.

**Expected**

- accepted operator can read;
- unauthenticated/unauthorized access is denied;
- exports do not disclose secrets.

**Evidence**

- sanitized HTTP status/output;
- role/account class, not personal credential.

---

## ACC-013 — Modbus TCP contract for Metasys (laboratory)

**Traceability:** RFP §2.1.2 p.27.

**Purpose:** validate the Site Mapper-owned read-only Modbus publication contract before field
commissioning.

**Procedure**

1. Freeze the approved lab source-to-Unit-ID map and point layout.
2. Start the accepted Modbus sidecar.
3. Use an independent Modbus TCP client.
4. Read a commissioned circuit with FC03.
5. Decode Voltage, Current, Power and Energy as high-word-first IEEE-754 FLOAT32.
6. Confirm units V/A/kW/kWh.
7. Verify at least one low and one high circuit/address boundary.
8. Verify another Unit ID/source is isolated.
9. Verify unsupported function codes are rejected.
10. Verify the configured missing/stale policy.
11. Compare the Modbus tuple with the same accepted Site Mapper telemetry.

**Expected**

- register map and values match the accepted contract;
- no source leakage;
- no write/control path exists in the baseline.

**Evidence**

- register-map revision;
- client read output;
- corresponding Site Mapper value;
- policy/config revision without secrets.

**Boundary:** PASS here certifies laboratory Modbus behavior, not customer Metasys.

---

## ACC-014 — Customer Metasys field integration

**Traceability:** RFP §2.1.2 p.27.

**Prerequisites**

- approved customer OT route/firewall;
- actual BDFB/QDF source mapping;
- customer Metasys integration representative;
- final TCP port/addressing convention and missing-data behavior agreed.

**Procedure**

1. Confirm Site Mapper/Modbus endpoint on the approved OT route.
2. Configure/read the agreed native Metasys points.
3. Verify addressing offset convention.
4. Verify FLOAT32 word/byte order.
5. Compare V/A/kW/kWh for known commissioned circuits.
6. Verify QDF/source isolation.
7. Verify stale/unavailable behavior as seen by Metasys.
8. Verify restart/reconnect behavior.
9. Record customer/integrator observations.

**Expected**

- Metasys reads the commissioned Site Mapper points correctly;
- units and identities agree;
- unavailable-data behavior is explicitly accepted.

**Result before field execution:** BLOCKED/NOT_RUN, never inferred from CI.

---

## ACC-015 — Physical QDF door display

**Traceability:** RFP §2.1.3 p.28.

**Purpose:** track the physical display requirement without pretending Site Mapper implements the
door hardware.

**Procedure**

1. At the physical QDF, identify the display.
2. Read selected load values from the display.
3. Compare timestamp/identity/measurement with the corresponding commissioned system value where
   technically meaningful.
4. Record any documented differences in refresh interval or measurement source.

**Expected**

- required load information is readable at the physical bastidor.

**Boundary:** physical supplier/SAT evidence required.

---

## ACC-016 — Physical QDF capacity and installation boundary

**Traceability:** RFP §2.1.2 pp.26–27.

**Purpose:** prevent software acceptance from being misused as evidence of hardware capacity,
grounding, cabling or installation quality.

**Procedure**

Performed by the responsible electrical/installation party using approved project procedures.

**Expected**

- field record exists for the physical requirement.

**Site Mapper disposition**

- `OUTSIDE_SOFTWARE`;
- reference the controlled field record only;
- do not create a software PASS for 1200 A capacity.

---

## ACC-017 — As-Built configuration and mapping review

**Traceability:** RFP §3.1 p.34 and §5 p.35.

**Procedure**

1. Complete `07-AS-BUILT.md` or the controlled customer equivalent.
2. Verify QDF labels and canonical Device IDs.
3. Verify shelves/frames/panels/breaker positions.
4. Verify actual controller/source identities.
5. Verify approved binding-set revision.
6. Verify production network/Metasys mapping in the controlled copy.
7. Verify any applicable single-line drawing revision.
8. Compare actual deployment against the release configuration.
9. Record discrepancies as punch-list items.

**Expected**

- documentation represents the installed system;
- no hidden mapping discrepancy remains.

**Evidence**

- sanitized As-Built summary in repo;
- controlled private As-Built reference for confidential details.

---

## ACC-018 — Final operability and handoff review

**Traceability:** RFP §2.7, §3.1 and §5.

**Procedure**

1. Review the compliance matrix.
2. Confirm no software FAIL remains.
3. Review all BLOCKED/field items and their owner.
4. Confirm all PASS rows have evidence.
5. Review known limitations.
6. Confirm release identity.
7. Confirm Technical Dossier is current.
8. Confirm As-Built status.
9. Confirm installation observation/punch list status.
10. Complete the Operability Certificate with the exact certified boundary.
11. Record training/warranty/field-document references where applicable.
12. Obtain required project/customer approvals.

**Expected**

- the handoff states exactly what is operational, what was tested and what remains open;
- no field requirement is silently converted into a software PASS.
