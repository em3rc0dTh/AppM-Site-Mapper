# Site Mapper MK1 — Canonical Domain Contract v1.2

## Validation & Verification Record

**Status:** VALIDATED / VERIFIED  
**Contract:** [domain-contract.md](./domain-contract.md)  
**Version:** 1.2  
**Validated:** 2026-10-02

This record certifies the domain decisions frozen by v1.2. It does not delete or rewrite earlier documentation; previous G2 material remains historical evidence.

## Verification matrix

| Area                       | v1.2 rule                                                        | Status        |
| -------------------------- | ---------------------------------------------------------------- | ------------- |
| Device                     | Abstract / operational identity                                  | VERIFIED      |
| Equipment                  | Physical canonical object                                        | VERIFIED      |
| Composition                | Direct recursive `Equipment -> Equipment`                        | VERIFIED      |
| Holder                     | Not part of canonical v1.2 domain                                | VERIFIED      |
| Root Equipment             | `parentEquipmentId = null`                                       | VERIFIED      |
| Nested Equipment           | Exactly one immediate `parentEquipmentId`                        | VERIFIED      |
| Children                   | Immediate children only                                          | VERIFIED      |
| Dynamic children           | Installed Equipment IDs only; no `null`                          | VERIFIED      |
| Positional children        | Ordered `EquipmentId                                             | null` entries | VERIFIED |
| Position occupancy         | Maximum one Equipment per position                               | VERIFIED      |
| Multi-position child       | Deferred to a future version; no Holder introduced pre-emptively | VERIFIED      |
| AccessPort                 | Physical parent is Equipment                                     | VERIFIED      |
| AccessPort Device relation | Aggregate ownership only                                         | VERIFIED      |
| Rack occupation            | Belongs to physical Equipment through RackPlacement              | VERIFIED      |
| FULL_RACK                  | User/template/model/import decision; not implied by Device type  | VERIFIED      |
| PowerPath                  | POWER AccessPort -> POWER AccessPort                             | VERIFIED      |
| Telemetry                  | External identity bound to canonical domain identity             | VERIFIED      |
| Lifecycle archive          | Nested Equipment must detach before archive; no hidden slot metadata | VERIFIED   |
| Lifecycle restore          | Restore reactivates root Equipment; it does not guess prior slots | VERIFIED      |
| Persistence                | Must reconstruct the canonical domain; does not redefine it      | VERIFIED      |

## Normative fixture scenarios

The contract must support at least these scenarios without exceptions to the ontology:

1. **BDFB** — Device -> Chassis -> Frame -> Panel -> positional Circuit Breaker children -> POWER AccessPorts.
2. **NETWORK_ELEMENT / Switch** — Device -> Chassis -> PSU / Controller Board / Network Board -> Pluggable Module -> AccessPorts.
3. **BDFB -> Switch** — independent A/B PowerPaths from BDFB breaker POWER outputs to Switch PSU POWER inputs.

## Visual source verification

The two supplied diagrams are preserved in this version as review/history references:

- [Device / Equipment System Model — supplied reference](./assets/reference-pre-v1.2-device-equipment.webp)
- [Site Mapper Complete System Model — supplied reference](./assets/reference-pre-v1.2-system-architecture.webp)

They reflect an earlier iteration and therefore contain two shapes superseded by v1.2:

- **Holder** nodes are no longer canonical. Fixed capacity is represented by `childMode = POSITIONAL` and `children: Array<EquipmentId | null>`.
- **Device-level AccessPort** branches are not physical containment. In v1.2 the physical parent of an AccessPort is always Equipment.

The images are intentionally retained rather than deleted because they document the evolution and validation path of the model. The normative authority is the v1.2 contract text and invariants.

## Result

**v1.2 passes domain-contract validation for publication.**
