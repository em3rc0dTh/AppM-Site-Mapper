# Legacy Capability Matrix

Status: initial mining pass. This is evidence, not a canonical domain contract.

| Capability | Legacy state | MK1 treatment | Initial acceptance intent |
| --- | --- | --- | --- |
| Hierarchical topology | Implemented | CONCEPT + UX | Navigate Network -> Site -> Structure -> Level -> Room -> Rack -> Device with stable deep links |
| Blueprint / room map | Implemented | ALGORITHM + UX | Preserve 600 mm grid semantics, geometry, placement and collision behavior through a pure spatial engine |
| Rack elevation | Implemented | UX + DOMAIN | Render canonical occupancy from rack/domain state |
| CAS | Implemented | ALGORITHM + DOMAIN | Preserve AVAILABLE / RESERVED / EQUIPPED semantics after G2 validation |
| BDFB hierarchy | Implemented | CONCEPT + DOMAIN | Model Shelf -> Frame -> Panel -> Holder/Breaker independently from popup UI |
| Power path | Implemented | CONCEPT + DOMAIN | Make source/destination/feed relationships explicit and testable |
| Pinned devices | Implemented | UX | Reconstruct against application contracts |
| Global navigation tree | Implemented | CONCEPT + UX | Preserve topology navigation without coupling to legacy collections |
| Breadcrumbs / deep links | Implemented | CONCEPT + UX | Preserve deterministic hierarchy navigation |
| MQTT telemetry | Implemented with security debt | CONCEPT; transport reimplemented | Authenticated, validated and normalized realtime delivery |
| User roles | Implemented with unsafe trust boundary | CONCEPT; implementation rejected | Server-authoritative identity and RBAC |
| Settings / administration | Implemented as monolith | UX + selected capabilities | Split by profile, security, users, import/drafting and dangerous operations |
| Legacy Mongo aliases | Implemented | LEGACY | Migration-only compatibility; never runtime architecture |
| Prisma reference schema | Present but not runtime authority | EVIDENCE | Reassess during persistence ADR; do not carry both models forward |

This matrix will expand during G1 as code, documentation and runtime behavior are reconciled.
