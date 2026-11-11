# Site Mapper glossary in plain language

This glossary explains the words used by Site Mapper in everyday language. You do not need networking, electrical or IT experience to understand it.

The most important rule is: **some words describe places, some describe equipment, and some are only references used to locate that equipment**. A location reference does not mean that a physical device exists at that point.

## How to read the hierarchy

For the laboratory QDFs, the path may look like this:

**Network → Site → Structure → Level → Room → Container Cluster / Bay → Position / Anchor → Rack → BDFB → Chassis → Shelf → Frame → Panel → Breaker**

You do not need to open every level to operate the system. The tree shows the complete hierarchy, while direct views let you open the Rack, BDFB, Panel or Breaker with fewer clicks.

## Network

**What it is:** the top level used by Site Mapper to group one or more installations.

**What it is for:** lets several sites belong to the same managed infrastructure.

**What it is not:** it is not physical equipment and it does not produce measurements.

## Site

**What it is:** a physical site or installation.

**What it is for:** groups the buildings, rooms and equipment that belong to that location.

**Example:** a station or facility containing racks and electrical equipment.

## Structure

**What it is:** a building or physical structure inside a Site.

**What it is for:** organizes levels or floors.

## Level

**What it is:** a level or floor of a Structure.

**What it is for:** groups the rooms on that level.

## Room

**What it is:** a physical room or space.

**What it is for:** contains the spatial layout of racks and other location references.

## Container Cluster / Bay

**What it is:** a physical zone inside a Room that Site Mapper uses to group related positions.

**What it is for:** helps organize where racks or cabinets can be located.

**What it is not:** it is not electrical equipment, has no telemetry and does not need to be operated.

## Position / Anchor

**What it is:** a position reference inside a Room or Container Cluster.

**Example:** **QDF5 anchor** is the reference used to locate the rack associated with QDF-5.

**What it is for:** connects a Rack to a specific place on the floor plan.

**What it is not:** it is not the QDF, it is not the BDFB and it does not generate measurements.

## Footprint

**What it is:** the floor area occupied by a Rack when viewed from above.

**Example:** **600 × 600 mm** means the Rack occupies an area 600 mm wide by 600 mm deep.

**What it is not:** it does not describe Rack height or electrical capacity.

## Rack

**What it is:** the physical cabinet containing one or more pieces of equipment.

**Front Elevation:** shows the Rack from the front and lets you see which equipment occupies its positions.

## Device

**What it is:** a primary piece of equipment managed by Site Mapper.

**Example:** **BDFB QDF-5**.

The interface prefers the real equipment name so the user does not have to think in terms of “Device”.

## BDFB

**What it is:** the power distribution equipment whose physical composition and circuits are monitored by Site Mapper.

**Example:** **BDFB QDF-5**.

Its **Physical View** lets you see Chassis, Shelves, Frames, Panels and Breakers.

## Equipment

**What it is:** a physical component that belongs to a Device or another Equipment item.

**Examples:** Chassis, Shelf, Frame, Panel and Breaker.

The word exists in the Site Mapper model, but operational views prefer the real physical names.

## Chassis

**What it is:** the main structure containing the internal BDFB composition.

## Shelf

**What it is:** a physical shelf or level inside the Chassis.

## Frame

**What it is:** a structure inside a Shelf that groups Panels.

## Panel

**What it is:** a panel containing positions where Breakers are installed.

A Panel can have empty positions. An empty position **does not mean** there is an offline breaker.

## Breaker

**What it is:** an individual circuit breaker installed in a Panel position.

When readings are available, Site Mapper can show Voltage, Current, Power and Energy Counter values together with history.

## Front Elevation

**What it is:** the front view of a Rack.

**What it is for:** lets you identify installed equipment and open it.

It is not a room floor plan or an electrical reading.

## Physical View

**What it is:** the physical composition view of a BDFB.

**What it is for:** lets you browse Chassis, Shelf, Frame, Panel and Breaker.

You can also open a Panel directly without opening every intermediate level.

## Operation

**What it is:** the view where Site Mapper shows available current status, readings, history and alarms.

Missing data does not automatically mean that equipment is powered off.

## QDF Report

**What it is:** a historical summary of QDF behavior during a selected period.

It can show minimum, average, maximum, peak, period energy and data availability.

## Breaker Report

**What it is:** a historical summary for one individual Breaker during a selected period.

It lets you inspect that Breaker without mixing its readings with the rest of the QDF.

## If a word is still unclear

Start with the physical object you already know: **Rack, BDFB, Panel or Breaker**. Location words —Network, Site, Room, Cluster, Position or Anchor— only explain where that object is placed inside Site Mapper.
