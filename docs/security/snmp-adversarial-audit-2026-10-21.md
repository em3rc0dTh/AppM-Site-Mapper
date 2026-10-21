# SNMP adversarial security review — 2026-10-21

**System:** AppM-Site-Mapper, authenticated `/api/telemetry/snmp/ingest`, explicit BDFB input-feed commissioning, collector normalization and TimescaleDB latest-observation recovery.  
**Scope:** controlled in-memory and disposable CI environment only. No scans or traffic to Delta equipment, external IP addresses, production SNMP agents, databases, or user environments.  
**Provenance:** [PR #75](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/75).

## First attack pass: findings confirmed on the pre-hardening code

[GitHub Actions baseline run 39640181105](https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/runs/39640181105) demonstrated four failures in five isolated assertions.

| Finding | Demonstrated behavior | Consequence | Change |
| --- | --- | --- | --- |
| SNMP-SEC-01: same-timestamp replay | A later payload with the same `observedAt` and different current was accepted | Authenticated feed value integrity could be overwritten | Reject `observedAt <= previous observedAt` for the same commissioned OID |
| SNMP-SEC-02: post-restart replay | An empty in-process Hub did not consult the persistent latest-state store before accepting replay | Repeated historical measurement could be treated as new after process restart | Query persisted latest entity samples before accepting any new packet; fail closed if query unavailable |
| SNMP-SEC-03: race of concurrent HTTP writes | Two simultaneous duplicate-timestamp submissions passed before either published to the Hub | Contradictory values could both reach the durable writer | Serialize ingest per controller identity within one Node.js process and recheck after previous acceptance |
| SNMP-SEC-04: unlimited historical packet age | Timestamp from 2001 passed schema validation | Ancient observations could enter the system | Reject packet `observedAt` older than five minutes; preserve one-minute future-clock-skew bound |

Already working in the initial run: forged *uncommissioned* source identities and unbound OIDs could not write or publish telemetry.

## Regression and black-box coverage

- [SNMP adversarial Actions workflow](https://github.com/em3rc0dTh/AppM-Site-Mapper/actions/workflows/snmp-adversarial-security.yml) executes five attack assertions, collector checks, TypeScript validation and production-dependency audit.
- `tests/unit/snmp-adversarial-security.test.ts` models equal-timestamp mutation, restart persistence, concurrent writes, input age bounds, wrong OID/source.
- The disposable `scripts/ci/http-operational-journey.mjs` probes the **real** Next.js endpoint with a logged-in browser cookie but **no collector bearer**, wrong bearer, wrong source identity, unknown OID, ancient timestamp, equal-timestamp spoofing and load readback. It must keep the genuine valid 430 A total unchanged.
- `scripts/ci/http-operational-restart.mjs` replays a previously persisted current observation after restarting Next.js and expects the endpoint to deny it.
- Standard HTTP/MongoDB/TimescaleDB, Modbus TCP and Operational Console workflows continue to protect the non-SNMP integrations.

### Deployment security boundaries **not certified by this PR**

1. **Multiple AppM replicas:** the queue/lock serializes only within one Node.js process. The Timescale latest read is not a cross-replica, transactionally atomic idempotency barrier. For horizontal scaling, enforce uniqueness/serialization in a shared durable store. Keep a single authorized SNMP ingest worker until certified.
2. **Collector token scope:** the existing bearer credential is shared. Anyone with that token can *claim* any commissioned controller identity and OID. Validating a claimed source identity against a binding does not cryptographically prove which physical collector sent the request. Require per-controller scoped credentials and/or mutual TLS before trusting multiple independent production collectors.
3. **Request-rate controls:** payload size and per-packet point count are bounded, but a valid authenticated caller could issue high-volume repeated HTTP requests. Configure reverse-proxy quotas, isolated network access and observability. Load/abuse testing at scale remains unperformed.
4. **Physical Delta acceptance:** CI uses synthetic/normalized measurements. No real controller IP, firmware, MIB index, SNMPv3 firmware profile, wiring map or shunt accuracy has been verified.

**Release decision:** allow integration to `main` only after adversarial Actions + CI + disposable HTTP operational acceptance finish successfully on the same PR tip. A passing run means these specified attack cases were blocked, **not** that the whole system is free of vulnerabilities.
