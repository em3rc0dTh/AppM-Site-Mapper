# Create a panel and add breakers

A **Panel** has numbered positions where you can install circuit breakers. First make sure you have the main equipment and the component where the Panel belongs.

![Empty Panel with 24 available positions and no installed breakers](/help/screenshots/panel-empty.png)

## Before you start

- Open the correct **Device** and the component that will contain the Panel.
- Check that you're working in the intended installation.
- Adding equipment requires an account with editing access.

## Create the Panel

1. In **PHYSICAL COMPOSITION**, select **+ ADD EQUIPMENT**.
2. Choose a suitable template from **FROM WAREHOUSE**, or use **ONE-OFF**.
3. For an individual component, enter its name and select the **PANEL** type.
4. Choose **POSITIONAL** to enable numbered positions.
5. Set the capacity that matches the real Panel, for example **24** when appropriate.
6. Save using **Create and install** or **Install Equipment**.
7. Open the Panel and check its number of positions.

## Add a breaker

1. In the Panel, open **INTERNAL COMPOSITION**.
2. Select **MANAGE POSITIONS**.
3. Choose the intended free slot, for example **POSITION 01 · AVAILABLE**.
4. Select the option to add Equipment in **that slot**.
5. Choose **CIRCUIT_BREAKER**, fill in its details and save.
6. Confirm that the slot now shows **OCCUPIED**.

![The same type of Panel after breakers are installed in specific positions](/help/screenshots/panel-breakers.png)

## What do 24 positions mean?

That is the Panel's capacity, not the number of installed breakers. A 24-position Panel can have only one occupied slot.

## Check the breaker

![Individual breaker with recent V, A, W and kWh readings](/help/screenshots/breaker-live.png)

After installation, open the breaker to verify its identity, position and, when linked to a source, its readings.

## If a position is unavailable

Do not install equipment on top of an existing item. Review what occupies the slot and confirm the intended position with the person responsible.

**You're done when:** the Panel is inside the intended Device and each breaker appears in the correct slot.

[Next: terminals](terminales-y-entradas.md) · [MQTT readings](vincular-mqtt.md).
