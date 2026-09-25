# G14 — System Certification Matrix

**Status:** READY FOR CI

G14 verifies that independently certified modules operate together without violating the MK1 domain contract.

## Golden path

The certification suite executes:

```text
bootstrap identity
→ authenticate Superadmin
→ authorize topology write
→ Network
→ Site
→ Structure
→ Level
→ Room
→ Bay
→ Position
→ Rack
→ Device + Equipment siblings
→ deep-link reconstruction
→ Room polygon / Blueprint layout
→ CAS reserve
→ CAS equip
→ Rack Elevation
→ pin Device + Equipment
→ configure BDFB
→ create PowerPath A feed
→ ingest normalized telemetry
→ resolve latest telemetry
→ build Workspace snapshot
→ create Standard user
→ verify protected authorization behavior
→ logout / session invalidation
```

## Contract assertions

The certification explicitly proves:

- Device and Equipment have the same Container/Rack parent;
- deep links reconstruct canonical hierarchy;
- Blueprint placement is generated from canonical topology;
- CAS occupancy and Rack Elevation agree;
- BDFB internal hierarchy is independent from rack placement;
- PowerPath references canonical domain identities;
- telemetry resolves by external identity without replacing domain identity;
- Workspace consumes the integrated domain state;
- client-visible role state is not used for authorization;
- logout invalidates the authoritative session.

## Browser physical-flow extension

The G14 domain/system suite is supplemented by the real-browser physical-flow certification in
`tests/e2e/physical-flow.spec.mjs`.

That certification exercises the visible Site → Structure → Level → Room → Bay → Position → Rack →
Device/BDFB → Breaker journey, modal keyboard containment, realtime updates while the modal remains
open, synthetic history ranges, deep-link recovery and the current viewport matrix.

The desktop matrix includes 1920×1080, 1440×900, 1366×768, 1280×720 and 1100×800; narrow fallback is
also exercised at 390×844. For the current 24-position panel contract, desktop evidence requires all
24 positions to remain visible without an internal BDFB scrollbar.

## Exclusions

CI certification does not prove:

- physical field hardware;
- production MongoDB credentials/connectivity;
- production MQTT broker behavior;
- production-scale load;
- execution of a customer-data migration.

Those require environment-specific operational evidence and are not silently claimed.
