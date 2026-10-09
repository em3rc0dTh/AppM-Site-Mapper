# Site Mapper MK1 — Canonical Domain Contract v1.2

**Status:** CANONICAL  
**Version:** 1.2  
**Effective date:** 2026-10-02  
**Supersedes:** Canonical Domain Contract v1.1  
**Scope:** Site hierarchy, Device identity, recursive Equipment composition, AccessPorts, rack placement, power connectivity and telemetry binding.

---

# 1. Purpose

This document defines the authoritative domain model for Site Mapper MK1.

The contract separates:

```text
spatial hierarchy
operational identity
physical composition
physical placement
physical connectivity
observability
```

The canonical precedence is:

```text
CANONICAL DOMAIN CONTRACT
        ↓
DOMAIN SCHEMAS
        ↓
PERSISTENCE
        ↓
APPLICATION SERVICES
        ↓
APIs
        ↓
UI
        ↓
EXTERNAL ADAPTERS
```

Persistence, UI, MQTT, TAPI, migration tooling or legacy schemas must not redefine the domain.

Visual projection of recursive Equipment is governed separately by
[`Equipment Composition Presentation Contract v1.0`](../../../design/equipment-composition-presentation-contract-v1.0.md).
That presentation contract may control layout density, direction and drill-down behavior, but it
must not alter `parentEquipmentId`, `children[]`, Equipment identity or physical capacity.

---

# 2. Fundamental model

The canonical hierarchy is:

```text
SITE
└── STRUCTURE*
    └── LEVEL*
        └── ROOM*
            └── CLUSTER*
                └── POSITION*
                    └── RACK*
                        │
                        └── DEVICE*
                            [ABSTRACT / OPERATIONAL IDENTITY]
                            │
                            └── ROOT EQUIPMENT*
                                [PHYSICAL ENTITY]
                                │
                                ├── ACCESS_PORT*
                                │
                                └── EQUIPMENT*
                                    │
                                    ├── ACCESS_PORT*
                                    │
                                    └── EQUIPMENT*
                                        └── ...
```

The physical recursion is now:

```text
Equipment
→ Equipment
→ Equipment
→ ...
```

`Holder` is no longer part of the canonical Site Mapper domain.

---

# 3. Core semantic rule

```text
Device
= what managed system is this?

Equipment
= what physically exists?

AccessPort
= where does that Equipment physically connect?

children[]
= what Equipment exists immediately inside this Equipment?
```

Therefore:

```text
Device ≠ Equipment

Equipment parent
    ↓
Equipment child

Equipment
    ↓
AccessPort
```

---

# 4. Site hierarchy

The canonical spatial hierarchy is:

```text
Site
└── Structure
    └── Level
        └── Room
            └── Cluster
                └── Position
                    └── Rack
```

This hierarchy describes the infrastructure context in which managed systems are represented.

---

# 5. Device

`Device` is the **abstract operational identity** of a managed system.

Examples:

```text
NETWORK_ELEMENT
BDFB
SERVER
UPS
RECTIFIER
POWER_SYSTEM
CUSTOM
```

Canonical contract:

```ts
interface Device {
  id: DeviceId;

  name: string;

  type: 'NETWORK_ELEMENT' | 'BDFB' | 'SERVER' | 'UPS' | 'RECTIFIER' | 'POWER_SYSTEM' | 'CUSTOM';

  rootEquipmentIds: EquipmentId[];

  customType?: string;

  attributes?: Record<string, unknown>;

  lifecycle: 'ACTIVE' | 'ARCHIVED';
}
```

`Device` does not physically contain connectors, breakers, boards, chassis or modules.

Those are represented through Equipment.

---

# 6. Root Equipment

Every Device starts its physical inventory through one or more root Equipment.

```text
Device
└── rootEquipmentIds[]
```

A root Equipment has:

```text
parentEquipmentId = null
```

Example:

```text
Device(BDFB)
└── CHASSIS
```

or:

```text
Device(NETWORK_ELEMENT)
└── CHASSIS
```

A Device may have more than one root Equipment when the physical system requires it.

---

# 7. Equipment

`Equipment` is the canonical physical object of Site Mapper.

Canonical contract:

