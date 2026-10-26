# Visual learning material and training plan · Site Mapper MK1

**Purpose:** create an operator manual whose steps are backed by real, versioned screenshots rather than decorative mockups.

## Screenshot catalogue needed for a fully illustrated guide

| Phase                  | Evidence needed                                                                   |
| ---------------------- | --------------------------------------------------------------------------------- |
| Login                  | Email/Password, Sign in, error state, forced password change, return to Workspace |
| Users                  | SUPERADMIN-only Users view, Add user, role selection, ACTIVE/ARCHIVED             |
| Explore                | Network/Site/Structure/Level/Room tree, breadcrumb, parent location               |
| Spatial objects        | Create Site/Structure/Room, Define boundary, save and validation                  |
| Blueprint              | EDIT ROOM, Bay, Position, Place Rack, SAVE LAYOUT, reopened layout                |
| Rack/CAS               | Elevation, available U, reservation, mount and saved allocation                   |
| Device/Equipment       | Creation, composition, PANEL 24 slots, breaker installed in Position 01           |
| Access Ports/PowerPath | Free/CONNECTED, source and destination, confirmation, recorded path and trace     |
| MQTT commissioning     | Source, raw point, proof checkbox, 0/4 and 4/4 states, conflicts                  |
| Telemetry              | LIVE, STALE, NO DATA, 24H/7D, separate SNMP A/B and MQTT history                  |
| Modbus                 | Read-only FC03 verification and quality handling in laboratory                    |
| Data model             | Sanitized authorized, read-only example of object relationships                   |

The actual state of evidence is kept in **Visual evidence status**, not inferred from a screenshot filename or from a code change.

### Screenshot production rules

1. Use an authorized environment, distinguish **LAB**, **acceptance** and **FIELD**.
2. Record the UI version/commit, route, role, object context and capture date.
3. Blur or replace passwords, session tokens, customer names, serials and private topology.
4. Annotate the **actual button** and the relevant previous/next state; do not invent controls.
5. Capture both a successful operation **and** meaningful error states without presenting an error as success.
6. Check legibility on laptop and mobile. Avoid cropped fields, unreadable labels and tooltips obscuring the action.
7. Keep screenshots in the reviewed documentation only when publishing them has been authorized.

## Suggested teaching kit

- **Instructor script:** goal, preconditions, safe sample dataset, expected output, common failure and stopping conditions.
- **Read-only participant exercise:** locate Room → Rack → Device → Equipment, inspect ports, PowerPath and telemetry.
- **Creation workshop:** isolated database, ADMIN account and explicit supervision. Never use real occupied ports.
- **Operator checklist:** show identity, location, placement, registered path, mapping, freshness and history.
- **Incident template:** screen, object, source, time, expected value, displayed state, screenshot without secrets.

The instructor should ask students what each state **proves** and what it **does not prove**. A visually convincing PowerPath is not measured voltage; a 4/4 mapping is not a fresh MQTT packet; an SNMP LAB reading is not a verified field shunt.

## Current status

The Help Center contains textual instructions and safe Mermaid source diagrams, but a number of required real captures remain **PENDING**. In-app diagrams currently appear as accessible source text; the full illustrated, independently accepted manual needs a separate real UI capture review.

**Approval criteria:** a first-time user completes the read-only journey without developer guidance, identifies every intended button accurately, and can explain why they must stop if a required authorization or evidence is absent.

[Visual evidence status](evidencia-visual.md) · [Guided practice](practica-guiada.md).
