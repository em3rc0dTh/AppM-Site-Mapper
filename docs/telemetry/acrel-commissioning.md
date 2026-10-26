# Acrel commissioning: communications, channel mapping and provenance

**Status:** Implemented in feature branch; not field certified. No tests, builds or deployment were run for this delivery.

## Scope

The Acrel commissioning console at `/industrial/commissioning` adds **configuration and metadata** to
the existing Site Mapper Device/Equipment/PowerPath/TelemetryBinding hierarchy. It does
not create BDFBs, gateways, meters, breakers, circuits, new telemetry transports, or fake measurements.

Before using the console, physically inventory the gateway and AMC16Z meter as existing
Equipment under the correct BDFB Device. Their model/serial belongs to canonical Equipment.
The console stores a typed operational communication profile keyed by that Equipment ID.

### C&P operational metadata

The commissioning profile can preserve **declared** values without treating them as verified:
alias / NE Name / TID, part number, gateway or meter number, MAC address, login username,
gateway network parameters, uplink services, RS485 settings, downlink mode, declared slave count,
meter channel count/description, Hall sensor description, 120-ohm termination and documentary
RS485 status. Profiles are explicitly marked `DECLARED` or `FIELD_VERIFIED`.

Project provenance can also retain project name/ID, site, client/operator, responsible person,
document date/status, revision and an evidence reference.

Passwords are never persisted in plaintext. The profile records only credential state:
`NOT_DECLARED`, `PRESENT_IN_SOURCE` or `SECRET_REFERENCED`. When a secret is placed in an
approved vault, only a URI-like reference (for example `vault://...`) may be stored.

The console search indexes Equipment name/model/serial plus commissioning alias, part number,
MAC, gateway/meter number and login username so operational aliases are useful for lookup.

### Gateway profile

- `sourceIdentity` is optional while only documentary/network configuration is known. When set,
  it is the exact identity of the authorized MQTT publisher, **not** an assertion that the printed
  hardware serial is the MQTT publisher identity. Channel commissioning remains blocked until it is confirmed.
- IPv4, subnet mask and default router plus one or both uplink services (`MQTT`, `MODBUS_TCP`).
  Each service has an optional port so the system can preserve a documented Modbus TCP port while
  leaving an undocumented MQTT port empty rather than inventing it.
- RS485 bus configuration: baud rate, data bits, parity and stop bits.
- A configured `MODBUS_TCP` uplink is documentary metadata only; this feature does not
  commission a new Modbus TCP polling client.

### Meter profile

- Existing Equipment ID and existing gateway Equipment ID in the same BDFB.
- RS485 bus parameters matching the gateway, plus slave address (1–247).
- The same gateway cannot have two active meter profiles with the same slave address.

The application rejects credentials, SNMP communities, usernames, passwords and arbitrary
extra fields in these profiles. Handle device and broker secrets exclusively through
an approved secure runtime secret system; do not put them in Excel, GitHub or metadata.

### Channel-to-breaker commissioning

The authorized operator selects:

1. An already-commissioned meter and its channel (1–24).
2. The **exact raw MQTT point** published for that physical channel.
3. An existing active `CIRCUIT_BREAKER` Equipment in the same BDFB.
4. A non-empty metric subset of VOLTAGE, CURRENT, POWER, ENERGY.
5. Project ID, source-document name, revision and optional evidence reference.
6. Explicit physical verification acknowledgement.

The console renders all 24 channels for every commissioned meter and marks each channel as
confirmed or pending. Selecting a channel only pre-fills the manual form; it never infers a
breaker or raw point from channel number, panel order or equipment naming.

The source identity is taken from the server-side saved gateway profile, not the browser.
An all-or-none batch inserts existing `TelemetryBinding` records (one per metric), with
`commissioning=ACREL_VERIFIED_CHANNEL`, source and meter references, channel, operator
user ID, timestamp and evidence. A separate business inventory is **not** materialized.

If any point is already bound to another breaker, a meter channel points elsewhere, a breaker
already has conflicting telemetry, or an inherited SOURCE binding would override a reading,
commissioning is rejected instead of guessing. To change an established mapping, explicitly
retire it (all-or-none) first. Archived bindings remain in the existing binding collection with
retirement actor/date/evidence. Ingestion uses only ACTIVE bindings.

**Important:** saving a profile does not establish network connectivity. Confirming a binding
records an operator assertion of physical mapping, not observed field accuracy. Real MQTT
publisher identity, broker ACL/TLS, the gateway's acquisition path, Modbus register maps,
Acrel-to-breaker wiring and measurements still require field certification. The source
document alone does not prove the channel-to-breaker correspondence.

## Data and persistence

- `industrial_communication_profiles` (MongoDB), one profile per Equipment, versioned
  by `revisionNumber`, storing bounded previous revisions. Memory mode uses a process singleton.
- Existing `telemetry_bindings`, with provenance in `attributes`.
- Unique indexes for equipment, gateway publisher identity, and gateway+slave address.
- Breaker Equipment inspectors show the confirmed gateway → meter → channel → raw-point path and
  communication details only to users with `settings:read`, with a contextual link back to the BDFB console.
- API: `GET/POST /api/industrial/commissioning`; permissions:
  `settings:read + telemetry:read` and `settings:write + topology:write`.
- Browser mutation requests must be same-origin and use strictly validated bounded JSON.
- MongoDB batch mapping and retirement use transactions and therefore require a
  transaction-capable MongoDB deployment (replica set or sharded cluster). The project's
  `docker-compose.telemetry.yml` already runs MongoDB as single-node `rs0`; an older standalone
  Mongo URI is not sufficient for these mutation operations.
- No production IPs, MAC addresses, customer identities, hardware serials, source spreadsheets
  or secrets are committed with this implementation.

## Field adoption checklist (not yet executed)

1. Confirm installed gateway and meter inventory and their parent BDFB identities.
2. Enter profiles from approved C&P; resolve inconsistent addresses before network use.
3. Verify and record each physical channel-to-breaker correspondence.
4. Check live MQTT source identity, physical meter channel, metric scaling/units and reading.
5. Confirm expected A/B power routes using the existing Power Path trace.
6. Check the audit revision and archival behavior after operator approval.

The QDF before/after breaker movement workflow and XLSX importer are explicitly
out of scope; existing PowerPath and breaker topology are left untouched.