```ts
interface Equipment {
  id: EquipmentId;

  deviceId: DeviceId;

  type: EquipmentType;

  name: string;

  parentEquipmentId: EquipmentId | null;

  childMode: 'DYNAMIC' | 'POSITIONAL';

  children: Array<EquipmentId | null>;

  accessPorts: AccessPort[];

  functions?: EquipmentFunction[];

  manufacturer?: string;
  manufacturerTypeName?: string;
  model?: string;
  serialNumber?: string;

  aliases?: string[];

  rackPlacement?: RackPlacement;

  attributes?: Record<string, unknown>;

  lifecycle: 'ACTIVE' | 'ARCHIVED';
}
```

---

# 8. Equipment recursion

Equipment composition is recursive.

```text
Equipment
├── Equipment
│   ├── Equipment
│   └── Equipment
└── Equipment
```

Every child Equipment stores the ID of its **immediate physical parent**:

```text
child.parentEquipmentId
=
immediateParent.id
```

Example:

```text
CHASSIS
parent = null
│
├── FRAME A
│   parent = CHASSIS
│
│   ├── PANEL A1
│   │   parent = FRAME A
│   │
│   │   └── CIRCUIT_BREAKER
│   │       parent = PANEL A1
│   │
│   └── PANEL A2
│       parent = FRAME A
│
└── FRAME B
    parent = CHASSIS
```

---

# 9. children[]

`children[]` represents **only immediate child Equipment**.

It never contains grandchildren or all descendants.

Example:

```text
CHASSIS
├── FRAME A
│   └── PANEL A1
└── FRAME B
```

then:

```text
CHASSIS.children
=
[
  FRAME_A,
  FRAME_B
]
```

not:

```text
[
  FRAME_A,
  FRAME_B,
  PANEL_A1
]
```

`PANEL_A1` belongs only to:

```text
FRAME_A.children
```

---

# 10. childMode

Equipment supports two child composition modes.

## 10.1 DYNAMIC

`DYNAMIC` means the Equipment does not declare a fixed number of child positions.

Example:

```json
{
  "id": "eq-frame-a",
  "type": "FRAME",
  "childMode": "DYNAMIC",
  "children": ["eq-panel-a1", "eq-panel-a2"]
}
```

Rules:

```text
children.length
=
number of current immediate children
```

`null` values are not valid in `DYNAMIC` mode.

---

## 10.2 POSITIONAL

`POSITIONAL` means the Equipment declares a fixed ordered set of physical child positions.

Example:

```json
{
  "id": "eq-panel-a1",
  "type": "PANEL",
  "childMode": "POSITIONAL",
  "children": [null, null, "eq-breaker-a1-03", null]
}
```

Meaning:

```text
Position 01 → EMPTY
Position 02 → EMPTY
Position 03 → eq-breaker-a1-03
Position 04 → EMPTY
```

In positional mode:

```text
children.length
=
configured physical child capacity
```

No separate `Holder` object is required.

No separate authoritative `childCapacity` field is required.

---

# 11. Frozen positional restriction

This rule is CANONICAL for v1.2:

> **One position in `children[]` may contain at most one Equipment.**

Therefore every positional entry is exactly:

```ts
EquipmentId | null;
```

and never:

```ts
EquipmentId[]
```

or:

```ts
{
  occupants: [...]
}
```

Example:

```text
VALID

children[7]
=
eq-breaker-a1-08
```

```text
VALID

children[7]
=
null
```

```text
INVALID

children[7]
=
[
  eq-a,
  eq-b
]
```

---

# 12. Multi-position Equipment

Site Mapper MK1 v1.2 does **not** introduce a generalized multi-position occupancy model.

If future physical hardware requires a single child Equipment to span:

```text
2 positions
3 positions
N positions
```

the contract may later introduce explicit placement/span metadata.

Possible future concepts could include:

```text
position
span
startPosition
occupiedPositions
```

but they are **not part of v1.2**.

Canonical decision:

> Do not introduce a Holder entity today merely to anticipate a future multi-position requirement.

---

# 13. Leaf Equipment

An Equipment with no descendants is a leaf.

For `DYNAMIC` mode:

```text
children = []
```

means leaf.

Example:

```json
{
  "id": "eq-breaker-a1-08",
  "type": "CIRCUIT_BREAKER",
  "childMode": "DYNAMIC",
  "children": []
}
```

For `POSITIONAL` mode, an Equipment may have configured child capacity while currently having no installed children:

