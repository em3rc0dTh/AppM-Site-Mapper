# MK1 main stabilization — 2026-10-15

## Objective and decision

Stabilize and document the **existing, working** Site Mapper MK1 main software baseline before any bulk provisioning of additional BFDB breakers. The certification target is the user's existing independently created CB-01 Equipment, not a cloned demo topology.

**No MongoDB migration, topology replacement, breaker auto-binding, source serial reassignment, deployment secret, broker credential, or external BFDB gateway code belongs in this change.**

## Locally observed acceptance evidence (supplied by the lab operator)

- Existing `PANEL-01`, publisher serial `EMU-BFDB-01`, declared prefix `0_1`, 24 positional slots; installed canonical CB-01 at position 1.
- Existing four ACTIVE metric bindings (`VOLTAGE`, `CURRENT`, `POWER`, `ENERGY`) on source `EMU-BFDB-01`, point `0_1_1`, CB-01 Equipment ID.
- MQTT diagnostics: subscribed, 156 of 156 accepted source packets at one observation, zero rejects.
- `GET /api/telemetry/entity?...&window=LIVE`: `status=LIVE`, all four electrical fields with matching source/point and receive timestamp.
- `GET /api/telemetry/entity?...&window=24h`: historical Equipment readings returned. The `24H` spelling is invalid by contract.
- Site Mapper TimescaleDB observation: **44** Equipment history rows and **35** normalized electrical rows for the same breaker. Counts are snapshots, not fixed thresholds.
- Rebuild of `modbus-tcp` and `site-mapper` containers completed successfully.
- Read-only `scripts/operations/certify-modbus-cb01.mjs`: **`MODBUS_CERT_PASS`**, `EMU-BFDB-01` Unit ID 1, `0_1_1` circuit 1, register address 0, IEEE-754 FLOAT32 for all four metrics, exact match against recent same-breaker TimescaleDB data.

These observations validate one **synthetic laboratory** circuit end-to-end. They do **not** certify the next 23 breakers, all 96 per BFDB, all three publishers, field wiring, customer network, or Metasys.

## Repository hardening changes for this consolidation

1. Replace stale environment guidance that incorrectly implied automatic breaker binding via `panel-order-24`.
2. Document Next.js optimized process mode (`NODE_ENV=production`) separately from explicitly declared deployment environment (`APP_ENV`).
3. Add a reproducible **read-only** MQTT → TimescaleDB → Modbus local runbook, backed by the existing certification script.
4. Update architecture and README to describe **nested canonical Equipment**, explicit bindings, private TimescaleDB and Modbus sidecars, and source ownership boundaries.
5. Run the real FC03 server regression suite and certification-script syntax check in the main CI workflow.
6. Keep the existing `blocks-2x48` server mode for legacy compatibility and the explicit `panels-4x24` Compose mode for this emulator.

## Independent open pull requests — deliberately not included

| PR                                                                                     | State relative to the certified main branch                                                    | Merge gate                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [#36 Room / Rack / BDFB views](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/36)  | substantially behind main; touches same physical UI and BDFB surfaces                          | Rebase/cherry-pick selectively, visual diff and canonical Equipment regression                |
| [#30 G16 telemetry hardening](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/30)   | substantially behind main; PR description explicitly states G16 is **not PASS**                | Complete the declared security, idempotency, outbox, broker ACL and system gates before merge |
| [#29 Spatial Operations Studio](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/29) | substantially behind main; the PR explicitly requires **local visual acceptance before merge** | Perform that acceptance and review overlapping routing/spatial behavior                       |

Historical gate and feature branches are not automatically unmerged work. Do not bulk merge old branches because they exist. Review PRs on their own merits after this baseline is secured.

## Unresolved product/operational gates

- Explicit production security design and credential management; no claim that the ephemeral plain-TCP tunnel is production ready.
- Modbus missing/stale quality: server currently returns zero; do not drive safety control without an approved quality contract.
- Multiple-source and complete 4x24 mapping tests in the **actual customer topology**; current CB-01 proof is not enough for bulk automation.
- Metasys Unit ID, register-base offsets, FLOAT32 word order, OT firewall and external acceptance.
- Persistence recovery and failover (Modbus is current in-memory Latest State).
- Last main commit CI check, release verification and deployment-specific acceptance.

## Safe follow-up

Do not create the remaining 23 breaker bindings until explicit positional evidence has been verified and the stabilized main baseline passes the relevant CI/deployment checks.
