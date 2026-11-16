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

## Exclusions

CI certification does not prove:

- physical field hardware;
- production MongoDB credentials/connectivity;
- production MQTT broker behavior;
- production-scale load;
- execution of a customer-data migration.

Those require environment-specific operational evidence and are not silently claimed.
