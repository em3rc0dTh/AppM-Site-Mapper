# Release Identification — Acceptance Run

> Complete this document for each formal acceptance run or copy it into the controlled run record.
> The template itself does not identify an accepted release.

## 1. Source

| Field             | Value                        |
| ----------------- | ---------------------------- |
| Repository        | `em3rc0dTh/AppM-Site-Mapper` |
| Branch/tag        |                              |
| Exact commit SHA  |                              |
| Release/version   |                              |
| Commit date       |                              |
| Acceptance run ID |                              |

## 2. Build/deployment

| Field                           | Value                                  |
| ------------------------------- | -------------------------------------- |
| Deployment type                 | `local / container / pre-prod / field` |
| Site Mapper image/build ID      |                                        |
| Node/runtime version            |                                        |
| Build timestamp                 |                                        |
| Deployment timestamp            |                                        |
| Configuration profile reference |                                        |

## 3. Dependencies

| Component                | Version / identity |
| ------------------------ | ------------------ |
| MongoDB                  |                    |
| PostgreSQL / TimescaleDB |                    |
| MQTT broker              |                    |
| SNMP collector/profile   |                    |
| Modbus sidecar           |                    |
| Browser                  |                    |
| Operating system         |                    |

## 4. Accepted target

| Field                                     | Value |
| ----------------------------------------- | ----- |
| Customer/site reference                   |       |
| QDF field label                           |       |
| Site Mapper Device ID or controlled alias |       |
| Chassis ID or controlled alias            |       |
| Installed breaker count                   |       |
| Expected incoming feed count              |       |

## 5. Configuration revisions

Record stable references/hashes. Do not paste secrets.

| Configuration                    | Revision/hash/reference |
| -------------------------------- | ----------------------- |
| Topology/inventory               |                         |
| Telemetry binding set            |                         |
| Source/controller profile        |                         |
| QDF voltage tolerance            |                         |
| Modbus source-to-Unit-ID map     |                         |
| Modbus point layout              |                         |
| Missing-data policy              |                         |
| Deployment-specific register map |                         |

## 6. Data provenance

Check one:

- [ ] LAB only
- [ ] FIELD only
- [ ] Mixed, explicitly separated by test case

A FIELD acceptance case must not rely on LAB data unless the test procedure explicitly permits it.

## 7. Integrity statement

Confirm before execution:

- [ ] the running release corresponds to the recorded SHA/build;
- [ ] there are no undocumented local code modifications;
- [ ] private configuration used for the run has a controlled revision;
- [ ] system clocks are sufficiently synchronized for the intended comparisons;
- [ ] evidence storage is ready;
- [ ] known limitations were reviewed.

## 8. Supersession

If a code/configuration change is required during acceptance, close the current run or mark affected
tests invalid, record the new release identity and re-test the impacted scope.

Never overwrite the original release identity to make a failed run appear to have used the corrected
build.
