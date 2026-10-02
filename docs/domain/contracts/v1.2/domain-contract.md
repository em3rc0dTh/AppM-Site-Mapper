The requested file reference is not currently visible. Use files.search or files.list to rediscover the file, then retry with a returned ref_id or file_id.

---

# 37. Validation & Verification Record

**Validation status:** VALIDATED  
**Verification status:** VERIFIED AGAINST THE APPROVED v1.2 DOMAIN DECISIONS  
**Verified on:** 2026-10-02

The following decisions are frozen by this version:

- `Holder` is not part of the canonical v1.2 domain.
- Physical composition is direct recursive `Equipment -> Equipment`.
- Root Equipment uses `parentEquipmentId = null`.
- Every non-root Equipment references exactly one immediate parent.
- `children[]` contains immediate children only.
- `DYNAMIC` children contain only installed Equipment IDs and never `null`.
- `POSITIONAL` children use ordered `EquipmentId | null` entries.
- One positional entry may contain at most one Equipment.
- Multi-position child occupancy is intentionally deferred to a future contract revision.
- `AccessPort` is physically owned by Equipment.
- Rack occupation belongs to physical Equipment, not abstract Device identity.
- `PowerPath` connects POWER AccessPorts, never Devices directly.
- Telemetry identity remains external to canonical domain identity.

## Normative validation scenarios

This version is considered internally coherent against these required scenarios:

1. BDFB recursive physical composition.
2. NETWORK_ELEMENT / Switch recursive physical composition.
3. BDFB -> Switch A/B power connectivity.

## Versioning and history

This file is a new versioned volume. Existing domain documentation is intentionally preserved and is not deleted or rewritten by this publication.

The prior repository files remain historical evidence. When an older document contradicts v1.2, this v1.2 contract is authoritative for new implementation work.
