# Persistence Architecture

## Production

```text
Application use case
    ↓
TopologyRepository
    ↓
MongoTopologyRepository
    ↓
MongoDB
    ↓
topology_nodes
```

## Canonical topology document

Every topology document contains:

- `id`;
- `kind`;
- `parentId`;
- `name`;
- `lifecycle`;
- `createdAt`;
- `updatedAt`;
- optional `legacyId`;
- kind-specific domain state.

Device and Equipment are sibling documents with the same parent Container/Rack ID.

## Aggregate atomicity

CAS remains inside Container/Rack persistence so a rack occupancy update can be committed as part of one aggregate mutation.

BDFB internal structure remains inside Device persistence.

PowerPath is a separate aggregate.

## Index baseline

`topology_nodes`:

- unique `id`;
- parent/lifecycle/name;
- kind/lifecycle;
- sparse serial lookup.

`power_paths`:

- unique `id`;
- source reference;
- target reference.

## Runtime modes

- `APP_PERSISTENCE=mongodb` — production persistence.
- `APP_PERSISTENCE=memory` — test/development adapter only.

Production rejects memory mode.
