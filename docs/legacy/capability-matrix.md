# Legacy Capability Matrix

Status: G1 product-evidence matrix. This is not the canonical domain contract.

| Capability | Legacy state | MK1 class | Preserve | Reimplement | Acceptance direction |
| --- | --- | --- | --- | --- | --- |
| Hierarchical topology | Implemented | CONCEPT + UX | hierarchy/deep navigation behavior | canonical domain and queries | Network -> Site -> Structure -> Level -> Room -> Rack -> Device remains deterministic |
| Breadcrumbs / deep links | Implemented | CONCEPT + UX | contextual navigation | route nouns after G2 | reload/deep-link reconstructs context |
| Global navigation tree | Implemented | CONCEPT + UX | tree workflow | topology query model | tree reflects canonical topology without legacy aliases |
| Blueprint / room map | Implemented | ALGORITHM + UX | 600 mm grid, polygon/spatial behavior | pure spatial engine + renderer | placement/collision can be tested without React |
| Rack placement | Implemented | DOMAIN + UX | physical footprint concepts | canonical placement rules | invalid overlap/capacity states are rejected |
| Rack elevation | Implemented | UX + DOMAIN | U-space visualization | renderer over canonical rack state | render agrees with CAS/device placement |
| CAS | Implemented | ALGORITHM + DOMAIN | AVAILABLE/RESERVED/EQUIPPED and workflows | isolated domain engine/persistence | mount/split/free deterministic and invariant-safe |
| Device inventory | Implemented | CONCEPT + DOMAIN + UX | device identity/specification intent | aggregate/use cases | identity is independent from accidental legacy collection shape |
| BDFB hierarchy | Implemented | CONCEPT + DOMAIN | Shelf/Frame/Panel/Holder/Breaker concepts | explicit device/power domain | creation is not a side effect hidden inside CAS persistence |
| Panel / breaker operations | Implemented | DOMAIN + UX | validated operational behavior | explicit use cases | mutation validates capacity, ownership and permissions |
| Power Path | Implemented | CONCEPT + DOMAIN + UX | source-to-target electrical relationship | explicit graph/path model | paths can be validated independent of overlay UI |
| A/B provisioning | Implemented | CONCEPT + DOMAIN | provisioning concept | canonical semantics | G9 defines valid feed/redundancy state |
| Pinned devices | Implemented | UX | workflow/value | query/application contract | pins survive reload and respect authorization |
| Global notifications | Partially implemented | CONCEPT + UX | operational surface | notification contract | only validated sources generate notifications |
| MQTT telemetry | Implemented with security debt | CONCEPT | server-side broker ingestion + browser-safe realtime fan-out | secrets/auth/topic validation/normalization/lifecycle | unauthorized client cannot open telemetry; payloads are schema-validated |
| Settings | Implemented as monolith | UX + selected capabilities | required admin/product functions | split modules/use cases | profile/security/users/import/drafting/danger are isolated |
| User roles | Implemented with unsafe trust boundary | CONCEPT | role vocabulary as evidence | server-authoritative auth/RBAC | client state cannot grant authority |
| Password flows | Implemented with legacy compatibility | REQUIREMENT evidence | intended login/change/reset workflows as applicable | secure identity implementation | bcrypt-only or accepted modern equivalent; no plaintext fallback |
| JSON/data import | Present | CONCEPT | import need | validated import pipeline | unknown/invalid payload cannot mutate domain |
| Drafting engine | Present in Settings/docs | CONCEPT/UX evidence | workflow if still required | module after product confirmation | remains P1 until behavior is explicitly accepted |
| Legacy Mongo aliases | Implemented | LEGACY | nothing in runtime | migration adapter only | no runtime module knows PascalCase/lowercase alternatives |
| Prisma reference schema | Present, not authoritative | EVIDENCE | field/relationship clues | persistence chosen in G3 | one persistence contract only |
| Generic dynamic CRUD | Implemented | LEGACY | user-visible capabilities only | explicit use cases/repositories | no caller-controlled collection/entity dispatch |
| Cookie-derived authority | Implemented | LEGACY | nothing | secure session | browser-editable values never authorize |
| Hardcoded MQTT secrets | Implemented | LEGACY | nothing | runtime secret config | committed credentials are rotated and never copied |

## Evidence sources

Primary frozen source: `thradexIT/site-mapper@22c7b8c495a026e34732fe0b7e3848b8c37e84c7`.

Supporting evidence is recorded in the G1 files for components, data, domain, spatial, CAS, power, telemetry, identity/security and routes.

## G1 rule

A row saying “Preserve” preserves validated product intent or behavior. It does not authorize copying the legacy implementation.
