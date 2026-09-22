# G3 — Persistence Contract Receipt

**Status:** READY FOR CI / REVIEW

## Delivered

- MongoDB selected as the sole production persistence technology.
- Official MongoDB driver locked reproducibly.
- Explicit TopologyRepository contract.
- MongoDB repository adapter.
- In-memory test adapter under the same contract.
- Canonical `topology_nodes` aggregate model.
- CAS embedded in Container/Rack.
- BDFB internals embedded in Device.
- PowerPath separated as its own aggregate.
- Baseline production indexes.
- Repository contract integration tests.
- UUID identity unit test.

## Rejected legacy behavior

- Prisma/runtime dual authority;
- PascalCase/lowercase collection aliases;
- generic collection dispatch;
- direct persistence from presentation code.

## Gate verdict

PASS requires the final branch to pass the complete CI pipeline after the bootstrap workflow is removed.
