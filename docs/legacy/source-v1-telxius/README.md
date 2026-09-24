# Legacy V1 Telxius Source Register

**Product:** Apana Air Site Mapper  
**Purpose:** Preserve validated product knowledge from the prior Site Mapper implementation without importing legacy accidental architecture or security debt.

## Source package

User-provided evidence package: `v1_telxius.zip`.

The package contains the following source documents:

- `AppManager_Site_Mapper_Manual_Usuario_v1.0.pdf`
- `AppManager_Site_Mapper_Manual_Administrador_v1.0.pdf`
- `AppManager_Site_Mapper_Guia_Rapida_Inicio_v1.0.pdf`
- `AppManager_Site_Mapper_Arquitectura_HLSD_v1.0.pdf`
- `AppManager_Site_Mapper_HLSD_v1.0.pdf`
- LaTeX source for the manuals/architecture documents
- screenshot manifests and architecture-diagram manifests
- legacy screenshots covering login, workspace, site canvas, structure, room/blueprint, rack elevation, device, BDFB, panel, breaker and Power Path views.

A separate external reference document, `TR-547-TAPI-Reference-Implementation-Agreement_v2.0.pdf`, is also present in the package. It is not treated as Site Mapper product truth unless a future decision explicitly maps a requirement to it.

## Evidence classification

These materials are **evidence and product-reference sources**, not the runtime architecture of MK1.

Use them to recover:

- validated workflows;
- interaction grammar;
- visual hierarchy;
- terminology used by operators;
- topology navigation behavior;
- rack/CAS behavior;
- BDFB/QDF composition;
- Panel / Holder / Circuit Breaker behavior;
- Power Path semantics;
- workspace pinning behavior;
- telemetry presentation behavior;
- administration procedures;
- known AS-IS technical limitations;
- previously proposed TO-BE architecture decisions.

Do **not** automatically recover:

- legacy authentication/session implementation;
- hard-coded broker configuration;
- one-MQTT-connection-per-SSE-client architecture;
- browser-owned latest-value state;
- duplicated persistence models;
- unsafe cascade/delete behavior;
- secrets;
- unverified deployment assumptions;
- old data aliases as runtime architecture.

## Product truths recovered from the manuals

### Infrastructure navigation

The legacy product supports a navigable physical hierarchy from Site through structures, levels/rooms, clusters/bays, positions, containers/racks and installed devices.

The current MK1 canonical domain remains authoritative where terminology differs.

### Rack and CAS

The prior product exposes rack elevation and CAS states:

- `AVAILABLE`
- `RESERVED`
- `EQUIPPED`

It supports reservation, allocation, freeing and mounted-device inspection.

### BDFB / QDF

The prior product supports BDFB configuration with:

- variants with physical Frames;
- variants without Frames;
- Panels;
- multiple breaker/holder slots per Panel;
- internal navigation from BDFB → Frame → Panel → slot/breaker.

The manuals describe a Panel example with 24 slots.

### Holder and Circuit Breaker

A Panel slot can be available as a holder. Once populated/configured with a circuit breaker, that slot represents an installed breaker and can participate in provisioning.

The breaker view exposes information such as:

- breaker identity/label;
- status;
- capacity;
- access/port association;
- target equipment;
- provisioning slot/path;
- telemetry availability.

### Power Path

The legacy workflow supports tracing:

`BDFB → Frame → Panel → Breaker → Port → Equipment Slot → Target Device`

and distinguishes A/B provisioning paths.

### Workspace pinning

The legacy product permits operational units to be pinned to the Workspace so operators can keep frequently reviewed assets visible.

Pinning is a presentation/user-preference capability. It must not redefine topology ownership or telemetry identity.

### Telemetry

The legacy application correlates MQTT-originated telemetry to equipment identity, historically using serial-number identity in the observed implementation.

The browser presented current telemetry and differentiated cases where telemetry was absent or stale.

## Architecture truths recovered from the internal HLSD

The legacy AS-IS architecture identified several limitations:

- MQTT connection coupled to each active SSE request;
- latest telemetry kept in browser memory;
- no durable canonical retention model;
- no mandatory timestamp/sequence/quality/unit contract;
- broker configuration previously coupled too closely to source code/runtime;
- incomplete observability and operational hardening.

The prior TO-BE architecture already proposed:

- MQTT broker with TLS;
- topic ACLs and credential rotation;
- a shared ingestion worker;
- schema/identity/timestamp/sequence/unit validation;
- latest-value cache outside the browser/web process;
- historical/temporal storage with explicit retention;
- invalid-message quarantine/dead-letter handling;
- authorized realtime fanout;
- stale/quality classification;
- audit and observability;
- concurrency/version controls for critical operations.

These are compatible with the current MK1 direction and are retained as architectural evidence.

## Current product decisions added in 2026-09

The current project direction further clarifies:

- the product name remains **Apana Air Site Mapper**;
- the immediate deployment scenario includes three QDF/BDFB units;
- hardware-connected breakers publish operational measurements through MQTT;
- not every holder/breaker is necessarily telemetry-connected;
- telemetry-connected circuit breakers need their own source identity;
- expected measurements include voltage, current/amperage, electrical load and power when supplied or safely derivable;
- the system requires live/latest data and durable historical time-series analytics;
- required query horizons include current/latest, intraday, daily, seven-day, monthly and longer historical windows;
- the platform requires an MQTT broker under project/operator control;
- historical telemetry must not depend on browser memory or a single Next.js process;
- a BDFB/QDF may occupy an entire 42U/48U container in the current physical case, but this is **not** a universal domain invariant;
- any eligible operational asset may be pinned, not only BDFBs.

## Source handling rule

If legacy documentation conflicts with the current MK1 contract or a newer explicit product decision:

1. preserve the conflict as evidence;
2. do not silently merge meanings;
3. prefer the current approved canonical contract;
4. record the decision in an ADR or product contract;
5. keep legacy aliases in migration/UI documentation only when needed.

## Binary artifact note

The original source package also contains binary PDFs and screenshots. The GitHub connector used for this ingestion supports UTF-8 repository writes, so this repository register captures their provenance and extracted product truth. Binary originals remain source evidence supplied by the project owner and should be added through the normal Git binary workflow if permanent in-repository archival is required.
