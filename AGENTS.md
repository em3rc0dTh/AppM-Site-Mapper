# AppM Site Mapper MK1 — Agent Rules

The binding source of truth is docs/product/MK1-RECONSTRUCTION-CONTRACT.md.

## Non-negotiable rules

1. The legacy repository is evidence, not the architecture.
2. Do not copy legacy code merely because it exists.
3. Classify legacy artifacts as CONCEPT, ALGORITHM, UX or LEGACY before migration.
4. Domain rules must be executable outside React.
5. Browser-controlled identity or role state is never authoritative.
6. Runtime modules must not contain permanent legacy collection aliases.
7. UI code must not call MongoDB directly.
8. MQTT payloads must cross validation and normalization boundaries before reaching the UI.
9. Never commit secrets, customer data, production dumps or real credentials.
10. A feature is not DONE because it renders or builds; tests, documentation and acceptance evidence are required.
11. main means integrated and passing.
12. Do not mark a gate complete until its acceptance criteria have passed.

When documentation and legacy implementation conflict, record the conflict as evidence and resolve it through an explicit MK1 decision or ADR.
