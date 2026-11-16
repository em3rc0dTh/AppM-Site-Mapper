# BDFB-PHYS-001 — Context-aware rack placement

Status: implementation on feature branch (2026-10-28). Applies exclusively to
canonical `Device.deviceType === 'BDFB'`.

- Room editor auto-creates generic racks **left-to-right** with
  `placementState = AUTO_PROVISIONAL`. There is no BDFB checkbox.
- At the moment a BDFB Device is created or moved into an empty provisional rack,
  the existing layout engine reserves the rightmost free bay location for that
  BDFB, then repacks **other empty provisional racks** left-to-right.
- A normal Device confirms the rack at its existing coordinates without
  changing any other rack. Once a BDFB is placed its rack becomes confirmed.
- Historical/legacy racks lacking the field are treated as confirmed. Manually
  changed dimensions/position anchors are confirmed by the layout save.
  Confirmed racks are never auto-moved or downgraded by a client.
- A provisional rack with an existing child Device cannot be moved. If the bay
  cannot be safely repacked or its geometry fails validation, Device creation
  returns BDFB_PLACEMENT_BLOCKED (HTTP 409) and **no changes are persisted**.
- The preflight plan is geometry-checked and the Device insert, rack/anchor
  coordinate updates and Room version change are saved in one existing
  topology MongoDB transaction, with version/CAS conflict detection.
- All Device, Equipment, CAS, power, SNMP/MQTT, Timescale and immutable
  BFDB/Metasys Modbus register identities remain unchanged.

The logic does **not** certify that a previously surveyed installation is
physically right-anchored. It preserves existing coordinates, and site operators
must reconcile them explicitly. No migration rewrites historical racks.
