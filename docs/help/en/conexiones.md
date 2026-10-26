# Check a power connection

Site Mapper can show the power route **recorded in the system**, from source equipment to a destination input.

## Open a Power Path

![Real POWER PATH screen](/help/screenshots/power-path.png)

1. Open the Equipment you want to inspect.
2. In its Inspector, find **Power A**, **Power B**, **VIEW POWERPATH**, **Explore Power Path** or **FULL POWER TRACE**, depending on the screen.
3. Open the route.
4. Read the screen from left to right:
   - **Source equipment hierarchy**: where the route starts.
   - **POWER OUTPUT**: source terminal.
   - **POWER PATH / FEED**: recorded connection.
   - **POWER INPUT**: destination terminal.
   - **Destination equipment hierarchy**: where the route ends.
5. Check the Inspector on the right for Source, Destination, Feed and Redundancy.

## Feed A and Feed B

You may find **Feed A**, **Feed B**, both, or neither. The **A+B** view can display both routes together.

If the screen says **Feed A · Configured** and **Feed B · Not configured**, only one route is recorded in Site Mapper in that example.

![Simple explanation of a recorded power connection](/help/diagrams/en/power.svg)

## What Configured means

**Configured means the route is recorded.** It does not by itself prove that current is flowing, that physical wiring is correct, or that redundancy has been certified.

## Record a connection (authorized users only)

1. Confirm the two physical endpoints with the responsible person.
2. Select a free **POWER OUTPUT** and the action to connect a load.
3. Choose the destination Equipment and its **POWER INPUT**.
4. Review both ends and choose **Feed A** or **Feed B** as appropriate.
5. Confirm the physical connection only after the information has been verified.

## If the terminal is already CONNECTED

Do not create another connection for the same endpoint. Open the existing Power Path and review what is recorded.

**Expected result:** you can identify source, destination and Feed, and distinguish a recorded route from an actual electrical measurement.

[View live equipment readings](telemetria.md).
