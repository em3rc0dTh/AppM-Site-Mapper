# 7 · First complete operator practice

**Suggested duration:** 25–40 minutes. A beginner should complete a **read-only tour** independently, then optionally perform a **creation exercise** in a separate approved training database.

## Instructor preparation

| Mode                     | Requirements                                               | Risk                                       |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| A. Read-only walk        | STANDARD account, existing topology and sample PowerPath A | No database changes                        |
| B. Creation workshop     | Authorized ADMIN and isolated training database            | Writes test objects                        |
| C. Live telemetry review | Above, plus verified lab publisher/broker                  | Displays real _synthetic_ lab observations |

**Never create or remove a PowerPath on a breaker feeding real equipment for practice.** If there is no approved cabling fixture or mock environment, practice observation only.

## A. Safe walkthrough without changing data

### Scene 1 — “Where am I?”

1. Sign in and locate **EXPLORE**.
2. Navigate Network → Site → Structure → Level → Room.
3. Locate its **Bay**, **Position** and **Rack** in the Room context.
4. Open that Rack and find the target Device.

**Show:** the trainee can name the parent Room/Rack of any Equipment.

### Scene 2 — “What does the Device contain?”

1. Open Device and follow Equipment: Chassis → Shelf → Frame → Panel.
2. On the Panel identify **POSITIONAL · 24 slots**, Position 01 and the installed breaker.
3. Open the breaker Equipment and locate **PHYSICAL TERMINALS**.

**Show:** the trainee distinguishes a Device from Equipment and knows which slots are empty.

### Scene 3 — “What does that port feed?”

1. Select **Power output**.
2. Read **CONNECTED**, **FEEDS → NETWORK BOARD / AP-01-01**, and **Feed A**.
3. Use **VIEW POWERPATH** and **FULL POWER TRACE**.
4. Open the destination board, confirm **POWERED BY ← CB-01**.
5. State explicitly that **Feed B is not recorded**, unless evidence shows otherwise.

**Show:** the trainee can identify both ends and does not confuse a recorded path with verified redundancy.

### Scene 4 — “Is it measuring or only registered?”

1. On the Panel inspect **MQTT POINT COMMISSIONING**.
2. Identify source, raw-point prefix, proposed point and breaker **4/4** bindings.
3. Open the breaker **LIVE TELEMETRY**, read source/timestamp/units.
4. Switch to **24H** and **7D**, explaining that old historical samples do not imply fresh LIVE state.

**Show:** the trainee can distinguish mapping, readings and PowerPaths, and correctly report STALE or NO DATA.

## B. Creation workshop in a separate database

Only proceed after the instructor confirms an isolated, client-data-free database and edit privileges.

1. Create SITE-TRAIN-01 under a training Network; then BUILDING-TRAIN-01, LEVEL-01 and ROOM-TRAIN-01. Draw required boundaries.
2. In Room **Blueprint**, use **EDIT ROOM**, add Bay/Rack and select **SAVE LAYOUT**.
3. In the Rack create an appropriate Device and parent Equipment. Install a **24-slot PANEL** and a **CIRCUIT_BREAKER at Position 01**.
4. Inspect breaker Access Ports. If the fixture includes a load Device with a real compatible POWER INPUT, review its identity.
5. **Do not create a PowerPath** without an approved simulated or physically checked connection. If authorized, follow the Connections chapter.
6. **Do not commission MQTT** without a preapproved publisher identity, raw point and breaker. If authorized, follow the MQTT chapter.
7. Navigate away and back and confirm saved identities and placement. Explain that memory-only demonstration data may disappear when its server stops.

Do not fill the other 23 breaker positions with invented hardware or copy a publisher serial from another Equipment.

## Instructor evaluation checklist

| Skill         | Pass condition                                     |
| ------------- | -------------------------------------------------- |
| Navigation    | Finds Equipment starting from Network/Site/Room    |
| Identity      | Distinguishes Device, Equipment, Panel and breaker |
| Position      | Identifies free/occupied slots accurately          |
| Ports         | Explains OUTPUT, INPUT and BIDIRECTIONAL           |
| Connection    | Finds peer of a CONNECTED port; opens PowerPath    |
| Safety        | Never creates another path on a busy terminal      |
| Commissioning | Explains source, prefix, proposed point and 4/4    |
| Telemetry     | Differentiates LIVE, STALE, UNMAPPED and history   |
| Errors        | Records context without deleting data              |

**Completion:** Mode A is finished unaided. Mode B is only assessed where authorized facilities and a separate training inventory exist.

[Manual contents](manual-maestro.md) · [Visual evidence](evidencia-visual.md).
