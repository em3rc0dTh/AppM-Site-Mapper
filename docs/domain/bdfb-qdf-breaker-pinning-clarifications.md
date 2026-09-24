# BDFB/QDF, Panel, Holder, Breaker and Pinning Clarifications

**Status:** Current product clarification  
**Product:** Apana Air Site Mapper

## Purpose

Freeze product semantics clarified during the MK1 reconstruction so future implementation does not overfit the current physical installation or reintroduce ambiguity from the legacy implementation.

## BDFB / QDF naming

The product may present **BDFB** or **QDF** terminology according to operator/customer vocabulary.

The canonical domain should retain one technical entity/type and treat alternative naming as UI/business aliases unless a future domain requirement proves that they represent different physical models.

## Current operating scenario

The immediate scenario contains three QDF/BDFB units.

In the current installation a QDF/BDFB may occupy the complete vertical capacity of its Container/Rack, for example 42U or 48U.

This is a **configuration fact**, not a universal invariant.

The domain must continue to support devices whose physical size is smaller than the containing rack and future arrangements where a BDFB does not consume the entire container.

## Internal composition

A BDFB/QDF may be represented with physical Frames or with another approved internal composition.

A typical path is:

`BDFB/QDF → Frame → Panel → Component Position`

The product must not assume that every model has the same number of Frames or Panels.

## Panel positions

Panels expose a finite ordered set of positions.

The validated legacy user experience includes a 24-position Panel.

The number of positions is therefore configuration/domain data, not a hard-coded global constant unless a specific supported hardware model fixes it.

## Holder

A **Holder** represents an available/unpopulated component position in a Panel.

A Holder:

- belongs to exactly one Panel;
- has a stable position/index within that Panel;
- is not automatically a telemetry producer;
- is not automatically a PowerConnection source.

## Circuit Breaker

When a circuit breaker occupies/configures a component position, that position is represented operationally as a **Circuit Breaker**.

A Circuit Breaker may have:

- label/identity;
- electrical capacity;
- lifecycle/state;
- access/port association;
- A/B provisioning semantics;
- target Device/Equipment relationship;
- TelemetrySource binding when hardware telemetry exists.

Not every Circuit Breaker is telemetry-enabled.

Telemetry capability must be explicit.

## Power relationship

A Circuit Breaker may provide power to a Device/Equipment located in another Container/Rack.

The physical location of the source and the physical location of the target are separate concerns from the electrical PowerConnection.

The target relationship is represented explicitly by the power/provisioning domain.

It is never inferred solely from:

- MQTT topic;
- serial number;
- pinning;
- screen position;
- BDFB containment.

## Historical integrity

Changing or disconnecting a breaker-to-device PowerConnection must not erase historical telemetry or historical provisioning/audit evidence.

Current state and historical truth are separate concerns.

## Pinning

Pinning is a generic Workspace preference.

The application may allow any eligible operational asset to be pinned, including:

- BDFB/QDF;
- Device;
- Equipment;
- Panel or other entity if later approved by product rules.

Pinning means that the user/operator wants rapid recurring visibility of the asset.

Pinning does not:

- relocate the entity;
- create a parent/child relationship;
- change electrical provisioning;
- enable MQTT;
- alter authorization;
- change data retention.

## Telemetry binding

A telemetry-connected breaker or device is linked through a TelemetrySource.

The source must resolve to the exact canonical entity/component it measures.

Hardware identity is external integration data and must not replace the canonical entity ID.

## UI expectations

The premium operational UI should make these states visually unambiguous:

- Holder / available position;
- installed Circuit Breaker;
- breaker with telemetry;
- breaker without telemetry;
- fresh value;
- stale value;
- unavailable value;
- calculated value;
- current PowerConnection target;
- A/B path where applicable;
- pinned state.

The UI must not imply that absence of telemetry means the physical component does not exist.

## Non-invariants

Do not encode the following as global invariants:

- every BDFB occupies the whole rack;
- every Panel has exactly 24 positions;
- every Holder becomes a breaker;
- every breaker has MQTT telemetry;
- every breaker powers a target in another rack;
- every pinned item is a BDFB;
- every telemetry source publishes the same metrics/frequency.

These remain configuration/hardware-model concerns.
