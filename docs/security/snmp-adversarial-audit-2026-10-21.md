# SNMP adversarial security review — 2026-10-21

**System:** AppM-Site-Mapper, authenticated `/api/telemetry/snmp/ingest`, explicit BDFB input-feed commissioning, collector normalization and TimescaleDB latest-observation recovery.  
**Scope:** controlled in-memory and disposable CI environment only. No scans or traffic to Delta equipment, external IP addresses, production SNMP agents, databases, or user environments.  
**Provenance:** [PR #75](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/75).

## First attack pass: findings confirmed on the pre-hardening code

[GitHub Actions baseline run 39640181105](https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/39640181105) demonstrated four failures in five isolated assertions.

| Finding                                      | Demonstrated behavior                                                                             | Consequence                                                                   | Change                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| SNMP-SEC-01: same-timestamp replay           | A later payload with the same `observedAt` and different current was accepted                     | Authenticated feed value integrity could be overwritten                       | Reject `observedAt <= previous observedAt` for the same commissioned OID                                  |
| SNMP-SEC-02: post-restart replay             | An empty in-process Hub did not consult the persistent latest-state store before accepting replay | Repeated historical measurement could be treated as new after process restart | Query persisted latest entity samples before accepting any new packet; fail closed if query unavailable   |
| SNMP-SEC-03: race of concurrent HTTP writes  | Two simultaneous duplicate-timestamp submissions passed before either published to the Hub        | Contradictory values could both reach the durable writer                      | Serialize ingest per controller identity within one Node.js process and recheck after previous acceptance |
| SNMP-SEC-04: unlimited historical packet age | Timestamp from 2001 passed schema validation                                                      | Ancient observations could enter the system                                   | Reject packet `observedAt` older than five minutes; preserve one-minute future-clock-skew bound           |

Already working in the initial run: forged _uncommissioned_ source identities and unbound OIDs could not write or publish telemetry.

## Regression and black-box coverage

- [SNMP adversarial Actions workflow](https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/workflows/snmp-adversarial-security.yml) executes five attack assertions, collector checks, TypeScript validation and production-dependency audit.
- `tests/unit/snmp-adversarial-security.test.ts` models equal-timestamp mutation, restart persistence, concurrent writes, input age bounds, wrong OID/source.
- The disposable `scripts/ci/http-operational-journey.mjs` probes the **real** Next.js endpoint with a logged-in browser cookie but **no collector bearer**, wrong bearer, wrong source identity, unknown OID, ancient timestamp, equal-timestamp spoofing and load readback. It must keep the genuine valid 430 A total unchanged.
- `scripts/ci/http-operational-restart.mjs` replays a previously persisted current observation after restarting Next.js and expects the endpoint to deny it.
- Standard HTTP/MongoDB/TimescaleDB, Modbus TCP and Operational Console workflows continue to protect the non-SNMP integrations.

### Deployment security boundaries **not certified by this PR**

1. **Multiple AppM replicas:** the queue/lock serializes only within one Node.js process. The Timescale latest read is not a cross-replica, transactionally atomic idempotency barrier. For horizontal scaling, enforce uniqueness/serialization in a shared durable store. Keep a single authorized SNMP ingest worker until certified.
2. **Collector token scope:** the existing bearer credential is shared. Anyone with that token can _claim_ any commissioned controller identity and OID. Validating a claimed source identity against a binding does not cryptographically prove which physical collector sent the request. Require per-controller scoped credentials and/or mutual TLS before trusting multiple independent production collectors.
3. **Request-rate controls:** payload size and per-packet point count are bounded, but a valid authenticated caller could issue high-volume repeated HTTP requests. Configure reverse-proxy quotas, isolated network access and observability. Load/abuse testing at scale remains unperformed.
4. **Physical Delta acceptance:** CI uses synthetic/normalized measurements. No real controller IP, firmware, MIB index, SNMPv3 firmware profile, wiring map or shunt accuracy has been verified.

**Release decision:** allow integration to `main` only after adversarial Actions + CI + disposable HTTP operational acceptance finish successfully on the same PR tip. A passing run means these specified attack cases were blocked, **not** that the whole system is free of vulnerabilities.

## Addendum — bounded Configuration 4 chaos run (2026-10-21)

This round used only GitHub Actions disposable runners: **no field controller, external
SNMP address, production database, customer data or public traffic**. The stress
fixtures cover three modeled BDFBs, four A1/A2/B1/B2 shunts each, and 120
simultaneously queued per-source SNMP polls (480 isolated simulated durable
writes). BFDB's independent agent suite probes three local-only UDP SNMPv3
agents with 60 GET requests covering eight synthetic OIDs per cabinet.
This is **bounded functional stress**, not a maximum throughput or DDoS test.

### Reproduced findings and mitigations

| ID | Failure proof | Result / mitigation |
| --- | --- | --- |
| CHAOS-01 | `normalizeVarbinds` used `Number(null)`, `Number('')` and `Number(false)`, silently converting invalid controller responses into measured **zero** | **Fixed**: only finite numeric and strict decimal ASCII/Buffer scalars are allowed; null/empty/boolean/object values fail the poll without generating zero amperes |
| CHAOS-02 | Commissioned SNMP `scale` accepted extreme, unrealistic factors | **Fixed**: reject non-finite, zero and factors outside magnitude 1,000,000; this is a configuration guard, not an asserted Delta engineering range |
| CHAOS-03 | A missing shunt OID (`noSuchInstance`) inside a multi-OID GET previously caused **all** independent feeder readings in that polling cycle to be dropped | **Fixed** for per-varbind noSuchObject/noSuchInstance: forward available healthy shunts, omit missing shunts, never invent 0 A; network/session/unknown SNMP errors still abort that poll |
| CHAOS-04 | Inject failure on 3rd of 4 per-feed Timescale writes; first two writes remain durable while hub publishes none; identical batch retry rejected as replay | **Open, priority P1**: [issue #78](https://github.com/em3rc0dTh/AppM-Site-Mapper/issues/78). Requires atomic durable batch + stable idempotency across replicas and recovery after partial failure |

### Passing controls and limitations

The BFDB agent and Site Mapper tests use synthetic OIDs and locally bound
SNMPv3; the earlier origin/OID spoof, bearer, stale/replay and SET-denial
tests remain in force. All 12 independent shunt identities must remain isolated
from one another, and Config 4 must withhold whole-cabinet total when one
required feed is absent. A success does **not** certify true Delta MIB maps,
field wiring, multi-process races, sustained high-rate ingress, shared token
identity, network saturation, distributed backpressure or physical safety.

Until CHAOS-04 is resolved, operate **one authorized Site Mapper SNMP ingest
replica** and limit ingress upstream. Current live-stream semantics prevent
publishing a falsely successful batch after history fails, but the historical
store may still retain a partial packet. Never claim end-to-end transactional
durability until the issue acceptance criteria pass.
