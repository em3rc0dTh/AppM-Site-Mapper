# 1 · Create entities and navigate the hierarchy

**Goal:** create correctly located objects and learn why some forms require boundary geometry.

## Before you begin

You need ADMIN/SUPERADMIN, an authorized training environment, and knowledge of the intended **parent object**. Not every type can be created under every parent.

| New object | Open first | UI action |
| --- | --- | --- |
| Network | Network/exploration context | **+ CREATE NETWORK** when offered |
| Site | Its Network | **+ CREATE SITE → Define boundary** |
| Structure | Its Site | **+ CREATE STRUCTURE → Define boundary** |
| Level | Its Structure | **+ CREATE LEVEL** |
| Room | Its Level | **+ CREATE ROOM → Define boundary** |
| Bay, Position, Rack | Room Blueprint | Draw or place on the plan |
| Device | Correct Rack | Rack inventory action |
| Equipment | Device or another Equipment | **+ ADD EQUIPMENT → FROM WAREHOUSE / ONE-OFF** |

### Exercise A: Create a Site

1. Use **EXPLORE → Network** and open the intended Network.
2. Select **+ CREATE SITE**, enter a distinctive training name (e.g. SITE-TRAIN-01).
3. Select **Define boundary**, draw the perimeter and review it.
4. Confirm using **Save Site**.
5. Reopen the Site from the Network tree and confirm its parent/boundary.

**Expected:** both identity and spatial boundary are saved, not just a name.

### Exercise B: Structure, Level and Room

1. In the Site select **+ CREATE STRUCTURE**, name BUILDING-TRAIN-01 and draw its boundary.
2. In the Structure use **+ CREATE LEVEL**, name LEVEL-01.
3. In the Level use **+ CREATE ROOM**, name ROOM-01, and choose Room or Substructure.
4. Use **Define boundary**; the Room must stay within its Structure and must not overlap another Room by area.
5. Select **Save Room**, then navigate away and back to confirm persistence.

~~~mermaid
flowchart TD
  N["Network"] --> S["SITE-TRAIN-01"]
  S --> ST["BUILDING-TRAIN-01"]
  ST --> L["LEVEL-01"]
  L --> R["ROOM-01"]
~~~

## Meaning of important form fields

- **Name:** clear, stable and unambiguous.
- **Device/Equipment type:** domain type compatible with the object's parent.
- **Serial number:** actual unit identity; do not fabricate or borrow publisher serials.
- **Children mode:** DYNAMIC (unordered children) or POSITIONAL (numbered slots).
- **Child capacity:** numbered POSITIONAL capacity, 1–256 in implemented forms.
- **MQTT point prefix:** e.g. 0_1 suggests a point name only; it does not create a verified signal mapping.

## Troubleshooting

| Symptom | Safe action |
| --- | --- |
| No + CREATE control | Check the parent and topology write permission |
| Define boundary required | Draw the polygon before saving |
| Polygon rejected | Inspect containment, self-intersection or overlap |
| CREATE_FAILED_HTTP | Determine whether object was created before retrying |
| Duplicate serial | Check ownership; never alter another device's serial to force a save |

**Do not bypass Room Blueprint by creating racks through manual API calls.**

[Next: Blueprint and racks](espacios-y-racks.md).
