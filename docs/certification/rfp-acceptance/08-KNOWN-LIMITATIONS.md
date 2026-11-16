# Known Limitations and Acceptance Gates

## 1. Purpose

This document prevents engineering evidence from being overstated as field/customer acceptance.

A limitation listed here is not automatically a defect. It identifies a boundary that must be
understood before signing an operability or project-acceptance statement.

## 2. Field acceptance not proven by repository CI

The repository can validate software and controlled laboratory behavior. It cannot independently
prove:

- physical QDF installation quality;
- actual 1200 A electrical capacity;
- grounding/cabling/civil-work compliance;
- physical sensor/shunt calibration;
- final QDF-2/QDF-4/QDF-5 source mapping;
- door-display behavior;
- customer switch/VLAN/firewall configuration;
- production Metasys commissioning;
- actual customer addressing/word-order configuration;
- final electrical As-Built.

These require controlled field evidence.

## 3. Metasys

Site Mapper provides a read-only Modbus TCP path and register-map contract intended for the Metasys
integration.

Current engineering evidence is not equivalent to production Metasys acceptance.

Field closure must confirm:

- approved OT route;
- TCP port;
- Unit IDs;
- 0/1-based addressing convention;
- IEEE-754 word order;
- engineering units;
- polling granularity;
- stale/missing-data behavior;
- restart/reconnect behavior.

## 4. Modbus missing-data semantics

The legacy circuit block supports a deployment policy for missing/stale values.

A backward-compatible zero policy can make unavailable data indistinguishable from a genuine zero
at the BMS boundary. An exception policy is available but changes how a polling request fails.

The final behavior must be agreed with the Metasys integrator and field-tested. This does not change
the fail-closed semantics of the canonical QDF application contract.

## 5. Energy scope

QDF Energy E1 is a historical-window measurement derived from accepted paired V/I coverage.

It is not:

- a perpetual/lifetime accumulator;
- a hardware meter-counter replacement;
- a live Modbus total-energy logical point for the QDF.

The RFP requirement is treated as energy measurement over time. If a future customer interpretation
requires a lifetime totalizer, that is a new requirement and must not be silently inferred into E1.

## 6. Power source-unit commissioning

Canonical internal Power remains W and contractual presentation is kW.

The BFDB source contract supports explicit source-unit configuration. Existing engineering evidence
supports the current W default for the observed BFDB-style payload, but an authoritative hardware
protocol document or field commissioning record should control the final source-unit setting.

Historical data must not be blindly reinterpreted if a source-unit commissioning decision changes.

## 7. Negative power/current convention

Some source payloads may carry signed current/power. Unit conversion preserves sign where
implemented, but acceptance of reverse-flow semantics requires the commissioned device convention
and the canonical QDF-total projector behavior to agree.

Do not claim reverse-flow acceptance without an explicit test case if the field system can operate in
that mode.

## 8. Load Report

The explicit Load Report is implemented for the standard historical windows supported by the
accepted release.

A custom arbitrary `from/to` period is not assumed unless present in the tested release.

Browser Print/PDF is an operator export path; it is not a server-side signed report generator.

## 9. Door display

The RFP includes a physical QDF door-display obligation. Site Mapper does not turn its web UI into
evidence that a physical door display exists.

This remains a supplier/field acceptance item.

## 10. QDF identities and breaker mapping

Synthetic/lab identities and register maps in this repository must not be treated as production
TELXIUS identities.

Final acceptance requires approved field mapping and an As-Built reference.

## 11. Local web deployment

The application supports web access, but a laboratory localhost or development URL does not prove
that the final customer local network path is installed and approved.

Field acceptance must record the final controlled access path without publishing sensitive network
details.

## 12. Confidential evidence

Some valid acceptance evidence may be too sensitive for a public repository.

In that case:

- store the artifact in the controlled project repository;
- record a stable evidence ID/hash/reference here;
- do not weaken the evidence requirement merely because the public repository cannot contain it.

## 13. Acceptance implication

A software/lab PASS may support an Operability Certificate explicitly scoped to software.

It must not be worded as final field operability while applicable items in this document remain
BLOCKED or NOT_RUN.
