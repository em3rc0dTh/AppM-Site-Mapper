# TFARM04 live delta reconciliation — 2026-11-26

## Why this exists

TFARM04 was operating correctly on repository commit `48194fa0dbf2e7ec7301718b85ef83c530173a3b`,
but its checkout contained 17 uncommitted source files. Several of those changes were confirmed to be
visible in the running application. Replacing the runtime with clean `main` would therefore have
removed working behavior.

The live delta was frozen before any deployment action and published as:

- recovery branch: `recovery/tfarm04-live-delta-2026-11-26`
- recovery snapshot: `c6d17147667369c8576276ff0b80ffd1b90bdbd5`
- original TFARM04 base: `48194fa0dbf2e7ec7301718b85ef83c530173a3b`
- certified main being reconciled: `0479fbc4ff328c1c2512f7b0adccaf41b348cad6`

No MongoDB, TimescaleDB, MQTT, SNMP runtime, Docker volume, customer topology, credentials or
private runtime file is part of this snapshot.

## Undocumented live changes recovered

### 1. Industrial history downsampling

`infra/telemetry-store/industrial.py` and the industrial series route add
`bucketSeconds` history queries.

- accepted range: 1..86400 seconds;
- bucketed and cursor pagination modes are mutually exclusive;
- each bucket returns the newest sample;
- bucketed history does not expose a continuation cursor.

The live QDF history UI uses:

- 24 h -> 120 s buckets;
- 7 d -> 900 s buckets;
- 15 d -> 1800 s buckets;
- 1 month -> 3600 s buckets.

### 2. ELTEK MIB metadata becomes first-class presentation data

The industrial signal route and ELTEK domain adapter expose:

- MIB source file;
- definition kind;
- syntax;
- referenced objects;
- OID/name metadata.

This is derived from the checked-in ELTEK MIB catalog; no field MIB is invented.

### 3. Alarm normalization enrichment

ELTEK-derived alarm severities are normalized to Site Mapper values
`INFO | WARNING | CRITICAL`. When a target exists, derived rules also carry target identity,
`CONTROLLER_ALARM`, and explicit evidence text.

### 4. SNMP trap interpretation

Trap presentation now retains and displays:

- notification MIB file/kind/objects;
- standard SNMP `sysUpTime` and `snmpTrapOID` definitions;
- enum labels;
- referenced OID names/files;
- decoded printable base64 payloads;
- operator-oriented origin, condition, measured value and related signal context.

The operator surface intentionally changed from an expandable paginated technical table to a
latest-10 master/detail workspace. Older-page loading and JSON copy/export controls are no longer in
this live operator view; technical varbind evidence remains available in the detail pane.

### 5. SNMP operational MIB catalog

New `SnmpMibCatalog` replaces the former feed-only view in the BDFB `feeds` tab.

It presents:

- controller status;
- normalized total current;
- normalized DC voltage;
- normal digital-input count;
- active alarm/condition count;
- input description/status/alarm/contact configuration;
- latest observation time.

The view refreshes every 60 seconds and uses the existing commissioned controller profile.

### 6. SNMP QDF historical view

New `SnmpControllerHistory` replaces the previous feed-history component in the BDFB history tab.

It plots:

- voltage;
- total current;
- derived power: `abs(V) * I / 1000`;
- cumulative period energy using trapezoidal integration across recent adjacent buckets.

History is derived only when controller normalization exists.

### 7. BDFB presentation cleanup

The diagnostic warning paragraph was removed from the SNMP feed-load panel.
The BDFB inspector routes `feeds` to the MIB catalog and `history` to the new QDF history.

### 8. Product header behavior

The MK2 product frame is visual; only the Home icon navigates to the workspace.
The wordmark itself is no longer the Home link. Styling was adjusted to the card-like header visible
on TFARM04.

### 9. Bilingual UI catalog

Spanish and English catalogs gained the SNMP MIB catalog, history, trap interpretation and
operational-status labels. The Spanish diagnostic badge changed from
`SNMP · DIAGNÓSTICO` to `SNMP`.

## Reconciliation rule

The recovered runtime behavior is preserved verbatim for the 15 non-i18n files.
For `src/messages/es.json` and `src/messages/en.json`, the recovered SNMP sections are merged into
the newer certified `main` catalogs so the Power Target Catalog translations introduced after the
TFARM04 base are not lost.

## Deployment rule

This reconciliation does not itself authorize a TFARM04 restart. Promotion order remains:

1. integration branch;
2. GitHub Actions green;
3. merge to `main`;
4. GitHub Actions green on `main`;
5. recreate only the `site-mapper` container using the existing TFARM04 runtime configuration;
6. preserve MongoDB, TimescaleDB, telemetry services, volumes and private runtime files.
