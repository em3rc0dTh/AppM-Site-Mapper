# Create a site, building or room

Spaces are created **from the item that contains them**. For example, a Site belongs to a Network and a Room belongs to a Level.

## Before you start

Open **EXPLORE** and check that you are in the correct installation. If creation buttons are missing, your account may have viewing access only.

## Create a Site

![Real example of the Create Site action](/help/screenshots/create-site.png)

_Inside a Network, use **+ CREATE SITE**. Enter a name first, then define its boundary._

1. Open the **Network** that will contain the Site.
2. Select **+ CREATE SITE**.
3. Enter a clear name.
4. Select **Define boundary**.

![Real Site boundary editor](/help/screenshots/draw-site-boundary.png)

5. In **Draw / select**, choose the boundary points in order. You need **at least 3 points**.
6. Close the outline and check that the edges do not cross.
7. If a point is wrong, select and move it. Use **Undo**, **Clear** or **Remove vertex** when appropriate.
8. Select **Finish boundary** and return to the creation form.
9. Confirm the Site creation.
10. Check the tree on the left: the new Site should appear inside the intended Network.

**Important:** this flow does not use **SAVE LAYOUT**. That action saves the arrangement inside a Room.

## Create a Structure and Level

![Real form for creating a Structure inside a Site](/help/screenshots/create-structure.png)

1. Open the correct Site.
2. Select **+ CREATE STRUCTURE**, enter its name and define its boundary.
3. Open the new Structure.

![Real form for creating a Level inside a Structure](/help/screenshots/create-level.png)

4. Select **+ CREATE LEVEL**, enter its name and confirm.

A Level organizes rooms; you do not draw another Level boundary during this step.

## Create a Room

![Real Create Room form](/help/screenshots/create-room.png)

1. Open the correct **Level**.
2. Select **+ CREATE ROOM**.
3. Enter the Room name.
4. Select **Define boundary**.
5. Draw a valid outline within the available space and confirm the creation.
6. Open the Room from the tree to verify it.

![How locations are organized](/help/diagrams/en/places.svg)

## If you cannot save

Check that the outline is closed, that its edges do not cross, and that the new space belongs to the parent you opened. If an action is missing, check your permissions.

**Expected result:** the new Site, Structure, Level or Room appears under the correct parent and remains there after a reload.

[Next: arrange a Room and place a rack](espacios-y-racks.md).
