# Site Mapper MK1 — Domain Contract Versions

This directory is the versioned publication history for the Site Mapper MK1 canonical data model.

## Current canonical version

- [v1.2 — Canonical Domain Contract](./v1.2/domain-contract.md) — **CANONICAL**, validated 2026-10-02.\n - [Validation & verification](./v1.2/validation.md)\n - [Visual references](./v1.2/visual-references.md)

## Preserved prior documentation

The repository intentionally keeps earlier domain documentation as historical evidence. Nothing is deleted when a new volume is published.

- [Pre-v1.2 G2 domain contract](../domain-contract.md)
- [Pre-v1.2 domain invariants](../invariants.md)
- [Topology hierarchy](../topology-hierarchy.md)
- [BDFB / Power notes](../bdfb-power.md)
- [CAS specification](../cas-specification.md)

When a prior document contradicts the current canonical contract, the newest explicitly canonical version is authoritative for new implementation work.

## Versioning policy

A new version is published instead of rewriting historical volumes whenever a change affects:

- domain object meaning;
- identity semantics;
- Equipment parent/child semantics;
- AccessPort ownership;
- positional child-capacity semantics;
- rack-placement semantics;
- power-connectivity semantics;
- canonical invariants.

Implementation-specific indexes, optional metadata or storage optimizations do not by themselves require a new domain-contract version.
