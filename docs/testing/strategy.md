# Testing Strategy

Testing follows the architecture rather than the UI.

## Order of confidence

1. Domain unit tests.
2. Application/service tests.
3. Repository/adapter integration tests.
4. Contract and security tests.
5. End-to-end golden paths.

UI snapshots are not a substitute for domain or authorization tests.

## Gate rule

A module is not complete unless its applicable invariants and acceptance scenarios are executable tests.

G0 currently contains only a minimal unit-test harness. Coverage targets are intentionally deferred until real domain modules exist.
