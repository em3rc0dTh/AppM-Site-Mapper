# Topology Core

G5 implements the accepted hierarchy as executable application rules.

```text
Network
→ Site
→ Structure
→ Level
→ Room / Substructure
→ ContainerCluster / Bay
→ Position
→ Container / Rack
→ Device | Equipment
```

## Rules

- hierarchy skips are rejected;
- parents must exist and be active;
- one active Container/Rack may occupy a Position;
- Device and Equipment are siblings;
- moving supported entities preserves identity;
- archiving a parent with active children is rejected;
- restore requires an active parent;
- deep links encode and verify the full ancestry chain.

## APIs

- `GET /api/topology`
- `POST /api/topology`
- `GET /api/topology/[id]`
- `PATCH /api/topology/[id]`

Every route enforces server-side RBAC.

## UI

- `/login`
- `/network`
- `/topology/[...path]`

The catch-all deep link validates every parent-child edge before rendering.
