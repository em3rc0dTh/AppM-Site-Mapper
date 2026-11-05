# S05 Commissioning Audit

## Purpose

Sprint S05 needs a reproducible, read-only comparison between the commissioning reference supplied by the operator and the state currently stored in Site Mapper.

The audit must answer:

- which QDF owns each gateway and meter;
- whether gateway and meter identities match the reference;
- whether A3/B3 breaker positions match the declared post-migration map;
- whether each destination remains attached to the expected breaker;
- how many MQTT source/metric bindings currently exist;
- whether active telemetry source-point bindings are duplicated;
- which SNMP publishers and metrics are currently active.

The audit is evidence only. It never commissions, archives, updates, deletes or inserts data.

## Security boundary

The repository is public.

Real commissioning workbooks, customer topology, credentials, IP addresses, MAC addresses and private serial/reference manifests must **not** be committed.

Store the real normalized reference at:

```text
.runtime/s05-commissioning-reference.json
```

The `.runtime/` directory is already ignored by Git.

A synthetic schema example is kept at:

```text
config/industrial/s05-commissioning-reference.example.json
```

## Manifest validation

Validate a local manifest without connecting to MongoDB:

```bash
node scripts/operations/audit-s05-commissioning.mjs \
  --manifest .runtime/s05-commissioning-reference.json \
  --manifest-only
```

Expected status:

```text
S05_MANIFEST_VALID
```

## Runtime audit

Use a server-side MongoDB URI already provisioned in the runtime environment.

```bash
MONGODB_URI='mongodb://...' \
node scripts/operations/audit-s05-commissioning.mjs \
  --manifest .runtime/s05-commissioning-reference.json \
  --database seed-01
```

For a gate-style run, add `--strict`. The process returns exit code 10 when a conflict or a missing runtime entity is found.

## Result states

| State                | Meaning                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `MATCH`              | Runtime agrees with the commissioning reference.                    |
| `CONFLICT`           | Both sides exist but disagree. No automatic repair is allowed.      |
| `MISSING_IN_RUNTIME` | The reference expects an entity/position that is absent at runtime. |
| `OBSERVED`           | Informational runtime count; no expected value is inferred.         |

## Relationship to existing baseline checks

This audit complements, rather than replaces:

- `scripts/operations/audit-office-baseline.sh`
- `scripts/operations/audit-office-baseline.mongosh.js`

The OFFICE baseline proves structural/runtime invariants such as the expected BDFB inventory, active breaker count, absence of duplicate active source-point bindings, SNMP Config2 binding shape and durable Timescale history.

The S05 audit adds a private external reference so that operator-supplied commissioning truth can be compared with runtime without putting customer data into Git.

## Apply rule

A `CONFLICT` is a blocker for automatic commissioning.

The operator must verify the physical asset or another authoritative field record before any seed, MongoDB document, telemetry binding or commissioning profile is changed.

No script in this audit performs APPLY.

## Field network evidence — 2026-11-05

A field LAN-scanning capture supplied by the operator supersedes the duplicate gateway IPv4 values documented in CP_Acrel_v0.3.

The capture proves that the three Acrel gateways have distinct static IPv4 addresses and that the serial-to-network assignment is unique for QDF-2, QDF-4 and QDF-5. The exact operational addresses and other customer-network details are retained only in the private runtime reference under `.runtime/`; they are intentionally not committed to this public repository.

The stable gateway identity remains the hardware serial. IPv4 and MAC addresses are commissioning/network attributes and must never replace the serial as the identity key. Field verification of those network attributes is granular evidence only: it does **not** promote the complete communication profile, MQTT publisher identity, channel map or measurements to `FIELD_VERIFIED`.

Current evidence classification:

- gateway serial mapping: FIELD VERIFIED;
- gateway IPv4 uniqueness: FIELD VERIFIED;
- CP v0.3 duplicate IPv4 value: SUPERSEDED;
- gateway MAC uniqueness: pending higher-resolution/exported field evidence;
- meter serial conflicts: unresolved and BLOCK APPLY.

No topology, profile or telemetry binding may be changed solely from this evidence. The read-only S05 diff must still be executed against the deployed runtime before an APPLY plan is approved.
