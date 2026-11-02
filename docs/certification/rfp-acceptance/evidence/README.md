# Acceptance Evidence Rules

## 1. Purpose

This directory defines how acceptance evidence is organized. It intentionally contains no
customer-confidential evidence by default.

## 2. Directory convention

Recommended structure:

```text
evidence/
└── <acceptance-run-id>/
    ├── ACC-001/
    │   └── README.md
    ├── ACC-002/
    │   ├── README.md
    │   └── ui-sanitized.png
    └── ...
```

A controlled project repository may contain the private originals while this repository stores only
sanitized copies or references.

## 3. Required evidence README

Each case should record:

```text
Test ID:
Acceptance run ID:
Release SHA:
Execution timestamp:
Operator role:
Target QDF:
Environment: LAB | PRE-PROD | FIELD
Data provenance: LAB | FIELD

Result:
PASS | FAIL | BLOCKED | N/A

Artifacts:
- <file or controlled reference>

Sanitization:
- <what was removed/redacted>

Notes:
- <objective notes>
```

## 4. Evidence quality

Good evidence is:

- attributable to the exact release;
- timestamped;
- tied to the tested QDF/source;
- sufficient to reproduce the conclusion;
- readable without relying on oral explanation;
- sanitized without removing the fact being proved.

Examples include:

- UI screenshot showing target, unit and status;
- API JSON response;
- history response/query;
- Modbus client output;
- generated register-map hash;
- deployment/version record;
- controlled customer acceptance reference.

## 5. Evidence that must not be committed publicly

Do not commit:

- the customer RFP or screenshots/pages from it;
- credentials, tokens, communities, keys or passwords;
- production private IPs or sensitive network routes;
- customer serial numbers or source identities when considered confidential;
- private topology/network diagrams;
- unredacted customer names/personnel data where not required.

Use a controlled evidence reference instead.

## 6. Immutable history

Do not delete failed evidence after a correction.

A re-test should create a new evidence record linked to the new release/run so the acceptance history
remains auditable.
