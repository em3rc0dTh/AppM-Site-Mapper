# ADR-023 — Optimistic concurrency control for mutable aggregates

- Status: **Accepted**
- Date: 2026-09-25
- Product: **AppManager Site Mapper**

## Context

The production-readiness audit identified a lost-update risk in mutable topology, CAS and power
aggregates. The previous persistence contract used:

```text
read aggregate
-> transform whole document
-> replace by id
```

Two concurrent operators could therefore read the same state and the later replacement could
silently overwrite the earlier committed change.

This affects operational integrity even when every individual domain transformation is valid.

## Decision

Mutable canonical aggregates use optimistic concurrency control.

`DomainEntity.revision` is a monotonic aggregate revision.

Rules:

1. Newly created mutable aggregates start at revision `0`.
2. A command reads the current revision before transforming the aggregate.
3. The write increments the revision by exactly one.
4. The persistence adapter replaces the aggregate only when the stored revision still equals the
   revision read by the command.
5. A failed compare-and-swap is a `CONCURRENCY_CONFLICT`.
6. HTTP mutation APIs expose that condition as `409 Conflict`.
7. Existing documents that predate this ADR and have no `revision` field are treated as revision
   `0` for their first guarded write.

The current guarded mutation surfaces include:

- topology move/archive/restore;
- rack CAS reserve/equip/free;
- room polygon updates;
- inventory pin changes;
- BDFB configuration;
- PowerPath archive.

The same contract applies to future whole-aggregate mutable operations.

## Persistence behavior

### MongoDB

The replace filter contains both canonical ID and expected revision. For the legacy revision-zero
case the filter accepts either `revision: 0` or a missing revision field.

A stale write therefore has `matchedCount = 0` and cannot overwrite the committed aggregate.

### Memory adapter

The in-memory repositories enforce the same compare-and-swap semantics so unit/integration behavior
does not diverge from Mongo persistence.

## API behavior

A concurrency conflict is not:

- `404 Not Found`;
- generic validation failure;
- implicit retry;
- last-write-wins success.

It is returned as HTTP `409`.

Clients may refresh the canonical aggregate and let the operator re-apply the intended action.

## Compatibility

This ADR intentionally avoids a bulk migration requirement for existing MK1 demo/test documents.
The first successful guarded mutation upgrades a missing revision to `1`.

Production migration tooling should nevertheless preserve explicit revisions once present.

## Security and integrity impact

This closes the silent lost-update class identified by the 2026-09-25 repository security audit for
the guarded aggregate mutation paths.

It does **not** close the separate administrative audit atomicity finding.

Mutation + audit persistence still requires the boundary defined by ADR-022:

- one Mongo transaction spanning domain mutation and audit append; or
- a durable administrative outbox written atomically with the mutation and projected to the audit
  ledger.

That work is the next T1 sub-gate and must not be described as closed by this ADR.

## Certification

Required evidence:

- stale topology replacement is rejected;
- stale PowerPath replacement is rejected;
- missing legacy revision is treated as revision zero;
- TypeScript contract prevents unguarded repository replacement calls;
- unit/integration/system suites remain green;
- browser physical-flow certification remains green.

## Consequences

Positive:

- concurrent writers cannot silently clobber a newer aggregate state;
- memory and Mongo adapters share one concurrency contract;
- conflict semantics are explicit at the API boundary;
- existing unversioned records remain upgradeable.

Trade-offs:

- clients can receive HTTP 409 and must refresh/retry at the workflow level;
- multi-aggregate invariants still require a transaction or another explicit coordination mechanism;
- audit atomicity remains a separate requirement.
