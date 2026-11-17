# Telemetry Wire Profile v1

## Purpose

Site Mapper must not infer physical wiring authority from payload shape when an
explicit, commissioned source contract is available.

Wire Profile v1 makes the BFDB interpretation contract explicit while keeping
all existing bindings backward-compatible.

## Profiles

- `LEGACY_SINGLE_24`
  - one raw MQTT point represents one physical circuit;
  - existing panel-position commissioning uses this contract;
  - channel-2 fields in a compatibility payload do not implicitly convert the
    source into a field layout.

- `FIELD_DUAL_12`
  - one raw meter object may carry two physical circuit channels;
  - the canonical field mapping remains:
    - A3 -> slave/group 1
    - A2 -> slave/group 3
    - B3 -> slave/group 5
    - B2 -> slave/group 7
  - stale cross-panel or wrong-position bindings remain rejected.

## Backward compatibility

No MongoDB migration is required.

Existing active bindings without `attributes.wireProfile` continue to use the
same payload detection behavior that existed before Wire Profile v1.

A single valid declared profile becomes authoritative for that source. If
declarations conflict, Site Mapper does not choose one silently: it falls back
to payload detection and exposes the conflict in telemetry diagnostics.

## Commissioning

### Automatic BFDB reconciliation

The automatic reconciler detects the packet profile only when no profile has
already been declared. Newly created point bindings persist:

- `attributes.wireProfile`
- `attributes.wireProfileSource`

The reconciler never creates Device or Equipment topology. Site Mapper topology
remains the physical authority.

### Existing manual panel-position commissioning

The current manual endpoint maps one raw point to one physical position. It may
declare `LEGACY_SINGLE_24` only for panels outside the canonical field
A3/A2/B3/B2 prefix mapping.

Field-like panels remain undeclared in this endpoint, preserving the existing
FIELD detection and automatic channel-qualified reconciliation until a
field-aware manual commissioning UI is introduced.

## Runtime behavior

For every accepted BFDB packet Site Mapper resolves:

1. payload-detected profile;
2. valid profile declarations on active MQTT bindings;
3. one effective profile.

The effective profile is then used consistently by:

- BDFB breaker readings;
- exact Equipment LIVE patches;
- optional Modbus downstream projection.

The source sample exposes diagnostic metadata:

- `wireProfile`
- `wireProfileSource`
- `wireProfileMismatch`
- `wireProfileDeclarationConflict`

A mismatch is observational evidence, not an automatic mutation of topology or
bindings.

## Rollback

Wire Profile v1 is additive.

To roll back a newly declared compatibility source, archive/recommission the
new point bindings without the profile declaration. Existing undeclared
bindings require no change and retain the pre-v1 detection path.

## Certification matrix

The release gate must preserve all of the following:

| Scenario | Required result |
| --- | --- |
| Existing undeclared binding | Existing detection behavior |
| Declared LEGACY + dual-field compatibility payload | Breaker LIVE |
| FIELD A3 / slave 1 | LIVE |
| FIELD A2 / slave 3 | LIVE |
| FIELD B3 / slave 5 | LIVE |
| FIELD B2 / slave 7 | LIVE |
| FIELD stale cross-panel binding | Rejected |
| Conflicting profile declarations | Diagnostic conflict; no silent choice |
| HTTP/Mongo golden path | MQTT -> LIVE -> history -> Modbus -> browser -> restart -> audit |
