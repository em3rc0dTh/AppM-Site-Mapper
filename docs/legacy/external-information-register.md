# External Information Register

Status: G1 boundary register.

This file lists information that cannot be safely inferred from the frozen GitHub repository. Unknowns remain unknown until explicit product input, sanitized operational evidence, or an accepted ADR resolves them.

## P0 — Blocks a canonical contract

### Product/domain

- final Room vs Substructure decision;
- final Cluster vs ContainerCluster vs Bay decision;
- final Container vs Rack decision;
- device identity and movement semantics;
- archive/delete policy;
- required read/edit mode semantics.

### Physical/spatial

- canonical coordinate origin;
- row/column naming policy;
- rack U numbering direction;
- accepted rack size catalogue;
- exact collision/overhang rules;
- polygon validity constraints;
- aisle semantics.

### CAS

- authoritative meaning of reserved size versus physical size;
- exact clearance semantics;
- exact split/free remainder behavior;
- move/remove behavior for equipped devices.

### BDFB / power

- supported BDFB variants;
- authoritative A/B feed semantics;
- redundancy validity;
- power-path lifecycle and ownership.

### Identity/security

- final permission matrix for Superadmin/Admin/Standard or replacement roles;
- password policy;
- session lifetime;
- account disable/archive behavior;
- required audit events and retention.

### Persistence/migration

Need sanitized operational evidence, not credentials:

```text
collection name
sanitized representative document
field types
indexes
approximate count
relationship notes
known inconsistencies
```

Also required:

- legacy-ID preservation requirements;
- migration downtime tolerance;
- backup/restore constraints.

### Telemetry

Need sanitized evidence for:

- real topic grammar/examples;
- representative payloads;
- device/serial mapping;
- `reported` semantics;
- expected event frequency;
- offline semantics;
- reconnect expectations;
- history versus realtime-only requirements.

### Deployment

Need:

- intended deployment target;
- MongoDB hosting target;
- runtime secret provider;
- MQTT environment;
- required environments (development/test/staging/production).

## P1 — Required before module certification

- exact Blueprint interaction expectations;
- rack-elevation conventions;
- device/panel popup information hierarchy;
- notification behavior;
- Settings/import/drafting workflows;
- search/filter requirements;
- accessibility expectations;
- supported desktop/mobile/browser matrix.

## P2 — Required before production release

- expected Site/Room/Rack/Device counts;
- concurrent users;
- concurrent telemetry streams;
- MQTT event throughput;
- performance and availability targets;
- log/audit retention;
- backup interval and recovery objectives;
- localization/time-zone/data-retention requirements;
- monitoring and alerting requirements.

## Security rule

Never satisfy an information request by placing production credentials, raw customer topology, private keys, secret values or database dumps in this public repository.

## Closure rule

An item leaves this register only when its resolution is traceable to one of:

- explicit product decision;
- sanitized verified operational evidence;
- accepted ADR;
- accepted domain contract.
