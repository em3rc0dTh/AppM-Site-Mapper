# Connect readings to a breaker

A breaker can already be visible in its Panel while **its measurements are not linked yet**. Site Mapper uses MQTT for these circuit readings; you do not configure the broker from this screen.

![Signal to breaker](/help/diagrams/en/mqtt.svg)

![Panel with breakers installed in specific positions](/help/screenshots/panel-breakers.png)

## Before you start

You need a **Panel** with the breaker installed in its actual position. The person responsible must have confirmed which data source and signal point measure that breaker.

## Connect the breaker to its readings

1. Open the **Panel** containing the breaker.
2. Find **MQTT POINT COMMISSIONING**.
3. Check **Source** and the point **Prefix**.
4. Find the row for the breaker's installed position.
5. Review the suggested point. **Do not confirm it just because its number matches the slot**.
6. Once the physical mapping has been checked, select the verification checkbox.
7. Select **Confirm and commission point**.
8. Use **Refresh commissioning** to update the result if needed.

## Check the result

After the mapping is confirmed, open the breaker and check **Telemetry**. This is where you verify whether data is actually arriving.

![Real example of a breaker with recent readings](/help/screenshots/breaker-live.png)

## What do 0/4 and 4/4 mean?

- **0/4:** no complete set of measurements has been linked yet.
- **4/4:** voltage, current, power and energy are mapped to this breaker.

**4/4 does not mean data is arriving right now.** Open the breaker and check **LIVE TELEMETRY** for recent readings.

## If there is a conflict

A source or point may already be linked to different equipment. Stop and ask the owner to check the mapping rather than overriding an existing association.

**You're done when:** the four measurements are linked to the verified breaker, and you can separately check whether readings are current.

[View readings](telemetria.md) · [Missing readings](verificacion.md).
