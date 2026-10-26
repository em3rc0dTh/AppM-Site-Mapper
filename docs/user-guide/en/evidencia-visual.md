# Visual evidence matrix · Site Mapper MK1 operator manual

**Rule:** a beginner-facing instruction must never rely on “find something similar.” A step needs a screenshot of the **real implemented UI**, showing the current location, the actual control and the resulting state. If no verified image exists, the evidence stays **PENDING**.

## Evidence classifications

- **REAL / VERIFIED:** authentic screenshot of the implemented UI with a confirmed outcome. May document a successful step.
- **REAL / ERROR:** authentic failing state. Useful for troubleshooting but **not** proof of success.
- **PARTIAL:** some screens exist but do not demonstrate the whole interaction.
- **PENDING:** a reviewed capture has not been supplied; **never use a generated mockup** as a substitute.
- **CONCEPTUAL DIAGRAM:** explains an architectural relationship; does not pretend to be a UI capture.
- **ACCEPTANCE LAB:** an observed environment such as an acceptance database; must not be presented as production/field evidence.

## Metadata for every screenshot

1. Stable image ID and screen name.
2. Where the user is: functional route and parent entity.
3. What to select: numbered arrow on the *actual* control.
4. Input entered: fictional, authorized identifiers; passwords hidden.
5. Result: following screen/state and its meaning.
6. Warning: what not to do when control or permission is unavailable.
7. Capture date, product commit/revision, operator role, and approving reviewer.

## Required images by learning stage

| Stage | IDs | States required | Evidence standing |
| --- | --- | --- | --- |
| Login | UI-01–UI-04 | Sign in, Email, Password, safe error | PENDING |
| First sign-in | UI-05–UI-08 | Password change and return to Workspace | PENDING |
| Users | USR-01–USR-08 | Settings Users, Add user, ACTIVE, roles, archive/restore | PENDING |
| Navigation | NAV-01–NAV-04 | Explore tree, parent breadcrumb and back navigation | PARTIAL |
| Spatial creation | ESP-01–ESP-08 | Create Site/Structure/Level/Room, boundary, saved result | PARTIAL (historical errors cannot prove save) |
| Room Blueprint | BP-01–BP-08 | EDIT ROOM, Bay, Position, Place Rack, SAVE LAYOUT and reopen | PENDING |
| Rack/CAS | RACK-01–RACK-06 | Rack Elevation, available/reserved U, mount, result | PENDING |
| Device | DEV-01–DEV-04 | Create Device and verify Rack ownership | PENDING |
| Equipment | EQ-01–EQ-08 | Add Equipment, Warehouse/One-off, Panel slots, breaker | PARTIAL |
| Access Port | AP-01–AP-06 | Free/CONNECTED, port ownership, peer and direction | REAL (limited inspected example) |
| PowerPath | PWR-01–PWR-08 | Source/destination, feed, confirmation, occupied errors, VIEW POWERPATH | REAL (selected limited paths) |
| Power Trace | TRACE-01–TRACE-04 | Path A/B, intermediate Equipment, status | PARTIAL |
| MQTT | MQTT-01–MQTT-06 | Panel commissioning, conflict and 4/4 | PENDING complete set |
| LIVE and history | TEL-01–TEL-06 | LIVE, STALE, 24H/7D and missing history | PARTIAL |
| Data model | DB-01–DB-05 | Sanitized MongoDB Compass model and relationships | REAL acceptance-lab examples |
| End-to-end | FIN-01–FIN-05 | Consecutive steps and autonomous-operator acceptance | PENDING |

These statuses describe evidence known in the October 2026 operator-documentation work; they must be rechecked for each release.

## Additional laboratory observations from 24 October 2026

Some real lab observations demonstrated BDFB-02 and BDFB-03 with four Panels and 96 Circuit Breaker Equipment instances each, in an authorized **synthetic inventory**. Other snapshots showed MQTT 24/24 Panel LIVE, Timescale history and representative Modbus FC03 readings. BDFB-01 had SNMP Config2 A/B synthetic inputs and visible history.

This is **not** confirmation that every expected step in the table has a screenshot, and is **not** a field certification. An SNMP source called LAB LIVE must stay explicitly labeled SIMULATED. BDFB-02/03 additional SNMP commission phases require their own proof before those inputs are called verified in that installation.

### Authentic material already contributed to the project

The existing record includes selected physical editor, Equipment/Access Port, Power Connection and MongoDB Compass acceptance screenshots. Files must be checked for commit/version and secrets before being placed in the public repository. An old error screenshot remains **REAL / ERROR** even if the code was later fixed.

## Evidence card template for one operation

| Field | What to document |
| --- | --- |
| ID | BP-05 or other stable stage number |
| Screen/context | Blueprint of an authorized training Room |
| Role/version | ADMIN and exact commit |
| Before | Empty Position and unsaved draft |
| Action | Highlight **+ Place Rack** and entered training values |
| After | Rack placed, then **SAVE LAYOUT** and reloaded |
| Expected state | Rack still present under the intended Room |
| What it does not prove | PowerPath, mounted Device, field wiring or LIVE telemetry |
| Validator/date | Authorized reviewer and date |

## Publication criteria

- Every screenshot is authentic, legible and sanitized.
- Every key operation shows the true **before → action → after** sequence.
- No screenshot contradicts the current UI or authorized role.
- Unverified controls remain documented as text with a PENDING visual status, never a fabricated image.
- A trainee completes the whole read-only route without developer help.
- The reviewer signs off the current product version separately from old historical lab evidence.

**Until those criteria pass, call this a navigable operator manual with partial visual evidence, not a complete certified illustrated manual.**

[Manual overview](manual-maestro.md) · [Visual teaching plan](capturas-y-capacitacion.md).