```json
{
  "childMode": "POSITIONAL",
  "children": [null, null, null, null]
}
```

This Equipment is currently unpopulated, but it is **not structurally incapable of children**.

Therefore:

```text
terminal capability
≠
current occupancy
```

A true structural leaf is normally represented with:

```text
childMode = DYNAMIC
children = []
```

unless its physical model explicitly requires otherwise.

---

# 14. Parent / child invariant

For every non-root Equipment:

```text
parent.children
contains child.id
```

and:

```text
child.parentEquipmentId
==
parent.id
```

In `POSITIONAL` mode:

```text
exactly one children[index]
may equal child.id
```

In `DYNAMIC` mode:

```text
child.id
appears exactly once
in parent.children
```

A child Equipment cannot simultaneously have two immediate parents.

## 14.1 Archive / restore invariant

Archive is a lifecycle operation, not an implicit topology mutation.

For nested Equipment:

```text
parentEquipmentId != null
```

the Equipment must first be explicitly detached or moved before it may be archived.

This rule prevents lifecycle operations from hiding physical placement history in generic
`attributes` metadata or silently rewriting positional slots.

For archived root Equipment:

```text
parentEquipmentId = null
parentId = owning Device.id
```

Restore only changes lifecycle back to `ACTIVE`; it does not guess or recreate a previous
Equipment parent or positional slot.

If the Equipment occupies Rack CAS, CAS must be released before archive.

Therefore:

```text
detach / move = physical composition mutation
archive / restore = lifecycle mutation
```

These concerns are intentionally separate.

---

# 15. Equipment types

Canonical vocabulary:

```ts
type EquipmentType =
  | 'CHASSIS'
  | 'SHELF'
  | 'SUB_SHELF'
  | 'FRAME'
  | 'PANEL'
  | 'CIRCUIT_BREAKER'
  | 'POWER_SUPPLY'
  | 'POWER_MODULE'
  | 'CONTROLLER_BOARD'
  | 'NETWORK_BOARD'
  | 'PLUGGABLE_MODULE'
  | 'FAN'
  | 'CUSTOM';
```

`CHASSIS` is common and is not BDFB-specific.

`FRAME` exists only when the represented hardware actually has a Frame.

No artificial physical Equipment should be introduced merely to make a hierarchy look consistent.

---

# 16. Equipment functions

Type and function remain orthogonal.

```ts
type EquipmentFunction =
  'CONTROL' | 'NETWORKING' | 'POWER_CONVERSION' | 'POWER_DISTRIBUTION' | 'PROTECTION' | 'COOLING';
```

Example:

```json
{
  "type": "CONTROLLER_BOARD",
  "functions": ["CONTROL"]
}
```

Another:

```json
{
  "type": "NETWORK_BOARD",
  "functions": ["NETWORKING"]
}
```

---

# 17. BOARD versus CARD

Site Mapper normalizes:

```text
Controller Card
→ CONTROLLER_BOARD

Controller Board
→ CONTROLLER_BOARD

Network Card
→ NETWORK_BOARD

Network Board
→ NETWORK_BOARD
```

Vendor terminology may remain in:

```text
manufacturerTypeName
aliases[]
```

---

# 18. AccessPort

`AccessPort` represents a physical connection point exposed by Equipment.

Canonical relationship:

```text
Equipment
└── AccessPort
```

Never physical containment:

```text
Device
└── AccessPort
```

Contract:

```ts
interface AccessPort {
  id: AccessPortId;

  deviceId: DeviceId;

  equipmentId: EquipmentId;

  name: string;

  portType: 'POWER' | 'NETWORK' | 'CONTROL' | 'DATA' | 'GROUND' | 'CUSTOM';

  direction?: 'INPUT' | 'OUTPUT' | 'BIDIRECTIONAL';

  exposure: 'INTERNAL' | 'EXTERNAL';

  connectorType?: string;

  protocol?: string;

  customType?: string;

  attributes?: Record<string, unknown>;

  lifecycle: 'ACTIVE' | 'ARCHIVED';
}
```

---

# 19. AccessPort ownership

Two relationships exist:

```text
AccessPort.deviceId
=
aggregate ownership
```

```text
AccessPort.equipmentId
=
physical ownership
```

Required invariant:

```text
AccessPort.deviceId
==
Equipment(AccessPort.equipmentId).deviceId
```

