# Understand where readings come from

Site Mapper can display measurements from different systems. You don't need to know how they are connected to inspect equipment.

![How measurements reach Site Mapper](/help/diagrams/en/data-flow.svg)

## MQTT: breaker measurements

A Panel may receive MQTT values for each breaker. Each signal must be linked to the correct circuit.

## SNMP: input and controller information

An SNMP controller can provide readings for the main power inputs on a BDFB, such as current or voltage. These measurements are different from readings on individual breakers.

## History: previous readings

When earlier observations are stored, you can review them in **Charts** or a history view. An old reading does not mean new data is currently arriving.

## Modbus: sharing data with other systems

Site Mapper can also make information available to other industrial systems through Modbus. This is **a way to share data**, not an additional physical measurement.

## Who configures the connections?

MQTT brokers, SNMP controller network settings and Modbus addresses are set up by authorized integration personnel. In Site Mapper you can inspect measurements and, if your account allows it, link equipment to signals through the supported screens.

**You're done when:** you can tell the difference between a breaker reading, a main-input reading and information shared with other systems.

[MQTT mapping](vincular-mqtt.md) · [SNMP inputs](configurar-snmp.md).
