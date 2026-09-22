# ADR-001 — Canonical Domain Terminology

**Status:** Proposed

## Context

The legacy system contains overlapping terminology including Room/Substructure, Cluster/ContainerCluster/Bay and Container/Rack.

Permanent aliases are prohibited by the MK1 contract.

## Decision required

G2 must choose exactly one canonical term and semantic meaning for every topology entity.

Until that gate is accepted:

- no canonical persistence schema is frozen;
- no compatibility alias enters runtime modules;
- legacy names may appear only in evidence documents;
- route and data findings must record the legacy term exactly as observed.

## Acceptance evidence

The final ADR must map every legacy term to one canonical term or explicitly mark it as deprecated/removed.
