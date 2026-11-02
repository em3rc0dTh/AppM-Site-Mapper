# As-Built — Site Mapper / QDF Telemetry

> Template for final installed-state documentation. Customer-confidential values should be completed
> in the controlled project copy. Do not commit production credentials, private IPs, serial numbers
> or sensitive network details to this public repository.

## 1. Document control

| Field | Value |
| --- | --- |
| Project | `<project>` |
| Site | `<site>` |
| As-Built revision | `<revision>` |
| Date | `<date>` |
| Prepared by | `<role/name>` |
| Reviewed by | `<role/name>` |
| Related accepted Site Mapper SHA | `<commit>` |

## 2. Installed QDF inventory

Complete one row per physical QDF.

| Field label | Site Mapper Device ID | Chassis | Installed breaker count | Measurement controller | Status |
| --- | --- | --- | ---: | --- | --- |
| QDF-2 | `<private/control copy>` |  |  |  | PENDING |
| QDF-4 | `<private/control copy>` |  |  |  | PENDING |
| QDF-5 | `<private/control copy>` |  |  |  | PENDING |

The public copy may replace confidential IDs with controlled references.

## 3. Physical composition

For each QDF record:

```text
QDF
└── Chassis
    └── Shelf
        ├── Frame A
        │   ├── Panel A1/A2/A3...
        │   └── breaker positions
        └── Frame B
            ├── Panel B1/B2/B3...
            └── breaker positions
```

Verify that Site Mapper composition matches the installed arrangement.

## 4. Breaker position register

Maintain the authoritative project copy with at least:

| QDF | Frame | Panel | Position | Breaker/equipment label | Destination/load | Binding status | Notes |
| --- | --- | --- | ---: | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

Do not infer a telemetry mapping solely from physical position.

## 5. Measurement-source mapping

Controlled project copy should identify:

| QDF | Controller/gateway | Source identity | Raw point layout | Binding-set revision | Provenance |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  | FIELD |

The source/controller identity must be approved from field evidence; do not guess it from topology.

## 6. Network / BMS handoff

Store confidential network details in the controlled copy.

| Item | Controlled value/reference |
| --- | --- |
| Site Mapper local URL/host |  |
| Customer management switch/port |  |
| Approved OT VLAN/route |  |
| Modbus endpoint |  |
| TCP port |  |
| Source-to-Unit-ID mapping revision |  |
| Metasys addressing convention |  |
| FLOAT32 word order confirmation |  |
| Missing/stale policy |  |
| Metasys commissioning record |  |

## 7. Register-map record

Reference the generated deployment-specific register map and its hash/revision.

Public repository documentation contains only synthetic/lab identities. The production map should
remain controlled if it exposes customer identifiers.

## 8. QDF electrical configuration

Record or reference:

- approved QDF voltage tolerance;
- expected incoming feeds;
- A/B bus association;
- meter/shunt/controller model and firmware where relevant;
- source engineering units;
- any explicit Power source-unit override;
- time synchronization source.

## 9. Door display

For each QDF:

| QDF | Display installed | V readable | A readable | kW readable | kWh readable | Field evidence |
| --- | --- | --- | --- | --- | --- | --- |
| QDF-2 | PENDING |  |  |  |  |  |
| QDF-4 | PENDING |  |  |  |  |  |
| QDF-5 | PENDING |  |  |  |  |  |

This is a physical acceptance item, not automatically a Site Mapper software PASS.

## 10. Single-line / electrical drawing references

List the final controlled drawing numbers/revisions where applicable.

| Drawing | Revision | Date | Status |
| --- | --- | --- | --- |
|  |  |  |  |

## 11. Deviations from design

| Deviation ID | Design expectation | Installed state | Approval/reference | Impact |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Every deviation affecting telemetry identity, units, register allocation or BMS behavior requires
acceptance impact review.

## 12. Punch list

| Item | Owner | Severity | Status | Closure evidence |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

Final project acceptance should not claim “no pending installation details” while this table contains
unresolved applicable items.

## 13. As-Built approval

| Role | Name | Date | Decision/reference |
| --- | --- | --- | --- |
| Installation representative |  |  |  |
| Software/telemetry representative |  |  |  |
| OT/BMS representative |  |  |  |
| Customer/project representative |  |  |  |
