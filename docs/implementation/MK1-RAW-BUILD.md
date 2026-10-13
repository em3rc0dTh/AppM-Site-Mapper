# MK1 raw build — 2026-09-29

Base: main at 76c582e8b3abf677811c130fe066667972f2fde8.
Working branch: feat/mk1-raw-build. No merge or deployment authorized by this pass.

Authority: user-supplied MK1 formal specification v1.0 and raw materialization directive, followed by the reconstruction contract. The repository is populated, so preserve existing application/domain/repository behavior and implement missing screen integration rather than re-bootstrap it.

Scope: screens 00–16; shared shell; contextual navigation; search; room drafting; rack and device focus; CAS controls; power tracing; telemetry lens; operations and settings.

Execution: checkpoints approximately every five minutes during active editing, only for changes; no force push, secrets or production data. No automated test suites, test fixtures, QA report or certification in this pass. Compiler/build feedback is allowed. Existing tests are preserved. A successful build does not seal a gate.

Visual source: 19 embedded references in the supplied DOCX, inspected locally. Reference example names/measurements are not production facts.

Existing canonical persistence discriminators remain stable in this pass. ROOM_SUBSTRUCTURE, CONTAINER_CLUSTER_BAY and CONTAINER_RACK are single discriminators, not parallel collections. UI vocabulary uses Room, Cluster and Rack. Full discriminator simplification requires a separately controlled migration; changing stored data silently is outside this build.

Physical frames can be hidden using the existing presentation contract; their stable identity continues to resolve power endpoints. Mongo remains the durable storage adapter; memory is explicitly development-only. Real telemetry requires runtime broker configuration and canonical source mapping.
