# Industrial integration — laboratory evidence, 2026-10-23

Scope: branch `feat/site-mapper-work-2026-10-23`, based on Site Mapper main `da7609a`.
Companion: BFDB `apps/snmp-emulator/eltek-traps.mjs`, using net-snmp 3.29.2.
No real electrical device, customer secret or Metasys installation was used.

| Verification                   | Observed result                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eltek input extraction         | Both main rev54 MIB variants: 1,553 objects and 16 notification definitions; input hashes in generated catalog                                                                 |
| Canonical capture and security | Unknown nested fields/types, real zero, partial updates, source mismatch, unsafe JSON, bounds, exact alarm clears, stale/out-of-order samples and message-ID conflicts covered |
| Durable MQTT outbox            | Database failure retains a capture; a new outbox instance replays the same capture ID and acquisition time; queue bound rejects overflow                                       |
| SNMP wire transport            | Actual UDP v1, v2c, v3 SHA/AES authPriv and v2c inform -> authenticated HTTP                                                                                                   |
| SNMP outbox restart            | HTTP 503 retains capture; restart and successful HTTP acceptance remove it                                                                                                     |
| Optional reads                 | Actual GET, GETNEXT and GETBULK round trips preserve varbind OID, type and value; no SET path                                                                                  |
| BFDB notifications             | All 16 rev54 notification OIDs sent over UDP, including binary unknown varbind and explicit OFF scenario                                                                       |
| Mongo transactions             | MongoDB 7.0.28 single-node replica set: 12 concurrent packets, 12 originals, 24 signal-history rows, newest state retained                                                     |
| Conflict rollback              | Changed payload under committed ID rejected; original event and latest value survive                                                                                           |
| Complete wire chain            | Four configured MQTT sources and three SNMP controllers -> actual Site Mapper capture/HTTP routes -> MongoDB -> private projection -> TCP Modbus                               |
| Modbus recovery                | Independent socket client reads engineering FLOAT32 and quality; bridge restart recovers active alarm from durable state; explicit OFF becomes 0 with VALID quality            |
| Legacy Modbus                  | Existing address/layout/source isolation/missing-policy tests continue passing; extension starts at explicit offsets >=1024                                                    |
| Source extension               | A fourth MQTT source works through configuration with stable identities/addresses for previous points                                                                          |

The cross-repository wire chain runs with the actual BFDB companion emitter module supplied through
`BFDB_TRAPS_MODULE`. Normal `npm test` intentionally skips the three Mongo/cross-repository tests
without the explicit laboratory environment. They were separately executed successfully against
an isolated replica set, using Node 22.23.4. Wire tests also run independently through
`npm run test:industrial`; the CI workflow installs its isolated SNMP dependency.

Reproduction commands, limits, API permissions, retention policy and production commissioning
requirements are in [the integration runbook](industrial-integration.md).

Not certified by these tests: real controller firmware/clock behavior, actual source OIDs and
scales, physical sensor-to-inventory associations, field networks/NAT/firewalls, TLS termination,
real Metasys import, browser visual acceptance, hardware power-loss resilience, backup restore
and capacity beyond this laboratory. No larger throughput or unlimited scale is claimed.
