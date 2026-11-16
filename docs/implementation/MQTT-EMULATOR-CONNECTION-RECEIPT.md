# BFDB emulator MQTT integration receipt

**Scope:** AppM Site Mapper development commissioning, not customer production.

## Source contract verified

Upstream: `thradexIT/bfdb-telemetry-gateway` on `main` (reviewed
`config/devices.yaml`, `config/emulator.yaml`,
`docs/03-contracts/mqtt-wire-contract.md`).

- Topics: `data/dev/EMU-BFDB-01`, `-02`, `-03`
- Three BFDBs, four synthetic panel groups `A1,A2,B1,B2`, 24 points per
  group; 96 points per source, 288 breaker bindings total.
- Message envelope: `msgid`, `method:update`, `sn`, `timestamp`,
  `sendtime`, `version`, `reported`.
- `reported` point IDs follow `0_<panelIndex>_<position>`; fields
  `state,U1,I1,P1,EP1` are normalized, with numeric strings and partial
  batches preserved. No implication that the synthetic panel group numbers
  prove actual gateway hardware wiring.

## Implemented and checked

- `npm run local:emulator` is opt-in; existing ZIP visual-only launcher
  `npm run local:dev` remains unchanged.
- Three synthetic, explicitly unsurveyed BFDB devices are seeded into a
  separate memory-only lab network, not real customer inventory.
- Each lab device has four explicit 24-point panels; virtual fixture IDs are
  distinct from telemetry `rawPointId` and customer breaker identity.
- The MQTT subscriber reports connected only after MQTT SUBACK and has
  automatic bounded exponential reconnection.
- Authenticated `/api/telemetry/diagnostics` provides actual broker
  subscription, accepted/rejected counts, received point coverage, 96-breaker
  binding coverage and data freshness for each of three sources.
- Launcher refuses to claim success until all three serials each have 96
  accepted raw points, 96 mapped breakers, no unmapped points and fresh data.
- Real-broker GitHub workflow `BFDB MQTT transport integration` verified
  actual Mosquitto MQTT publishing/subscription and all 288 accepted breakers
  using **upstream-compatible synthetic fixture messages**. It does not use
  the user's own currently running emulator process or assert external network
  reachability.

## Still subject to user-local verification

Run the user's actual `thradexIT/bfdb-telemetry-gateway` emulator and broker
and start `npm run local:emulator` from the Site Mapper computer. The
launcher/diagnostic output is the acceptance evidence for the **actual**
local endpoint. A temporary Pinggy endpoint is not a stable deployment
address, and the broker credentials must remain in untracked local runtime
configuration.

This integration does not provision production physical racks, real wiring
assignments, TimescaleDB historical persistence inside Site Mapper or
production secure transport. Those boundaries remain separately governed.
