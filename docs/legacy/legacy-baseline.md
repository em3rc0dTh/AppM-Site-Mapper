# Legacy Baseline

## Frozen evidence source

- Repository: `thradexIT/site-mapper`
- Frozen commit: `22c7b8c495a026e34732fe0b7e3848b8c37e84c7`
- Historical default branch: `master`
- Mining date: 2026-09-22
- Role in MK1: evidence and reference only

All G1 observations must identify whether they came from code, historical documentation or an explicit MK1 decision.

## Evidence rules

- Do not copy a legacy implementation merely because it exists.
- Do not treat historical documentation as current truth when code contradicts it.
- Do not copy secret values, credentials, private keys, customer data or production topology.
- Record legacy names exactly when gathering evidence.
- Resolve naming conflicts only through G2 domain decisions.
- Classify each candidate artifact as CONCEPT, ALGORITHM, UX or LEGACY before migration.

## Current evidence boundary

The frozen legacy commit is sufficient to mine:

- topology and navigation behavior;
- Blueprint spatial rules;
- rack/CAS behavior;
- BDFB and power concepts;
- telemetry transport behavior;
- identity/RBAC behavior;
- persistence drift;
- current routes and UI modules.

It is not sufficient to prove:

- current production database shape;
- current production data quality;
- current MQTT payload distribution or throughput;
- deployment topology;
- operational scale;
- business intent where code and documentation disagree.

Those items remain external-input requirements.
