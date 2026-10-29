# Telxius seed-01 synthetic MQTT + SmartPack2 lab

This lab is additive and opt-in. It never converts synthetic identities into field commissioning and never deletes Mongo/Timescale volumes.

## Data contract

### MQTT / Acrel path

Three synthetic publishers:

- `EMU-TELXIUS-QDF-2`
- `EMU-TELXIUS-QDF-4`
- `EMU-TELXIUS-QDF-5`

Each publishes 96 channels using the existing BFDB wire shape:

```text
0_1_1..24 -> A3
0_2_1..24 -> A2
0_3_1..24 -> B3
0_4_1..24 -> B2
```

Each point carries `U1/I1/P1/EP1` for voltage/current/power/energy. The lab commissioning script binds only positions that already contain confirmed Circuit Breaker Equipment.

Current seed-01 expectation:

- QDF-2: 0 mapped breakers
- QDF-4: 12 mapped breakers
- QDF-5: 36 mapped breakers

No Circuit Breaker is created merely to consume telemetry.

### SNMP / SmartPack2 path

Three independent synthetic SmartPack2 agents are polled using SNMP GET. The operational collector forwards raw varbinds to the generic industrial capture endpoint, not the legacy SNMP feed-current endpoint.

The synthetic OID root is:

```text
1.3.6.1.4.1.8072.9999.2026.52
```

It represents observed SmartPack2 semantics from the supplied Telxius walk:

- power system status
- SmartPack2 type
- nominal voltage
- load-current literal
- company/site/model/controller serial text
- fuse alarm inputs in observed order A3, B3, A2, B2, A1, B1

The numeric OIDs are laboratory-only and are not asserted as real Eltek MIB addresses.

## Prerequisite

Use the matching BFDB emulator branch:

```bash
cd ../bfdb-telemetry-gateway
git fetch origin
git switch feat/telxius-seed-01-emulator-2026-10-29
git pull --ff-only
```

The Site Mapper database must already contain `runtime_seed_state._id=seed-01` version 4 or newer.

## Prepare / plan

From AppM-Site-Mapper:

```bash
python3 scripts/telemetry/seed-01-telxius-lab.py --action prepare
python3 scripts/telemetry/seed-01-telxius-lab.py --action plan
```

The launcher derives runtime target IDs from Mongo and writes ignored files below `.runtime/industrial-lab/`.

## Start

```bash
python3 scripts/telemetry/seed-01-telxius-lab.py \
  --action up \
  --ack-lab-only
```

The launcher:

1. applies reversible MQTT lab bindings;
2. stops the historical `EMU-BFDB-01/02/03` publisher and old SNMP lab services without deleting them;
3. recreates Site Mapper with the generated Telxius industrial profiles mounted read-only;
4. starts the Telxius MQTT publisher;
5. starts three SmartPack2 synthetic SNMP agents;
6. starts three operational SNMP GET collectors.

## Observe

```bash
python3 scripts/telemetry/seed-01-telxius-lab.py --action status
python3 scripts/telemetry/seed-01-telxius-lab.py --action logs
```

Expected MQTT identities:

```text
EMU-TELXIUS-QDF-2
EMU-TELXIUS-QDF-4
EMU-TELXIUS-QDF-5
```

Expected SNMP identities:

```text
EMU-SNMP-TELXIUS-QDF-2
EMU-SNMP-TELXIUS-QDF-4
EMU-SNMP-TELXIUS-QDF-5
```

QDF-2 may accept source traffic while exposing zero breaker readings because its final breaker positions remain unconfirmed.

## Stop or retire

Stop services without removing any volume:

```bash
python3 scripts/telemetry/seed-01-telxius-lab.py --action stop
```

Archive only the synthetic MQTT bindings:

```bash
python3 scripts/telemetry/seed-01-telxius-lab.py \
  --action retire \
  --ack-lab-only
```

Never use `docker compose down -v` for this customer seed.
