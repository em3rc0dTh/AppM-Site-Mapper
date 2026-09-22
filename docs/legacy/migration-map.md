# Legacy Migration Map

Every legacy artifact is classified before code is moved.

## Classification

- CONCEPT — preserve the validated idea.
- ALGORITHM — isolate, understand, test and port intentionally.
- UX — reproduce validated behavior using MK1 contracts.
- LEGACY — do not migrate into runtime code.

## Initial map

| Legacy area | Classification | Action |
| --- | --- | --- |
| Blueprint geometry | ALGORITHM | Extract rules and build pure spatial tests before port |
| room-dashboard UI orchestration | UX / LEGACY mix | Reconstruct renderer/editor around spatial module |
| CAS operations | ALGORITHM + DOMAIN | Specify invariants, then port behavior through tests |
| Rack elevation | UX + DOMAIN | Rebuild against canonical rack state |
| BDFB hierarchy | CONCEPT + DOMAIN | Formalize aggregate before persistence |
| Panel/breaker popup behavior | UX + DOMAIN | Split business rules from rendering |
| Power path overlay | CONCEPT + UX | Formalize graph/path model first |
| Navigation tree | CONCEPT + UX | Reconstruct from topology queries |
| Mongo collection aliases | LEGACY | Migration scripts only |
| Generic any CRUD | LEGACY | Replace with explicit use cases/repositories |
| Cookie-derived authority | LEGACY | Reject |
| Plaintext password compatibility | LEGACY | Reject |
| Hardcoded MQTT secrets | LEGACY | Reject and rotate legacy credentials |
| Historical docs | EVIDENCE | Reconcile against code/product intent; never assume current truth |