The physical parent is always Equipment.

---

# 20. AccessPort semantics

Canonical semantic types:

```text
POWER
NETWORK
CONTROL
DATA
GROUND
CUSTOM
```

Connector form does not determine semantic type.

For example:

```text
NETWORK
connectorType = RJ45
protocol = ETHERNET
```

and:

```text
CONTROL
connectorType = RJ45
protocol = ETHERNET
```

are both valid.

---

# 21. Rack placement

Device is abstract.

Therefore physical Rack occupation belongs to Equipment.

```ts
interface RackPlacement {
  rackId: RackId;

  mode: 'FULL_RACK' | 'U_RANGE';

  startU?: number;

  sizeU?: number;

  clearanceTopU?: number;

  clearanceBottomU?: number;
}
```

---

# 22. FULL_RACK

Example:

```json
{
  "id": "eq-bdfb01-chassis",
  "type": "CHASSIS",

  "rackPlacement": {
    "rackId": "rack-01",
    "mode": "FULL_RACK"
  }
}
```

This means:

```text
that physical Equipment
occupies the complete Rack
```

It does **not** mean:

```text
DeviceType BDFB
always occupies a complete Rack
```

Physical placement depends on:

```text
user configuration
template
manufacturer model
imported configuration
```

---

# 23. U_RANGE

Example:

```json
{
  "id": "eq-sw01-chassis",
  "type": "CHASSIS",

  "rackPlacement": {
    "rackId": "rack-02",
    "mode": "U_RANGE",
    "startU": 20,
    "sizeU": 2
  }
}
```

Other physical Equipment may occupy non-overlapping Rack capacity.

---

# 24. Rack capacity versus Equipment children

These are separate concepts.

```text
RACK CAPACITY
─────────────

Rack
└── RackPlacement
    └── Equipment
```

while:

```text
INTERNAL EQUIPMENT COMPOSITION
──────────────────────────────

Equipment
└── children[]
    └── Equipment
        └── children[]
            └── Equipment
```

Nested Equipment does not independently consume Rack capacity unless that Equipment explicitly receives its own `rackPlacement`.

---

# 25. BDFB canonical composition

Example:

```text
Device(BDFB)
└── CHASSIS
    parent = null
    │
    ├── FRAME A
    │   parent = CHASSIS
    │   │
    │   ├── PANEL A1
    │   │   parent = FRAME A
    │   │   children[24]
    │   │   │
    │   │   ├── [01] CIRCUIT_BREAKER
    │   │   ├── [02] null
    │   │   ├── ...
    │   │   └── [24] CIRCUIT_BREAKER
    │   │
    │   └── PANEL A2
    │
    └── FRAME B
        ├── PANEL B1
        └── PANEL B2
```

Example Panel:

```json
{
  "id": "eq-panel-a1",
  "deviceId": "dev-bdfb-01",

  "type": "PANEL",
  "name": "Panel A1",

  "parentEquipmentId": "eq-frame-a",

  "childMode": "POSITIONAL",

  "children": [
    "eq-breaker-a1-01",
    null,
    null,
    null,
    null,
    null,
    null,
    "eq-breaker-a1-08",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ],

  "accessPorts": []
}
```

The array length is the configured capacity:

```text
24 positions
```

No Holder object is created.

---

# 26. BDFB leaf Equipment

Example breaker:

```json
{
  "id": "eq-breaker-a1-08",
  "deviceId": "dev-bdfb-01",

  "type": "CIRCUIT_BREAKER",
  "name": "A1-08",

  "parentEquipmentId": "eq-panel-a1",

  "childMode": "DYNAMIC",

  "children": [],

  "accessPorts": [
    {
      "id": "ap-bdfb-a1-08-out",

      "deviceId": "dev-bdfb-01",
      "equipmentId": "eq-breaker-a1-08",

      "name": "Output",

      "portType": "POWER",
      "direction": "OUTPUT",
      "exposure": "EXTERNAL",

      "connectorType": "TERMINAL_BLOCK",

      "lifecycle": "ACTIVE"
    }
  ],

  "lifecycle": "ACTIVE"
}
```

---

# 27. Network Element canonical composition

Example:

