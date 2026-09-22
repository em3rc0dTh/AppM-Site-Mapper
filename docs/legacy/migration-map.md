# Legacy Migration Map

Every legacy artifact is classified before code is moved.

## Classification

- CONCEPT — preserve the validated idea.
- ALGORITHM — isolate, understand, test and port intentionally.
- UX — reproduce validated behavior using MK1 contracts.
- LEGACY — do not migrate into runtime code.

## Initial map

### Blueprint geometry

- **Classification:** ALGORITHM
- **Action:** Extract rules and build pure spatial tests before port.

### room-dashboard UI orchestration

- **Classification:** UX / LEGACY mix
- **Action:** Reconstruct renderer/editor around spatial module.

### CAS operations

- **Classification:** ALGORITHM + DOMAIN
- **Action:** Specify invariants, then port behavior through tests.

### Rack elevation

- **Classification:** UX + DOMAIN
- **Action:** Rebuild against canonical rack state.

### BDFB hierarchy

- **Classification:** CONCEPT + DOMAIN
- **Action:** Formalize aggregate before persistence.

### Panel/breaker popup behavior

- **Classification:** UX + DOMAIN
- **Action:** Split business rules from rendering.

### Power path overlay

- **Classification:** CONCEPT + UX
- **Action:** Formalize graph/path model first.

### Navigation tree

- **Classification:** CONCEPT + UX
- **Action:** Reconstruct from topology queries.

### Mongo collection aliases

- **Classification:** LEGACY
- **Action:** Migration scripts only.

### Generic any CRUD

- **Classification:** LEGACY
- **Action:** Replace with explicit use cases/repositories.

### Cookie-derived authority

- **Classification:** LEGACY
- **Action:** Reject.

### Plaintext password compatibility

- **Classification:** LEGACY
- **Action:** Reject.

### Hardcoded MQTT secrets

- **Classification:** LEGACY
- **Action:** Reject and rotate legacy credentials.

### Historical docs

- **Classification:** EVIDENCE
- **Action:** Reconcile against code/product intent; never assume current truth.
