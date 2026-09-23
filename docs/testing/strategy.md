# Testing and Certification Strategy

Testing follows architecture and domain invariants rather than relying on UI snapshots.

## Layers

1. **Unit tests** — pure domain behavior such as geometry, CAS, BDFB validation and telemetry normalization.
2. **Integration tests** — application services, repositories/adapters, RBAC and module interactions.
3. **System certification** — one cross-module golden path across the reconstructed product.
4. **Production build** — verifies deployable Next.js compilation.
5. **Dependency audit** — rejects high-severity production dependency advisories.

## CI sequence

```text
install
→ typecheck
→ lint
→ format
→ unit
→ integration
→ system certification
→ build
→ production dependency audit
```

## Golden path

G14 certifies:

```text
Identity/Auth
→ Topology
→ deep links
→ Blueprint
→ CAS
→ Rack Elevation
→ Device/Equipment
→ BDFB
→ PowerPath
→ Telemetry
→ Workspace
→ RBAC negative path
→ logout/session invalidation
```

See `docs/testing/system-certification.md`.

## Truth boundary

Repository CI does not prove production MongoDB/MQTT connectivity, customer-data migration execution, physical hardware integration or production-scale load. Those require operational evidence.
