# MK1 Security Baseline

Status: active from first implementation commit.

## Trust model

- Browser-controlled state is untrusted.
- Authentication and authorization are server authoritative.
- Every external input is validated.
- Secrets come from runtime configuration and never from committed fallbacks.
- Logging must not emit credentials or secret material.
- Public-repository status is treated as an additional exposure constraint.

## Repository controls

Ignored by default:

- environment files except .env.example;
- private keys and certificates;
- database dumps/exports;
- test/runtime artifacts.

## Known legacy risks that must not migrate

- public telemetry streaming;
- hardcoded MQTT credentials;
- browser-controlled role trust;
- plaintext password compatibility;
- generic dynamic CRUD with weak validation;
- direct data-store access from broad application actions.

These are historical findings, not implementation templates.

## Open security work

Authentication/session design, RBAC, rate limiting, CSP and telemetry authorization are intentionally deferred to their formal gates/ADRs. Their absence means MK1 is not security-certified yet.
