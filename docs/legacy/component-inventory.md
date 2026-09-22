# Legacy Component Inventory

Status: G1 evidence. Sizes and symbols refer to frozen legacy commit `22c7b8c495a026e34732fe0b7e3848b8c37e84c7`.

## Spatial workspace

### `components/room/room-dashboard.tsx`

- Blob: `83ba6bdd6156cc834813705045968d691d7128e0`
- Approximate size: 700 lines / 35 KB
- Observed responsibilities: room geometry, polygon tests, grid construction, snapping, SVG coordinate conversion, zoom/drag interaction, rack rendering, empty-slot rendering and edit actions.
- MK1 classification: ALGORITHM + UX + LEGACY orchestration.
- Migration rule: extract spatial behavior; do not port the monolithic React component.

## Rack elevation

### `components/container/rack-elevation.tsx`

- Blob: `575ca7cfbb4062a324f77127c2d6fe8e94ae92ef`
- Approximate size: 161 lines / 10 KB
- Observed responsibilities: visual U-slot rendering, CAS block percentages, physical device size and clearance representation.
- MK1 classification: UX + DOMAIN evidence.

## CAS

### `lib/actions/cas.ts`

- Blob: `c164352dced4dbf81db8cd5d6ddafde9cdc6c3dc`
- Approximate size: 474 lines / 16 KB
- Exports include `getCASByContainerId`, `addCAS`, `updateCAS`, `deleteCAS`, `splitCAS`, `freeCAS` and `mountDeviceInCAS`.
- MK1 classification: ALGORITHM + DOMAIN, with legacy persistence coupling to remove.

## Power path

### `components/device/power-path-overlay.tsx`

- Blob: `25d03b2cfbfec374b4cff3495bf00d4edfb89c65`
- Approximate size: 224 lines / 10 KB
- Observed responsibilities: visualization of a source breaker/panel/device relationship toward target equipment.
- MK1 classification: CONCEPT + UX.

## Telemetry client

### `lib/MqttContext.tsx`

- Blob: `0576a2b16df50d48843eee6301ad0dd352897fc6`
- Approximate size: 87 lines / 2 KB
- Observed responsibilities: browser `EventSource` lifecycle and latest-data aggregation.
- MK1 classification: CONCEPT. Transport and trust boundary are reimplemented.

## Data access

### `lib/data-service.ts`

- Blob: `5d97e54f049d344f200f6fa674af13612f8db4c6`
- Approximate size: 564 lines / 21 KB
- Observed responsibilities: topology reads, navigation tree, device reads, pinned devices and manual parent traversal.
- MK1 classification: product-query evidence + LEGACY persistence implementation.

### `lib/actions/crud.ts`

- Blob: `7f22e1a2f04b99cb88dc7d7fc8150add9bc923f8`
- Approximate size: 639 lines / 26 KB
- Observed responsibilities: broad create/update/delete behavior plus panel, breaker and provisioning mutations.
- MK1 classification: behavior evidence + LEGACY application boundary.

## Identity and administration

### `lib/actions/users.ts`

- Blob: `b5ed5163986b71f577e2f0b81ef1de99fd6c9aca`
- Approximate size: 492 lines / 16 KB
- Observed responsibilities: session lookup, user CRUD, login, password change, logout and database reset.
- MK1 classification: requirements evidence. Implementation is rejected for migration.

## Reference schema

### `prisma/schema.prisma`

- Blob: `40cbf3496406dc1c1b73931fd09b848c2da59b82`
- Approximate size: 213 lines / 5 KB
- Observed models: Site, Structure, Level, Room, Cluster, Position, Container, Device, Shelf, Frame, Panel, Breaker and User.
- MK1 classification: EVIDENCE only until persistence ADR is accepted.

## Large UI modules requiring decomposition

The repository tree also contains several high-size client surfaces, including the panel popup, device popup and Settings page. Their product behavior must be mined, but their file boundaries are not candidates for direct migration.
