# Site → Circuit Breaker flow review

Baseline frozen before interface edits: PR #30, `7b1e5d4481ab2ee9c95264dd2b8b4e8eb1db3f91`.
CI `36146124572` and Security `36146124638` succeeded on this SHA, including CodeQL, dependency audit and MQTT TLS/ACL. Full changed-file and check inventory: `site-to-breaker-baseline.json`.

## Actual baseline route/component map

`T(entity)` denotes the ancestor-validated `/topology/{kind-slug}/{id}/…` path built by `TopologyService.buildDeepLink`. Embedded power entities have canonical IDs inside the device aggregate; they do not need invented routes.

| Physical level | Route                         | Main component                                   | Children           | Primary action                                              | Popup/detail action                      |
| -------------- | ----------------------------- | ------------------------------------------------ | ------------------ | ----------------------------------------------------------- | ---------------------------------------- |
| Network        | `/network`, T(network)        | NetworkPage / TopologyVisualStage                | Sites              | Open site                                                   | InspectButton                            |
| Site           | T(site)                       | TopologyNodePage → NetworkSiteCanvas             | Structures         | Open footprint                                              | InspectButton                            |
| Structure      | T(structure)                  | StructureCanvas                                  | Levels             | Tiny floor switcher; prominent room preview skips level     | InspectButton                            |
| Level          | T(level)                      | LevelCanvas                                      | Rooms              | Open room footprint                                         | InspectButton                            |
| Room           | T(room)                       | BlueprintCanvas with polygon; RoomCanvas without | Bays               | Without polygon: bay links; with polygon: bay links missing | Room inspector / Blueprint rack popup    |
| Bay            | T(bay)                        | BayCanvas                                        | Positions          | Open position tile                                          | InspectButton                            |
| Position       | T(position)                   | PositionCanvas                                   | Rack/container     | Open cabinet                                                | InspectButton                            |
| Rack           | `/rack/{id}` AND T(rack)      | RackElevation / generic TopologyVisualStage      | Device/equipment   | Elevation body + inventory link                             | Rack/device EntityInspector              |
| Device/BDFB    | T(device)                     | BdfbChassis                                      | Shelves            | Physical chassis                                            | Device inspector                         |
| Shelf          | embedded in device            | BdfbChassis shelf                                | Frames             | Contained frames/panels                                     | Endpoint includes shelf context          |
| Frame          | embedded in shelf             | ExplicitFrame / ImplicitFrame                    | Panels             | Contained panel                                             | Panel includes frame context             |
| Panel          | embedded                      | PanelBoard                                       | Breaker/Holder     | Select physical row                                         | Panel inspector                          |
| Breaker/Holder | embedded                      | EndpointButton                                   | —                  | Open EntityInspector                                        | Electrical endpoint / Realtime / History |
| Realtime       | `/api/telemetry/stream`       | BdfbChassis EventSource → endpointTelemetry      | Current readings   | Stream updates chassis                                      | Inspector snapshot is stale after open   |
| History        | `/api/telemetry/demo-history` | BreakerHistoryPanel                              | 24H/7D/30D samples | Range/metric selection                                      | Explicit synthetic provenance            |

## Baseline defects confirmed in source

- Later legacy CSS overrides endpoint bands with `min-height: 82px`, a fixed 28px width on every direct span, and card decoration. Shelves/frames have competing fixed minimum heights and nested overflow.
- Legacy inspector rules restore a full-height drawer over centered dialog rules.
- Selected inspector stores rendered telemetry at click time; it cannot update with SSE. Simply deriving new entities would also retrigger the dialog effect, resetting focus/tab on every sample.
- Structure's main room preview skips Level; surveyed Room has no main-content Bay control.
- Rack has two presentation routes; device breadcrumbs return to generic rack instead of elevation. Rack elevation lacks breadcrumbs.
- Rack includes a second internal hierarchy column and unverified ACTIVE/HEALTHY operational claims. Demo telemetry seed associates a device with a rack but leaves every CAS unit AVAILABLE.
- Large permanent inspector and instructional blocks compete with the physical canvas.
- Login drops the requested deep link.

## Information density decisions

| Block                                                                                                    | Class           | Treatment                      |
| -------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------ |
| Physical children, rack elevation, endpoint bands, source status                                         | A: operational  | Primary center area            |
| Breadcrumbs, canonical type, lifecycle, contained count, hierarchy                                       | B: context      | Compact, synchronized controls |
| IDs, provisioning, raw telemetry, historical series, create forms                                        | C: detail       | Modal or disclosure            |
| Duplicate titles, permanent navigation explanations, false bus decoration, empty internal rack hierarchy | D: nonessential | Remove from operating viewport |

## Certification status

Implementation and execution evidence pending. Baseline green checks do not certify subsequent changes. No merge is authorized.