```text
Device(NETWORK_ELEMENT)
attributes.networkRole = SWITCH

└── CHASSIS
    parent = null
    │
    ├── POWER_SUPPLY A
    │   children = []
    │   └── POWER INPUT
    │
    ├── POWER_SUPPLY B
    │   children = []
    │   └── POWER INPUT
    │
    ├── CONTROLLER_BOARD
    │   children = []
    │   └── CONTROL AccessPort
    │
    └── NETWORK_BOARD
        │
        └── PLUGGABLE_MODULE
            children = []
            └── NETWORK AccessPort
```

Network Board example:

```json
{
  "id": "eq-sw01-network-board",
  "deviceId": "dev-sw-01",

  "type": "NETWORK_BOARD",

  "parentEquipmentId": "eq-sw01-chassis",

  "childMode": "POSITIONAL",

  "children": ["eq-sw01-sfp-01", null, null, null],

  "accessPorts": []
}
```

---

# 28. PowerPath

PowerPath connects physical POWER AccessPorts.

```text
Equipment
└── POWER AccessPort
          │
          │ PowerPath
          ▼
     POWER AccessPort
┌─────────┘
Equipment
```

Never:

```text
Device
→ Device
```

Contract:

```ts
interface PowerPath {
  id: PowerPathId;

  sourceAccessPortId: AccessPortId;

  targetAccessPortId: AccessPortId;

  feed?: 'A' | 'B';

  label?: string;

  attributes?: Record<string, unknown>;

  lifecycle: 'ACTIVE' | 'ARCHIVED';
}
```

Required:

```text
source.portType == POWER
target.portType == POWER
```

Normally:

```text
source.direction == OUTPUT
target.direction == INPUT
```

---

# 29. BDFB → Switch

Feed A:

```text
BDFB
└── PANEL A1
    └── [08] CIRCUIT_BREAKER
        └── POWER OUTPUT
                │
                │ PowerPath A
                ▼
           POWER INPUT
           PSU-A
           SWITCH
```

Feed B:

```text
BDFB
└── PANEL B1
    └── [08] CIRCUIT_BREAKER
        └── POWER OUTPUT
                │
                │ PowerPath B
                ▼
           POWER INPUT
           PSU-B
           SWITCH
```

A and B are independent PowerPaths.

---

# 30. TelemetryBinding

Telemetry identity remains separate from domain identity.

```text
MQTT / MODBUS / SNMP / API
            │
            ▼
    TelemetryBinding
            │
            ▼
Device / Equipment / AccessPort
```

Contract:

```ts
interface TelemetryBinding {
  id: TelemetryBindingId;

  protocol: string;

  sourceIdentity: string;

  sourcePointId?: string;

  metric: string;

  unit?: string;

  targetType: 'DEVICE' | 'EQUIPMENT' | 'ACCESS_PORT';

  targetId: DeviceId | EquipmentId | AccessPortId;

  attributes?: Record<string, unknown>;

  lifecycle: 'ACTIVE' | 'ARCHIVED';
}
```

External telemetry identifiers never become canonical domain IDs.

---

# 31. Canonical normalized entity model

```text
Device
{
  rootEquipmentIds[]
}
```

```text
Equipment
{
  deviceId

  parentEquipmentId

  childMode

  children[]

  accessPorts[]
}
```

```text
AccessPort
{
  deviceId
  equipmentId
}
```

```text
PowerPath
{
  sourceAccessPortId
  targetAccessPortId
}
```

There is no canonical:

```text
Holder
parentHolderId
holderId
ownerEquipmentId
occupyingEquipmentId
```

in Site Mapper MK1 v1.2.

---

# 32. Canonical Assembled Domain View

For API responses, fixtures, UI and digital-twin reconstruction, the graph may be assembled recursively:

