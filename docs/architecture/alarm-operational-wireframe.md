# Site Mapper MK1 — Alarm Operational Wireframe and Interaction

**Status:** approved Part 4 implementation baseline, 2026-10-30.

**Depends on:**

- [Alarm Domain and State Machines](alarm-domain-and-state-machine.md)
- [Alarm UI Placement and Presentation](alarm-ui-placement.md)

This document freezes the operational interaction approved after visual validation against the real seed-01 Site Mapper screens. Synthetic laboratory alarm values are not field evidence.

---

## 1. Governing interaction

Operator navigation is top-down, alarm visibility is bottom-up, and alarm ownership remains at the real target.

QDF → BDFB → Chassis → Shelf → Frame → Panel → Breaker.

For a breaker-targeted alarm, the Breaker owns the AlarmOccurrence; Panel, Frame, Shelf, Chassis, BDFB, QDF and Global surfaces only render roll-ups of the same occurrence.

## 2. Global header and Home

The application header exposes a persistent alarm entry beside Search / Help / Explore. It shows active count, highest severity, compact Critical/Warning/Info counts when space allows, direct navigation to Alarm Center, and an explicit unavailable state. It must never cover Search.

Home gains an Active alarms section after the top operational counters. Each row shows alarm name, severity/confidence, canonical target path, and Go to target. Home supports both View all alarms → Alarm Center and Go to target → affected Equipment/breaker.

Alarm status unavailable is not equivalent to No active alarms.

## 3. Alarm Center

Default mode is ACTIVE, ordered by severity and opening time. Columns: Severity, Alarm, Target path, Since, ACK, Confidence and Actions. Actions include Open detail and Go to target. Resolved occurrences remain accessible but leave every active roll-up.

## 4. Topology tree and hierarchy

Every canonical ancestor of an active target receives a compact alarm badge. Siblings without active descendant alarms remain unmarked. Counts are deduplicated by AlarmOccurrence.id.

At each structural level the UI answers: Which immediate child contains the problem?

Structural Chassis, Shelf, Frame and Panel show active count, severity counts, direct-vs-descendant distinction and affected immediate children. They do not acquire V/A/W/kWh merely because a descendant breaker is monitored.

## 5. BDFB Physical View

The existing physical layout remains. Alarm state is overlaid rather than replacing it.

- Panel cards show descendant alarm counts and highest severity.
- P01..P24 positions receive compact warning/critical markers when their breaker owns alarms.
- Installed-circuit rows keep observation state separate from alarm state.
- LIVE is not equivalent to healthy.
- Empty positions remain neutral.

## 6. Inspector

BDFB and Equipment inspectors gain a first-class Alarms tab. It displays direct alarms, descendant alarms and affected immediate children. Telemetry and alarm state remain separate concepts.

## 7. Breaker and Alarm Detail

A breaker with a direct alarm shows alarm name, severity, lifecycle, confidence, acknowledgement, accepted measurements when available, source/point identity and a direct Alarm Detail link.

Alarm Detail is a full operational page with target path, evidence, event timeline, acknowledgement and occurrence/correlation/rule metadata. Evidence may reference MQTT, SNMP, watchdog, derived and operator records.

Stale/lost telemetry keeps last-known values with age; it is never rewritten to electrical zero.

## 8. Acknowledgement

ACK means the operator has seen the alarm. ACK does not resolve the physical condition. ACTIVE + ACKNOWLEDGED is a valid state. Automatic alarms resolve only through their recovery policy/evidence.

## 9. Deep-link behavior

Investigative route: Home → QDF → BDFB → Chassis → Shelf → Frame → Panel → Breaker.

Direct response route: Home alarm → target, or Alarm Center → target.

A direct target jump preserves canonical hierarchy through breadcrumb/context navigation.

## 10. Persistence and API

Operational records are persisted in alarm_policies, alarm_occurrences and alarm_transitions.

Core APIs:

- GET /api/alarms
- GET /api/alarms/:id
- POST /api/alarms/:id/ack

The active correlation identity is targetId + alarmCode + sourceContext. Repeated evaluation updates one active occurrence. After resolution, a later recurrence creates a new occurrence.

## 11. Commissioned alarm policies

Electrical and freshness thresholds are not production constants. An explicit enabled AlarmPolicy may commission telemetry-loss timeout/recovery, low-voltage assert/clear/debounce, overcurrent assert/clear/debounce, and power-loss voltage/current criteria/recovery. No policy means no automatic threshold diagnosis for that target.

Laboratory timing or values must never silently become field policy.

## 12. Telemetry evaluator

The telemetry runtime evaluates only explicit enabled policies. Accepted point-level telemetry can drive LOW_VOLTAGE, OVERCURRENT and POWER_LOSS. A watchdog can drive TELEMETRY_LOSS.

Missing telemetry alone never asserts POWER_LOSS. A telemetry-derived POWER_LOSS begins SUSPECTED unless independent commissioned evidence promotes confidence.

## 13. Seed-01 visual fixture

For UI acceptance only, the repository contains a reversible seed-01 design fixture:

- P03 → TELEMETRY_LOSS · WARNING
- P04 → POWER_LOSS · CRITICAL · CONFIRMED

The fixture marker is LAB_UI_DESIGN_FIXTURE_2026_10_30. Its evidence is synthetic and must never be cited as field evidence.

Apply with Docker only:

    docker exec -i -e SITEMAPPER_ALARM_DEMO_ACK=LAB_ONLY \
      site-mapper-seed-01-mongodb-1 mongosh --quiet seed-01 \
      < scripts/telemetry/seed-01-alarm-ui-fixture.mongosh.js

Clear it:

    docker exec -i \
      -e SITEMAPPER_ALARM_DEMO_ACK=LAB_ONLY \
      -e SITEMAPPER_ALARM_DEMO_MODE=clear \
      site-mapper-seed-01-mongodb-1 mongosh --quiet seed-01 \
      < scripts/telemetry/seed-01-alarm-ui-fixture.mongosh.js

## 14. RBAC

STANDARD receives alarms:read. ADMIN and SUPERADMIN receive alarms:read plus alarms:ack. Alarm resolution remains rule-driven.

## 15. Industrial publication invariant

The UI does not allocate Modbus addresses. A commissioned alarm intended for Metasys uses a stable logical publication identity, never an occurrence UUID. Logical values remain ALARM_STATE, ALARM_ACK, ALARM_SEVERITY, ALARM_CONFIDENCE and QUALITY. Exact addresses remain governed by the versioned industrial publication registry; existing legacy registers remain untouched.

## 16. Acceptance invariants

- one occurrence, many visible scopes
- target owns the alarm
- ancestors summarize it
- affected child is discoverable at every level
- structural roll-up does not invent telemetry
- LIVE is not equivalent to healthy
- silence is not power loss
- ACK is not resolution
- resolved history is preserved
- direct target navigation preserves hierarchy
- alarm unavailable is not no alarms

Parts 1–4 now form the canonical alarm UX/domain baseline.
