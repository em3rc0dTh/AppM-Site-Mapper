# Site Mapper glossary

This glossary explains the words used in navigation, plans and equipment views.

You do not need to be a networking, electrical or software specialist to use it. When a term is an internal Site Mapper reference rather than a physical object, this is stated explicitly.

## How to read the hierarchy

Site Mapper organizes infrastructure as a tree:

**Network → Site → Structure → Level → Room → Container Cluster / Bay → Position / Anchor → Rack → Device → Equipment**

The hierarchy answers a simple question: **where is the item I am looking at?**

Not every level is a physical device and not every level produces measurements.

## Network

**What it is:** the highest level used to group one or more installations.

**What it is for:** keeps several sites inside one infrastructure organization.

**It does not mean:** that a physical device called “Network” exists. It does not produce telemetry.

## Site

**What it is:** a physical site or installation.

**What it is for:** groups buildings, levels, rooms and equipment belonging to the same place.

## Structure

**What it is:** a building or physical structure inside a site.

**What it is for:** organizes the levels and rooms in that building.

## Level

**What it is:** a floor or level of a structure.

**It does not mean:** an electrical level or an alarm level.

## Room

**What it is:** a physical room.

**What it is for:** contains positions, racks and equipment located in that room.

## Container Cluster / Bay

**What it is:** a physical area of the room used to group nearby positions.

**What it is for:** represents how cabinets are arranged on the plan.

**It does not mean:** a device that produces measurements.

## Position / Anchor

**What it is:** a position reference used by Site Mapper to place a rack on the plan.

**What it is for:** preserves the rack location and relates it to its physical footprint.

**Example:** `QDF5 anchor` is the reference position where rack QDF5 is placed.

**It does not mean:** equipment, a sensor or a telemetry source. It requires no operational action from the user.

## Footprint

**What it is:** the space an object occupies when viewed from above.

**Example:** **600 × 600 mm** means the rack occupies 600 mm by 600 mm on the room plan.

**It does not mean:** rack height or U capacity.

## Rack

**What it is:** the physical cabinet where equipment is installed.

**What it is for:** its **Front Elevation** shows cabinet occupancy and lets you open installed equipment directly.

## Device

**What it is:** a primary piece of equipment managed by Site Mapper.

**Example:** **BDFB QDF-5**.

## Equipment

**What it is:** a physical part belonging to a Device or another Equipment item.

**Examples:** Chassis, Shelf, Frame, Panel or Breaker.

## BDFB / QDF

**What it is:** the power distribution equipment identified by the customer.

**Example:** **BDFB QDF-5**.

**What you can view:** physical composition, operational status, inputs, charts, alarms and historical reports when data is available.

## Chassis

The main physical structure that contains internal BDFB components.

## Shelf

A physical division inside the Chassis.

## Frame

A structure inside a Shelf that groups panels.

## Panel

A set of physical positions where breakers may be installed.

**Important:** Site Mapper can show the panel and its breakers even when there is no direct electrical measurement for the panel as a whole.

## Breaker

An individual circuit breaker installed in a panel position.

When measurements exist, you can view voltage, current, power, energy and history.

## Physical view

Answers: **what is installed and how is it organized?**

It does not mean every displayed item is currently sending data.

## Operation

Answers: **what is happening with the equipment?**

It includes measurements, states, alarms and history when available.

## Front Elevation

The rack front view. It shows which equipment occupies the cabinet and lets you open the selected equipment directly.

## Reporting

Means Site Mapper has received recent data from the expected item.

Example: `36 / 36 breakers reporting` means all 36 installed breakers have recent data.

It does not mean there are no electrical alarms. Data coverage and alarms are separate concepts.

## Partial data

Information exists for only part of the expected period or measurements.

Missing data is never converted to zero.

## No data in this window

There are no accepted measurements for that metric during the selected period.

It does not mean the equipment is powered off.

## Interval

A portion of the selected historical period used to organize measurements.

## Voltage variation (Δ)

The difference between the maximum and minimum voltage observed during the selected period.

Example: maximum 52.3 V and minimum 51.8 V → variation 0.5 V.

It is not an alarm by itself.

## Where do I find each thing?

| If you want to know… | Open… |
| --- | --- |
| Where a QDF is located | Room plan / navigation tree |
| What is installed in a rack | Front Elevation |
| How a BDFB is physically composed | Physical view |
| What is happening now | Operation |
| How values changed over time | Charts / Report |
| What happened on one breaker | Breaker → Charts → Open breaker report |
| What a term means | This glossary |

If a screen uses an infrastructure term you do not recognize, check this glossary first. Help should explain the concept without requiring outside technical knowledge.
