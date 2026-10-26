# Arrange a room and place a rack

Inside a **Room**, Site Mapper displays a plan called the **Blueprint**. In normal mode you can inspect it; with editing access you can change its arrangement.

## Before editing

Open the correct Room and check its name. **EDIT ROOM** must be available for your account.

## Enter edit mode

![Real EDIT ROOM view and tools](/help/screenshots/edit-room.webp)

1. Select **EDIT ROOM**.
2. The top of the editor shows **EDIT · UNSAVED DRAFT**. Your changes have not been saved yet.
3. The side panel can include:
   - **EDIT ROOM BOUNDARY** to change the Room outline.
   - **+ Draw Bay / Cluster** to draw an area.
   - **+ Place Rack** to place a rack.
   - **+ Place Empty Position** to reserve an empty location.
   - **SELECT / EDIT** to select an existing item.

## Place a rack

1. Open **+ Place Rack**.
2. Enter a clear name.
3. Choose the correct **Bay / Cluster**.
4. Review width, depth and U capacity when requested.
5. Place the rack on the canvas.
6. Check that it is inside the intended area.
7. Select **SAVE LAYOUT**.

**SAVE LAYOUT makes the arrangement persistent.** If you select **Cancel** before saving, draft changes should not be treated as confirmed.

## Open the rack after saving

![Real Rack Focus view inside a Room](/help/screenshots/rack-focus.webp)

When you select a rack you may see different actions:

- **Open rack focus**: opens a quick rack view.
- **OPEN RACK ELEVATION**: shows its U occupancy.
- **TRACE POWER**: follows its recorded power connections.
- **INSPECT**: shows item information without moving it.

Do not confuse **opening or inspecting** with **editing the layout**.

## If Remove selected is blocked

The item may contain other objects. For example, a Position can hold a Rack and a Rack can hold Equipment. Check dependencies first; do not remove items in a cascade just to make saving possible.

**Expected result:** after leaving and returning to the Room, the rack is still in the saved position and can be opened from the plan.

[Next: find and organize rack equipment](equipos-y-posiciones.md).
