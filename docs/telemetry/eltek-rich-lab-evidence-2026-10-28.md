# G10 industrial lab acceptance evidence — 2026-10-28

## Gate result

**LAB_PASS** for the isolated, real-service software chain with a synthetic
Eltek-shaped Smartpack2 Touch source. **HardwareCertified = false.**

- CI run: https://github.com/thradexIT/bfdb-telemetry-gateway/actions/runs/40725186452
- BFDB emulator PR: https://github.com/thradexIT/bfdb-telemetry-gateway/pull/11
- Site Mapper integration PR: https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/113
- Execution time of the acceptance receipt: 2026-10-28 16:28:13 UTC.
- Companion Site Mapper revision pinned in the acceptance workflow:
  `f84584768944346461a5ab1ff008e3ae407b0109`.
- BFDB workflow head at acceptance: `a0bdb96400961808ab4e624584563a392c17cb90`.

The workflow builds and starts an isolated Docker stack with three synthetic
SNMPv3 authPriv senders, an authenticated UDP trap/inform receiver, the real
Site Mapper application, MongoDB replica set, TimescaleDB, telemetry-store
and the Site Mapper-owned Modbus TCP server. It runs read-only acceptance
queries and then disposes the named project/volumes. There is no production
controller, external Metasys connection, customer Excel ingestion or private
site data in the emulated traffic.

## Observed receipt, source EMU-SNMP-QDF-01

| Check | Result | Acceptance |
| --- | ---: | --- |
| Requested synthetic source inventory | 5,407 distinct varbind OIDs | Baseline |
| Mongo `industrial_signals` (source + protocol) | 5,436 signals | PASS; includes enrichment/notification and GET observations |
| Distinct private-lab synthetic OIDs in Mongo | 5,392 | PASS |
| Mongo recorded SNMP source events | 523 | PASS |
| Inspected original RAW tuple | `[5389, 4, 0]` | PASS |
| Timescale distinct historical `signal_id` | 5,410 | PASS |
| Distinct Timescale historical signals with `sample.rawValue` | 5,410 | PASS |
| Timescale persisted raw zero observations | 4,732 | PASS |
| Timescale events with voltage RAW = 5389 | 7 | PASS |
| Timescale distinct signals reported UNKNOWN | 5,404 | PASS |
| Modbus Unit 1, FC03, offset 1030 FLOAT32 | 53.88999938964844 V | PASS; synthetic ×0.01 V scale |
| Modbus Unit 1, quality offset 1032 UINT16 | 1 (VALID) | PASS |
| Receiver pending queue | 0 | PASS |
| Receiver queue full / spool failure / too-large | 0 / 0 / 0 | PASS |
| Receiver acknowledged application deliveries (all 3 sources) | 1,569 | PASS |

Counts above are **observed receipt values**, not a promise of exact counts
on every rerun; periodic GET and sequence traps can add observations.
The inventory intentionally contains actual rev54 OID examples for voltage,
current, fuse state, pushbutton observation, and label strings, and a
**separate private lab subtree** for the remaining synthetic load. The
`UNKNOWN` readings are preserved, not assigned fabricated engineering units
or automatically forwarded to the BMS. The `pushbutton(0)` represents a
read-only observation, never an executed SNMP SET.

The existing BDFB holding-register offsets 0–767, four-measurement order and
FC03 contracts were not modified. The acceptance proves a socket client can
read the authorized industrial extension (offset 1030 and its quality word
1032). It **does not** prove that the real Metasys driver has been configured.

## Incident discovered and corrected

Initial isolated acceptance run
https://github.com/thradexIT/bfdb-telemetry-gateway/actions/runs/40722012016
produced `LAB_FAIL`: Modbus sidecar failed on
`EACCES: permission denied, open '/config/points.json'`.
The launcher had mounted a mode-0600 host file into an unprivileged Node
container. Subsequent revisions grant mode 0644 **only** to non-secret
synthetic lab manifests/profiles inside the mode-0700 lab folder. Secrets and
`lab.env` remain mode 0600; no production runtime settings were weakened.

The large opt-in lab also configures a 5,000-packet trap spool and a 2,000
requests/minute authorized per-source ingress quota. Normal production
settings and source-scoped authorization are not changed. The final isolated
workflow verified the lab's file modes, Modbus startup and read-only receipt.

## Field certification remains open

The following have **not** been certified by this laboratory:

1. Real Eltek Smartpack2 Touch firmware/actual emitted traps, MIB version,
   SNMPv3 principals, variable scales, serials, source addressing and wiring.
2. Real Johnson Controls Metasys FC03 client/driver configuration, signed
   point list, offsets/word order, quality mapping, BMS alarms and operator
   acceptance.
3. OT network loss, controller reset, sustained performance SLO,
   production backpressure under partial outages, HA/failover and
   restoration from backed-up volumes.
4. Visual operator inspection in a deployed authenticated browser with
   all synthetic signals loaded (the API/UI implementation is separately
   covered by Site Mapper CI, but the lab receipt is a database and socket
   verification).

Until these gates are executed at the customer's installation, the status is
**SIMULATED END-TO-END LAB ACCEPTED — FIELD NOT CERTIFIED**.

## Reproduction

Use the opt-in commands from
[eltek-rich-lab-acceptance.md](eltek-rich-lab-acceptance.md)
on two compatible checkouts. The laboratory creates and destroys only its
own prefixed Docker project; never use `down -v` against customer stacks.