```json
{
  "site": {
    "structures": [
      {
        "levels": [
          {
            "rooms": [
              {
                "clusters": [
                  {
                    "positions": [
                      {
                        "racks": [
                          {
                            "devices": [
                              {
                                "equipment": [
                                  {
                                    "children": [
                                      {
                                        "children": []
                                      }
                                    ],
                                    "accessPorts": []
                                  }
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

In this assembled view, the ID-based relationships may be resolved into nested objects.

The normalized model remains authoritative for identity and relationships.

---

# 33. Persistence

This contract does not require MongoDB to store the entire Site as one nested document.

Persistence may use separate collections, embedded structures or a combination.

Potential collections include:

```text
sites
structures
levels
rooms
clusters
positions
racks
devices
equipment
accessPorts
powerPaths
telemetryBindings
```

The persistence strategy is valid only if it can reconstruct the canonical model without semantic loss.

---

# 34. Canonical invariants

1. `Device` is abstract and operational.

2. `Equipment` is physical.

3. `Holder` is not part of the canonical v1.2 domain.

4. Physical Equipment composition is directly recursive: `Equipment → Equipment`.

5. Every Equipment belongs to exactly one Device.

6. Every root Equipment has `parentEquipmentId = null`.

7. Every non-root Equipment has exactly one immediate `parentEquipmentId`.

8. `children[]` contains immediate children only.

9. A child ID must appear exactly once in its immediate parent's `children[]`.

10. A child cannot have two immediate parents.

11. `childMode = DYNAMIC` means `children[]` contains only currently existing children.

12. `DYNAMIC` children arrays do not contain `null`.

13. `childMode = POSITIONAL` means array indexes represent configured physical child positions.

14. In `POSITIONAL` mode, `children.length` is the configured child-position capacity.

15. `null` in a positional array means that position is empty.

16. **One position of `children[]` may contain at most one Equipment.**

17. Multi-position child occupancy is not modeled in v1.2.

18. Future multi-position hardware may introduce placement/span metadata without retroactively requiring Holder.

19. `AccessPort` physically belongs to exactly one Equipment.

20. `AccessPort.deviceId` represents aggregate ownership.

21. `AccessPort.equipmentId` represents physical ownership.

22. `AccessPort.deviceId` must equal the Device of its Equipment.

23. Device does not physically contain AccessPort.

24. Equipment type and Equipment function remain separate.

25. `CHASSIS` is common.

26. `FRAME` exists only where physically modeled.

27. Device type does not determine Rack occupation.

28. Rack occupation is configured on physical Equipment.

29. `FULL_RACK` prevents overlapping directly rack-mounted Equipment.

30. `U_RANGE` consumes its configured Rack region.

31. Nested Equipment does not consume Rack capacity unless independently placed.

32. `PowerPath` connects AccessPort to AccessPort.

33. PowerPath endpoints must be `POWER`.

34. A/B feeds are independent PowerPaths.

35. Telemetry identity never replaces domain identity.

36. The normalized ID graph is authoritative for relationships.

37. The recursively assembled JSON tree is the canonical human/API/domain view.

38. Persistence must reproduce the same semantics.

---

# 35. Final canonical tree

```text
SITE
└── STRUCTURE
    └── LEVEL
        └── ROOM
            └── CLUSTER
                └── POSITION
                    └── RACK
                        │
                        └── DEVICE
                            [ABSTRACT SYSTEM]
                            │
                            └── ROOT EQUIPMENT
                                parentEquipmentId = null
                                │
                                ├── ACCESS_PORT*
                                │
                                └── EQUIPMENT*
                                    parentEquipmentId = parent.id
                                    │
                                    ├── ACCESS_PORT*
                                    │
                                    └── EQUIPMENT*
                                        │
                                        ├── ACCESS_PORT*
                                        │
                                        └── ...
```

For Equipment whose physical child positions are fixed:

```text
EQUIPMENT
childMode = POSITIONAL

children[]
├── [0] Equipment | null
├── [1] Equipment | null
├── [2] Equipment | null
└── ...
```

For Equipment whose children are not capacity-bound:

```text
EQUIPMENT
childMode = DYNAMIC

children[]
├── Equipment
├── Equipment
└── ...
```

---

# 36. Final canonical rule

> **Device identifies the managed system. Equipment represents every relevant physical component of that system. Equipment composition is recursively expressed through `parentEquipmentId` and `children[]`. Fixed physical child positions are represented directly by positional entries in `children[]`; no Holder entity is required. Each position can contain at most one Equipment. AccessPort belongs physically to Equipment. RackPlacement locates physical Equipment. PowerPath connects physical AccessPorts. TelemetryBinding observes the domain without redefining it.**

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

---

# 38. Visual References

The supplied review diagrams are preserved alongside this version:

- [Visual references and v1.2 reconciliation](./visual-references.md)
- [Validation & verification record](./validation.md)

These images document the iteration path. Where they show `Holder` nodes or Device-level physical AccessPort containment, those shapes are superseded by the normative v1.2 rules in this contract.
