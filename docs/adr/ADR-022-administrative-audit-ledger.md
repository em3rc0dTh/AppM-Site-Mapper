# ADR-022 — Administrative audit ledger

- Status: **Accepted for G16 foundation**
- Date: 2026-09-24
- Product: **AppManager Site Mapper**

## Context

Administrative mutations were previously visible only through the operational database and ordinary
application logs. That is not sufficient for security review, incident reconstruction or a controlled
G16 release.

High-volume telemetry readings are not administrative audit records. They remain telemetry/time-series
data.

## Decision

AppManager Site Mapper uses a dedicated append-only audit ledger for sensitive administrative
mutations.

Each audit event contains:

- immutable event ID;
- occurred-at timestamp;
- actor type and user ID when applicable;
- stable action code;
- target kind and target ID when applicable;
- outcome;
- small allowlisted scalar metadata.

The first wired actions are:

- superadmin bootstrap;
- password change;
- explicit logout/session revocation;
- own-profile update;
- managed user creation;
- managed user update.

Future TelemetrySource, broker-integration, power/provisioning and dead-letter replay mutations must
use the same ledger when those mutation APIs exist.

## Sensitive-data boundary

Audit metadata rejects keys containing password, token, secret, hash, cookie or authorization terms.
Routes record only explicit metadata fields. Request bodies are never copied into the ledger.

The ledger must never contain:

- plaintext credentials;
- password hashes;
- session tokens or token hashes;
- broker credentials;
- TSDB credentials;
- arbitrary request payloads.

## Persistence

Production uses the Mongo-backed `audit_events` collection. Memory storage is permitted only in the
existing non-production persistence mode.

The application interface exposes append and bounded recent reads. It intentionally exposes no edit
or delete method.

No TTL is configured by this ADR. Administrative audit retention is a governance/operations decision
and must not be silently inherited from telemetry retention.

## Current atomicity limitation

The current identity repository does not expose a transaction boundary spanning both the identity
mutation and the audit collection.

Therefore the current route contract is fail-closed from the caller's perspective: a successful
administrative response is returned only after the audit append succeeds. However, if the identity
mutation commits and the subsequent audit append fails, the mutation may already exist even though
the request returns an error.

G16 must not describe this as transactionally atomic.

The final closure condition is one of:

1. a Mongo transaction covering the administrative mutation and audit append on a deployment that
   guarantees transaction support; or
2. a durable administrative outbox written atomically with the mutated aggregate and projected into
   the audit ledger.

Until one of those is certified, this residual risk remains open in the G16 gap register.

## Consequences

Positive:

- security-sensitive mutations gain durable, queryable evidence;
- telemetry volume does not pollute the administrative audit stream;
- secret-bearing request data is structurally excluded from metadata;
- future administrative modules have a single audit contract.

Remaining work:

- close the mutation/audit atomicity gap;
- add authorized audit query/export API if operationally required;
- define retention/export policy;
- add audit events for TelemetrySource, power/provisioning and dead-letter replay once those mutation
  paths exist;
- include audit write failure and restore evidence in G16 failure testing.
