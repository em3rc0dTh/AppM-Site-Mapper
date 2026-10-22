Sí. Lo haría como **wireframe contractual**, no como mockup decorativo. Mantendría el mismo shell casi todo el tiempo para que Site Mapper se sienta como **un único instrumento de navegación física**, no como módulos desconectados. La jerarquía base sigue siendo `Network → Site → Structure → Level → Room → Rack → Device`, y desde ahí se abren las proyecciones Blueprint, Rack/CAS, Power y Telemetry. :chatgpt-content-reference{index="0"}

## Mapa general de pantallas

```text
00 LOGIN
   │
   ▼
01 NETWORK
   │
   ▼
02 SITE
   │
   ▼
03 STRUCTURE
   │
   ▼
04 LEVEL
   │
   ▼
05 ROOM BLUEPRINT ──────────────┐
   │                            │
   ├──► 06 ROOM EDIT            │
   │                            │
   └──► 07 RACK FOCUS           │
             │                  │
             ▼                  │
        08 RACK ELEVATION       │
             │                  │
             ▼                  │
        09 DEVICE FOCUS         │
             │                  │
     ┌───────┴─────────┐        │
     ▼                 ▼        │
10 POWER PATH     13 TELEMETRY ◄─┘
     │
     ▼
11 BDFB
     │
     ▼
12 PANEL / BREAKER

14 HOME / OPERATIONS WORKSPACE
15 GLOBAL SEARCH
16 SETTINGS / ADMIN
```

El golden path contractual actual ya exige esa progresión desde Network hasta Blueprint, Rack, CAS, BDFB, Breaker, Power Path y Telemetry. :chatgpt-content-reference{index="1"}

---

# SCREEN 00 — LOGIN

El Home operativo exige una sesión autenticada; no se muestra información antes del login.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                                                                              │
│                              SITE MAPPER                                     │
│                                                                              │
│                     Physical Infrastructure                                  │
│                                                                              │
│                    ┌────────────────────────┐                                │
│                    │ Email / Username       │                                │
│                    └────────────────────────┘                                │
│                                                                              │
│                    ┌────────────────────────┐                                │
│                    │ Password               │                                │
│                    └────────────────────────┘                                │
│                                                                              │
│                    ┌────────────────────────┐                                │
│                    │        SIGN IN         │                                │
│                    └────────────────────────┘                                │
│                                                                              │
│                                                                              │
│                          System ● Available                                  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

Al autenticar:

```text
LOGIN
  │
  └──► HOME / WORKSPACE
          ├── restaurar contexto disponible
          └── navegar a Network / vistas físicas cuando el usuario lo elija
```

**HOME ya forma parte del contrato revisado.** Véase SCREEN 14 — HOME / OPERATIONS WORKSPACE: tarjetas pineadas BDFB con promedio de descendientes y vista de potencia del sistema.

---

# SCREEN 01 — NETWORK

Aquí empieza Site Mapper realmente.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER                         Network / Global                    [⌕ Search]       EXPLORE   │
├─────────────────────┬─────────────────────────────────────────────────────────────┬────────────────┤
│ TOPOLOGY            │ NETWORK                                                     │ SITE PROPERTIES│
│                     │                                                             │    GENERAL     │
│ ▼ Network           │                                                             │   INFORMATION  │
│   ├─ Site LIM       │                    GLOBAL NETWORK                           │                │
│   ├─ Site ARE       │                                                             │ Sites       3  │
│   └─ Site TRU       │             ┌───────────────────┐                           │ Structures  8  │
│                     │             │                   │                           │ Rooms      24  │
│                     │             │     SITE LIM      │                           │                │
│                     │             │                   │                           │   TELEMETRY    │
│                     │             └───────────────────┘                           │   INFORMATION  │
│                     │                                                             │                │
│                     │    ┌───────────────────┐     ┌───────────────────┐          │   NETWORK      │
│                     │    │     SITE ARE      │     │     SITE TRU      │          │   HEALTH       │
│                     │    └───────────────────┘     └───────────────────┘          │   DATA-----    │
│                     │                                                             │                │
│                     │                                                             │                │
├─────────────────────┴─────────────────────────────────────────────────────────────┴────────────────┤
│ Network                                                          Fit View     100%                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Click:** Actualiza información de la derecha solo para ese SITE.
**DOUBLE Click:** selecciona Site.

```text
SITE LIM
════════

Location / identity
Structures       3
Levels           8
Rooms           12

[ OPEN SITE ]
```

Doble clic o `Open Site` → Screen 02.

El árbol, breadcrumb y deep-link forman parte explícita del Core Topology previsto. :chatgpt-content-reference{index="2"}

---

# SCREEN 02 — SITE

Ahora vemos **qué contiene este Site**. --> Repite la misma estructura que el site de network, con información a la derecha propia de ese site... más la lógica de click, doble click

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER                         Network / LIMA                      [⌕ Search]       EXPLORE   │
├─────────────────────┬─────────────────────────────────────────────────────────────┬────────────────┤
│ TOPOLOGY            │ SITE: LIMA                                                  │ INSPECTOR      │
│                     │                                                             │                │
│ ▼ Network           │                                                             │ SITE LIM       │
│   ▼ Lima            │                                                             │                │
│     ├─ Building A   │        ┌────────────────────────────┐                       │ Code    LIM    │
│     ├─ Building B   │        │                            │                       │                │
│     └─ DC Hall      │        │        BUILDING A          │                       │ Structures  3  │
│                     │        │                            │                       │ Levels      8  │
│                     │        └────────────────────────────┘                       │ Rooms       12 │
│                     │                                                             │                │
│                     │                                                             │                │
│                     │            ┌──────────────────┐                             │                │
│                     │            │     DC HALL      │                             │                │
│                     │            └──────────────────┘                             │                │
│                     │                                                             │ [OPEN]         │
│                     │                                                             │                │
├─────────────────────┴─────────────────────────────────────────────────────────────┴────────────────┤
│ Site LIM                                                         Fit View     100%                 │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Importante: si no tenemos geometría real del Site, **no fingimos que esto es un plano arquitectónico**. Puede ser una representación topológica. La vista está dibujada en un canvas por tanto, siempre muestra salvo que no seteemos nada aún.

---

# SCREEN 03 — STRUCTURE

Entramos a una estructura.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER                         Network / LIMA / Building A         [⌕ Search]       EXPLORE   │
├─────────────────────┬─────────────────────────────────────────────────────────────┬────────────────┤
│ TOPOLOGY            │ BUILDING A                                                  │ INSPECTOR      │
│                     │                                                             │                │
│ ▼ Lima              │                          ROOF                               │ BUILDING A     │
│   ▼ Building A      │                     ┌──────────────┐                        │                │
│     ├─ Level 03     │                     │   LEVEL 03   │                        │ Levels     4   │
│     ├─ Level 02     │                     └──────┬───────┘                        │ Rooms     18   │
│     ├─ Level 01     │                            │                                │                │
│     └─ Basement     │                     ┌──────▼───────┐                        │                │
│                     │                     │   LEVEL 02   │                        │                │
│                     │                     └──────┬───────┘                        │                │
│                     │                            │                                │                │
│                     │                     ┌──────▼───────┐                        │                │
│                     │                     │   LEVEL 01   │                        │                │
│                     │                     └──────┬───────┘                        │                │
│                     │                            │                                │                │
│                     │                     ┌──────▼───────┐                        │                │
│                     │                     │  BASEMENT    │                        │                │
│                     │                     └──────────────┘                        │                │
├─────────────────────┴─────────────────────────────────────────────────────────────┴────────────────┤
│ Building A                                                                                         │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Es navegación jerárquica. Todavía **no estamos en Blueprint**. --> Estos "levels" usualmente se setean al crear el site, sin embargo solo se indican expresamente en texto, ya que cada "level" toma la forma física del site

---

# SCREEN 04 — LEVEL

Este es el puente hacia el espacio físico.
Se encuentra delimitado por la forma del Structure. Y me permite visualizar en la parte izquierda los levels presentes para moverme entre ellos (así no tengan data)

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER               ... / Building A / Level 02                      [⌕]          EXPLORE    │
├─────────────────────┬─────────────────────────────────────────────────────────────┬────────────────┤
│ TOPOLOGY            │ LEVEL 02                                                    │ INSPECTOR      │
│                     │                                                             │                │
│ ▼ Building A        │    ┌───────────────────────────────┐                        │ LEVEL 02       │
│   ▼ Level 02        │    │                               │                        │                │
│     ├─ Room 201     │    │          ROOM 201             │                        │ Rooms      4   │
│     ├─ Room 202     │    │                               │                        │                │
│     ├─ Room 203     │    └───────────────────────────────┘                        │                │
│     └─ Room 204     │                                                             │                │
│                     │              ┌────────────────────────────┐                 │                │
│                     │              │                            │                 │                │
│                     │              │          ROOM 202          │                 │                │
│                     │              │                            │                 │                │
│                     │              └────────────────────────────┘                 │                │
│                     │                                                             │                │
│                     │     ┌───────────────┐           ┌───────────────┐           │                │
│                     │     │   ROOM 203    │           │   ROOM 204    │           │                │
│                     │     └───────────────┘           └───────────────┘           │                │
├─────────────────────┴─────────────────────────────────────────────────────────────┴────────────────┤
│ Level 02                                                                                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Click `Room 202` → Inspector.
Un click -> **información del level, cantidad de bahías, etc)
Doble click → **el frame principal de Site Mapper**.

---

# SCREEN 05 — ROOM BLUEPRINT / EXPLORE

Este es el corazón.

El contrato actual ya establece grid físico de `600 × 600 mm`, coordenadas, room polygon, dimensiones, placement, snapping, posiciones vacías asignables, prevención de colisiones y zoom/pan. :chatgpt-content-reference{index="3"}
Recuerda que los racks no se colocan en el aire, tienen una bahía definida (que debe ser creada con anterioridad) y luego, toma una posición referencial al grid y la bahía en cuestión.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER           Lima / Building A / L02 / Room 202               [⌕]      [ EXPLORE ▼ ]      [•••]    │
├───────────────────┬─────────────────────────────────────────────────────────────────────┬───────────────────┤
│ TOPOLOGY          │ ROOM 202 — BLUEPRINT                                                │ INSPECTOR         │
│                   │                                                                     │                   │
│ ▼ Lima            │       01      02      03      04      05      06      07           │ ROOM 202          │
│   ▼ Building A    │    ┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐     │                   │
│     ▼ Level 02    │ A  │       │       │       │       │       │       │       │     │ Devices: #Devices |
│       ● Room 202  │    ├───────┼───────┼───────┼───────┼───────┼───────┼───────┤     │                   │
│       ○ Room 203  │ B  │       │┌─────┐│       │       │┌─────┐│       │       │     │                   │
│                   │    │       ││R-021││       │       ││R-025││       │       │     │ Grid DEFAULT      │
│                   │    ├───────┼└─────┘┼───────┼───────┼└─────┘┼───────┼───────┤     │ 600 × 600 mm      │
│                   │ C  │       │       │       │       │       │       │       │     │                   │
│                   │    ├───────┼───────┼───────┼───────┼───────┼───────┼───────┤     │ Bahías       3   │
│                   │ D  │       │       │              ┌─────┐           │       │    │ Racks        12   │
│                   │    │       │       │              │R-023│           │       │    │ Free pos.     8   │
│                   │    ├───────┼───────┼───────┬──────└─────┘──┬───────┼───────┤     │                   │
│                   │ E  │       │       │       │       │       │       │       │     │                   │
│                   │    ├───────┼───────┼───────┼───────┼───────┼───────┼───────┤     │                   │
│                   │ F  │       │       │┌─────┐│       │       │       │       │     │                   │
│                   │    │       │       ││R-030││       │       │       │       │     │                   │
│                   │    └───────┴───────┴└─────┘┴───────┴───────┴───────┴───────┘     │                   │
│                   │                                                                     │                   │
│                   │                                    ┌────────────┐                   │                   │
│                   │                                    │ MINI MAP   │                   │                   │
│                   │                                    │ ░░░▓░░░░   │                   │                   │
│                   │                                    └────────────┘                   │                   │
├───────────────────┴─────────────────────────────────────────────────────────────────────┴───────────────────┤
│ x 8.40m · y 3.60m      GRID 600mm       [−] 72% [+]     [FIT ROOM]      ● SYNCED                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Ahora seleccionamos R-023.

```text
                                        ┌─────────────────────────┐
                                        │ RACK R-023              │
                                        │                         │
                                        │ Position    D05         │
                                        │ Size        600×1200    │
                                        │ Height      42U         │
                                        │ Occupied    31U         │
                                        │                         │
                                        │ Power       A ✓  B ✓    │
                                        │ Telemetry   ● LIVE      │
                                        │                         │
                                        │ [ OPEN RACK ]           │
                                        │ [ POWER ] [ TELEMETRY ] │
                                        └─────────────────────────┘
```

**Click = seleccionar y mostrar información.**

**Doble click = profundizar.**

No modal.

No cambio mental de aplicación.

---

# SCREEN 06 — ROOM BLUEPRINT / EDIT

Mismo canvas. Cambia el modo. (El "snap" solo cambia la dimensión y la posición, si quieres cambiarlo de bahía, debes eliminarlo y crearlo nuevamente dado que nos pdoemos chocar con problemas de sobreposicionamiento) y cuando se coloca en otro lugar debe ser un lugar vacío

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER   ... / Room 202                   [⌕]        [ EDIT ● ]             UNSAVED ●      [SAVE]     │
├───────────────────┬─────────────────────────────────────────────────────────────────────┬───────────────────┤
│ OBJECTS           │ ROOM 202 — BLUEPRINT                                                │ PROPERTIES        │
│                   │                                                                     │                   │
│ + Rack            │        [SELECT] [PLACE] [MOVE] [ASSIGN]                             │ RACK R-023        │
│ + Position        │                                                                     │                   │
│                   │      01      02      03      04      05      06                    │ Position D05      │
│ Existing          │   ┌───────┬───────┬───────┬───────┬───────┬───────┐              │                   │
│                   │ A │       │       │       │       │       │       │              │ Width   600mm    │
│ □ R-021           │   ├───────┼───────┼───────┼───────┼───────┼───────┤              │ Depth  1200mm   │
│ □ R-023           │ B │       │       │       │       │       │       │              │                   │
│ □ R-025           │   ├───────┼───────┼───────┼───────┼───────┼───────┤              │ Coordinates       │
│                   │ C │       │       │       │       │       │       │              │ x 8.40m           │
│                   │   ├───────┼───────┼───────┼───────┼───────┼───────┤              │ y 3.60m           │
│                   │ D │       │       │       │   ┏━━━━━━━┓   │       │              │                   │
│                   │   │       │       │       │   ┃ R-023 ┃   │       │              │ [REVERT]          │
│                   │   ├───────┼───────┼───────┼───┗━━━━━━━┛───┼───────┤              │                   │
│                   │ E │       │       │       │       ↑ SNAP   │       │              │                   │
│                   │   └───────┴───────┴───────┴───────┴───────┴───────┘              │                   │
│                   │                                                                     │                   │
├───────────────────┴─────────────────────────────────────────────────────────────────────┴───────────────────┤
│ SNAP ✓    COLLISION ✓     x 8.40m / y 3.60m        [UNDO] [REDO]             [CANCEL] [SAVE CHANGES]      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Movimiento inválido:

```text
                     ┌──────────────┐
                     │   R-023      │
                     │      ✕       │
                     └──────────────┘

                COLLISION WITH R-025
                    NOT ALLOWED
```

Esto no es sólo UI: geometry, snapping y collision deben vivir fuera de React según el propio contrato. :chatgpt-content-reference{index="4"}

---

# SCREEN 07 — RACK FOCUS

Al abrir R-023 no destruyo Room.

**Abro un popup para visualizar el rack en cuestión**

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← ROOM 202        Room 202 / Rack R-023                                               EXPLORE      │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ TOPOLOGY           │ RACK FOCUS                                                 │ RACK R-023       │
│                    │                                                            │                  │
│ Room 202           │               ·   ·   ·   ·   ·                            │ Identity         │
│ ├─ R-021           │                                                            │ Rack R-023       │
│ ├─ R-022           │                    ┏━━━━━━━━━━┓                            │                  │
│ ├─ ● R-023         │                    ┃          ┃                            │ Position D05     │
│ ├─ R-024           │                    ┃  R-023   ┃                            │ 42U              │
│ └─ R-025           │                    ┃          ┃                            │                  │
│                    │                    ┃          ┃                            │ Occupancy 74%    │
│                    │                    ┗━━━━━━━━━━┛                            │                  │
│                    │                                                            │                  │
│                    │            Room context remains visible                    │                  │
│                    │            but visually de-emphasized                      │                  │
│                    │                                                            │ Telemetry ● LIVE │
│                    │                                                            │                  │
│                    │                                                            │ [ELEVATION]      │
│                    │                                                            │ [POWER PATH]     │
│                    │                                                            │ [TELEMETRY]      │
├────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┤
│ Position D05                  Room 202                  [ LOCATE ]                                  │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

NOTA: SE PRESENTAN LOS DEVICES PRESENTES EN EL RACK, SE PRESENTAN LOS SLOTS VACÍOS COMO "AVAILABLE" Y, recuerda en cada asociación de un device (BDFB, OCCUPIED SPACE, ETC) SIEMPRE SE DEJA UN SLOT ARRIBA Y UNO ABAJO PARA MONTAJE.
---

# SCREEN 08 — RACK ELEVATION

Ahora cambiamos **proyección**, no producto. popup.

Top View → Front View.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← ROOM 202       Rack R-023 / ELEVATION                                            EXPLORE         │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ RACK               │ FRONT ELEVATION                                            │ INSPECTOR        │
│                    │                                                            │                  │
│ Overview           │      FRONT                       REAR                       │ RACK R-023       │
│ ● Elevation        │                                                            │                  │
│ Power              │ 42U ┌──────────────────┐                                    │ Capacity 42U     │
│ Telemetry          │ 41U │ AVAILABLE        │                                    │ Used     31U     │
│                    │ 40U ├──────────────────┤                                    │ Free      7U     │
│                    │ 39U │██████████████████│ SERVER-01                          │ Reserved  4U     │
│                    │ 38U │██████████████████│                                    │                  │
│                    │ 37U │██████████████████│                                    │                  │
│                    │ 36U ├──────────────────┤                                    │                  │
│                    │ 35U │▒▒▒ RESERVED ▒▒▒▒│                                    │                  │
│                    │ 34U │▒▒▒ RESERVED ▒▒▒▒│                                    │                  │
│                    │ 33U ├──────────────────┤                                    │                  │
│                    │ 32U │▓▓▓ SWITCH-01 ▓▓▓│                                    │                  │
│                    │ 31U ├──────────────────┤                                    │                  │
│                    │ ... │                  │                                    │                  │
│                    │ 02U │ AVAILABLE        │                                    │                  │
│                    │ 01U │ AVAILABLE        │                                    │                  │
│                    │     └──────────────────┘                                    │                  │
├────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┤
│ AVAILABLE 7U        RESERVED 4U         EQUIPPED 31U             [ EDIT CAS ]                       │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Los estados actuales del CAS son `AVAILABLE / RESERVED / EQUIPPED`, con reglas para rangos U, tamaño, clearance, mount/split/free. :chatgpt-content-reference{index="5"}

Seleccionamos `SERVER-01`.
UN CLICK, INFORMACIÓN ACTUALIZADA PARA ESE DEVICE(SERVER) EN CUESTIÓN.
DOS CLICKS, PROFUNDIZAR, DEEP, EN UN SIGUIENTE POPUP MOSTRANDO LA JERARQUÍA EN ÁRBOL.
---

# SCREEN 09 — DEVICE FOCUS

No abrimos otra página llena de tabs.

El Rack permanece visible.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← RACK R-023      SERVER-01                                                          EXPLORE       │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ RACK               │ ELEVATION                                                  │ DEVICE           │
│                    │                                                            │                  │
│ 42U                │ 42U ┌─────────────────────────────┐                         │ SERVER-01        │
│ 41U                │ 41U │                             │                         │                  │
│ 40U                │ 40U ├─────────────────────────────┤                         │ Identity         │
│ 39U                │ 39U ┃                             ┃ ◄ SELECTED              │ Model       ...  │
│ 38U  SERVER-01     │ 38U ┃          SERVER-01          ┃                         │ Serial N.   ...  │
│ 37U                │ 37U ┃                             ┃                         │                  │
│ 36U                │ 36U ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛                         │ Placement        │
│                    │                                                            │ Rack R-023       │
│                    │                                                            │ U37—U39          │
│                    │                                                            │                  │
│                    │                                                            │ Power            │
│                    │                                                            │ A ●              │
│                    │                                                            │ B ●              │
│                    │                                                            │                  │
│                    │                                                            │ Telemetry        │
│                    │                                                            │ ● LIVE           │
│                    │                                                            │                  │
│                    │                                                            │ [TRACE POWER]    │
│                    │                                                            │ [LIVE DATA]      │
│                    │                                                            │ [LOCATE IN ROOM] │
├────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┤
│ Lima › Building A › L02 › Room 202 › Rack R-023 › U37-U39                                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Aquí se respetan las separaciones contractuales entre identidad, especificaciones, placement, operational state y telemetry state. :chatgpt-content-reference{index="6"}
Nota: En la parte izquierda ves toda la jerarquía en árbol, no los racks occupied.

---

# SCREEN 10 — POWER PATH

`TRACE POWER`.

El centro cambia de blueprint físico a **grafo eléctrico**. Ok, este paso muestra en un popup la data siguiente, cuando se selecciona un circuit breaker con telemetría, al hacer doble click abre esta pestaña.
¿Qué hace? te muestra el punto A y punto B de ese circuit breaker, de dónde viene y de dónde se provisiona.

El shell no cambia.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← SERVER-01       POWER PATH                               [A+B ▼]        ● HEALTHY                 │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ POWER TREE         │ POWER CANVAS                                               │ INSPECTOR        │
│                    │                                                            │                  │
│ ▼ SERVER-01       │                    UTILITY / SOURCE                         │ PATH A           │
│   ├─ Feed A        │                          │                                 │                  │
│   └─ Feed B        │                          ▼                                 │ Source           │
│                    │                    ┌────────────┐                           │ BDFB-A           │
│ ▼ BDFB-A          │                    │  BDFB-A    │                           │                  │
│   └─ Panel A1      │                    └─────┬──────┘                           │ Panel A1         │
│      └─ BRK-08     │                          │                                 │ Breaker 08       │
│                    │                          ▼                                 │                  │
│ ▼ BDFB-B          │                    ┌────────────┐                           │ Destination      │
│   └─ Panel B1      │                    │ PANEL A1   │                           │ SERVER-01        │
│      └─ BRK-11     │                    └─────┬──────┘                           │                  │
│                    │                          │                                 │ Valid       ✓    │
│                    │                          ▼                                 │ Redundant   ✓    │
│                    │                    ┌────────────┐                           │                  │
│                    │                    │ BREAKER 08 │                           │ [OPEN BDFB]      │
│                    │                    └─────┬──────┘                           │                  │
│                    │                          │                                 │                  │
│                    │                          ▼                                 │                  │
│                    │                    ┏━━━━━━━━━━━━┓                           │                  │
│                    │                    ┃ SERVER-01  ┃                           │                  │
│                    │                    ┗━━━━━━━━━━━━┛                           │                  │
├────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┤
│ FEED A ● ACTIVE       FEED B ● ACTIVE         REDUNDANCY ✓       [ SHOW BOTH ]                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Y si seleccionamos `SHOW BOTH`:

```text
                SOURCE A                            SOURCE B
                   │                                   │
                   ▼                                   ▼
               ┌────────┐                          ┌────────┐
               │ BDFB-A │                          │ BDFB-B │
               └───┬────┘                          └───┬────┘
                   │                                   │
                   ▼                                   ▼
               PANEL A1                            PANEL B1
                   │                                   │
                   ▼                                   ▼
               BRK-08                              BRK-11
                   │                                   │
                   └──────────────┐    ┌───────────────┘
                                  ▼    ▼
                               SERVER-01
```

Eso representa el `source → feed → panel → breaker → destination` que el dominio de Power Path necesita modelar explícitamente. :chatgpt-content-reference{index="7"}

---

# SCREEN 11 — BDFB · Wireframe contractual actualizado (22/10/2026)

**Estado de referencia:** vista del BDFB-01 validada visualmente después de PR #95 (Inspector por pestañas) y PR #96 (panel seleccionado con 24 posiciones). Este documento sustituye el wireframe genérico anterior de `BDFB-A`. **No modifica la interfaz ni los registros físicos**; documenta su organización presente para las próximas reformulaciones.

**Navegación:** `TELXIUS-LURIN-1 → EDIFICIO-01-TELXIUS → LEVEL-01 → SALA DE TRANSMISIONES → Rack-01-BDFB → BDFB-01`.

## 11.1 — Frame completo (tres columnas)

La izquierda es navegación física; el centro ocupa el gabinete y la inspección del panel seleccionado; la derecha contiene un Inspector dividido en pestañas, con **Gráficas → 24H → Corriente** activo en la captura de referencia.

```text
+-------------------------+------------------------------------------------------------------------------+---------------------------------------------------+
| SITE MAPPER             | TELXIUS > EDIFICIO-01 > LEVEL-01 > SALA > RACK-01 > BDFB-01                  | SEARCH  EXPLORE  WAREHOUSE  ADMIN                 |
+-------------------------+------------------------------------------------------------------------------+---------------------------------------------------+
| TOPOLOGY                | BDFB PHYSICAL VIEW                                                           | INSPECTOR                                         |
|                         |                                                                              | BDFB-01  /  TELXIUS-LURIN-1                       |
| v SALA TRANSMISIONES    | +--------------------------------------------------------------------------+ | [Resumen][Entradas][*Graficas][Config.]           |
|   v BAY-01              | | CHASSIS: BDFB-01                                                       |   |                                                   |
|     v RACK-01-BDFB      | | SHELF: BDFB SHELF                                                       |  | SNMP / TIMESCALEDB HISTORY                        |
|       * BDFB-01         | |   +----------------------------------+  +------------------------------+ | | [24H] [7D] [15D] [1M]                             |
|         > CHASSIS       | |   | FRAME-01                         |  | FRAME-02                     | | | [Voltaje] [*Corriente] [Potencia] [Energia]       |
|     > RACK-SWITCH       | |   |                                  |  |                              | | |                                                   |
|                         | |   | [* PANEL-01 : 3/24]             |  | [  PANEL-01 : 0/24]         | |   | +-----------------------------------------------+ |
|                         | |   |    OPEN PANEL COMPOSITION ->    |  |    OPEN PANEL COMPOSITION -> | |  | | CURRENT - SHUNTS A/B                          | |
|                         | |   |                                  |  |                              | | | |                                               | |
|                         | |   | [  PANEL-02 : 0/24]             |  | [  PANEL-02 : 0/24]         | |   | |   blue:  A/LAB    green:  B/LAB             |   |
|                         | |   |    OPEN PANEL COMPOSITION ->    |  |    OPEN PANEL COMPOSITION -> | |  | |       [Actual TimescaleDB series]            |  |
|                         | |   +----------------------------------+  +------------------------------+ | | |                                               | |
|                         | +--------------------------------------------------------------------------+ | | A: 219.9 A                B: 212.4 A          | |
|                         |                                                                              | +-----------------------------------------------+ |
|                         | +--------------------------------------------------------------------------+ | Estimated energy: 34.8614 kWh (LAB example)       |
|                         | | SELECTED PANEL / CIRCUIT POSITIONS                                       | | Observed: 182.1 feed-minutes across A + B         |
|                         | | FRAME-01 / PANEL-01                 [OPEN PANEL COMPOSITION ->]          | | No extrapolation over missing periods             |
|                         | |                                                                          | |                                                   |
|                         | | [3 INSTALLED]    [21 AVAILABLE]    [24 POSITIONS]                        | | MQTT / DESCENDANT EQUIPMENT HISTORY               |
|                         | |                                                                          | | [24H] [7D] [15D] [1M]                             |
|                         | | [01*] [02*] [03*] [04 ] [05 ] [06 ] [07 ] [08 ] [09 ] [10 ] [11 ] [12 ]  | | VOLTS / AMPS / POWER / ENERGY (separate source)   |
|                         | | [13 ] [14 ] [15 ] [16 ] [17 ] [18 ] [19 ] [20 ] [21 ] [22 ] [23 ] [24 ]  | |                                                   |
|                         | |                                                                          | |                                                   |
|                         | | INSTALLED CIRCUITS                                                       | |                                                   |
|                         | | 01   BDFB-01-PANEL-01-CB-01       NETWORK BOARD / MQTT bound             | |                                                   |
|                         | | 02   GRTLuren3 PSU A1            No destination / MQTT bound            |  |                                                   |
|                         | | 03   GRTLuren3 PSU A0            No destination / MQTT bound            |  |                                                   |
|                         | +--------------------------------------------------------------------------+ |                                                   |
|                         | [+ CREATE EQUIPMENT]                                                         |                                                   |
+-------------------------+------------------------------------------------------------------------------+---------------------------------------------------+
```

**Leyenda:** `*` = panel seleccionado / breaker instalado. Los 24 slots son el inventario del panel, no una afirmación sobre qué está energizado. Las curvas son marcadores del historial persistido, no series inventadas. Las cifras del laboratorio son _un ejemplo de una captura_ y deben cambiar con nuevas lecturas.

## 11.2 — Inspector: cada pestaña por separado

El encabezado `BDFB-01 / TELXIUS-LURIN-1` y la navegación `Resumen | Entradas | Gráficas | Config.` siguen disponibles al cambiar de pestaña. **Una sola pestaña está activa a la vez**.

### A. Resumen — visión operativa

```text
+----------------------------------------------------------+
| BDFB-01 · RESUMEN                                        |
+----------------------------------------------------------+
| [Resumen] [Entradas] [Gráficas] [Config.]                |
+----------------------------------------------------------+
| SNMP · INCOMING DC FEEDS           [LAB SIMULATED]       |
|                                                          |
| +------------------------+------------------------+      |
| | CURRENT 442.40 A       | SHUNTS REPORTING 2/2   |      |
| +------------------------+------------------------+      |
| | RATED CAPACITY: --     | INPUT UTILIZATION: --  |      |
| +------------------------+------------------------+      |
| | INPUT POWER: -- (physical total unavailable)    |      |
| +-------------------------------------------------+      |
| PHYSICAL CONFIGURATION 2 · SHUNTS A/B                    |
| 2/2 DC inputs recorded; wiring verification pending      |
|                                                          |
| MQTT · DESCENDANT EQUIPMENT LIVE                         |
| +------------------------+------------------------+      |
| | AVG VOLTAGE 12.23 V    | AVG CURRENT 3.20 A     |      |
| +------------------------+------------------------+      |
| | AVG POWER 39.20 W      | AVG COUNTER 0.2740 kWh |      |
| +------------------------+------------------------+      |
| Live total power 117.59 W; 3 equipment reporting         |
| STATUS: descendant equipment telemetry received          |
+----------------------------------------------------------+
```

**Reglas:** el resumen presenta los shunts SNMP de entrada y, de manera separada, los promedios de `Equipment` descendiente recibidos por MQTT. La suma simulada del laboratorio no es una corriente certificada del gabinete. El contador MQTT de energía es acumulativo y su promedio no equivale al consumo del periodo.

### B. Entradas — identidad de cada shunt

```text
+----------------------------------------------------------+
| BDFB-01 · ENTRADAS                                       |
+----------------------------------------------------------+
| [Resumen] [Entradas] [Gráficas] [Config.]                |
+----------------------------------------------------------+
| SNMP · INCOMING DC FEEDS        [LAB SIMULATED]          |
| SIMULATED DATA / never certifies physical shunts         |
|                                                          |
| +-------------------------------------------------+      |
| | INPUT-SHUNT-A                  [LAB LIVE]       |      |
| | SIDE A                                          |      |
| | CURRENT: 214.80 A   VOLTAGE: -53.10 V          |       |
| | Controller: EMU-DELTA-BFDB-01                   |      |
| | Current OID: ...2026.48.1.1.0                  |       |
| | Panels: FRAME-01 PANEL-01 + PANEL-02           |       |
| +-------------------------------------------------+      |
| +-------------------------------------------------+      |
| | INPUT-SHUNT-B                  [LAB LIVE]       |      |
| | SIDE B                                          |      |
| | CURRENT: 207.50 A   VOLTAGE: -53.40 V          |       |
| | Controller: EMU-DELTA-BFDB-01                   |      |
| | Current OID: ...2026.48.1.2.0                  |       |
| | Panels: FRAME-02 PANEL-01 + PANEL-02           |       |
| +-------------------------------------------------+      |
| Certified whole-BDFB total: unavailable                  |
| Commissioning/wiring verification still required         |
+----------------------------------------------------------+
```

**Reglas:** en Configuración 2 hay dos entradas físicamente independientes: `SHUNT A` alimenta los paneles `A1 + A2`; `SHUNT B`, `B1 + B2`. Cada entrada muestra corriente, voltaje, identidad del controlador, OID, última lectura y paneles alimentados. No duplicar estas mediciones como corriente por breaker. En Configuración 4, la identidad cambia a `A1/A2/B1/B2` y son cuatro shunts. La activación de laboratorio aparece cuando aplica; las claves SNMP nunca se muestran aquí.

### C. Gráficas — historia consultable

```text
+----------------------------------------------------------+
| BDFB-01 · GRÁFICAS                                       |
+----------------------------------------------------------+
| [Resumen] [Entradas] [Gráficas] [Config.]                |
+----------------------------------------------------------+
| SNMP · TIMESCALEDB HISTORY                               |
| [24H] [7D] [15D] [1M]      (period selector)             |
| [Voltaje] [CORRIENTE] [Potencia] [Energía]               |
|                                                          |
| +-------------------------------------------------+      |
| | CURRENT · SHUNTS A/B                            |      |
| |                                                 |      |
| | A/LAB   ~~~~~    B/LAB   ~~~~~                 |       |
| |                                                 |      |
| | (read-only chart from persisted samples)        |      |
| | A: 219.9 A                   B: 212.4 A         |      |
| +-------------------------------------------------+      |
| Estimated energy: 34.8614 kWh (observed only)            |
| Coverage: 182.1 feed-minutes across inputs               |
| Power: |V| * I; energy integrates valid samples          |
| Never extrapolate through >120s telemetry gaps           |
|                                                          |
| MQTT · DESCENDANT EQUIPMENT HISTORY                      |
| [24H] [7D] [15D] [1M]      (independent)                 |
| Voltage, current, power, energy-counter trends           |
| SNMP shunt measures != MQTT breaker readings             |
+----------------------------------------------------------+
```

**Reglas:** elegir una ventana `24H / 7D / 15D / 1M` y una sola magnitud `Voltaje / Corriente / Potencia / Energía` para SNMP. Se trazan las series A/B en la **misma gráfica** para comparar entradas. La sección MQTT inferior utiliza su propio selector temporal y su propia fuente, con las métricas de los equipos descendientes. `Power = |V| × I` y `Estimated Energy` son derivados: energía por integración trapezoidal solamente entre muestras próximas (brechas de hasta 120 s); no se atribuye energía en cortes largos y no se presenta como lectura de medidor Delta.

### D. Config. — mantenimiento e inventario

```text
+----------------------------------------------------------+
| BDFB-01 · CONFIG.                                        |
+----------------------------------------------------------+
| [Resumen] [Entradas] [Gráficas] [Config.]                |
+----------------------------------------------------------+
| CONFIGURE SNMP INPUTS                                    |
| Manage each shunt, panel assignment and OID              |
|                                                          |
| [OPEN DC INPUTS ON CHASSIS ->]                           |
|                                                          |
| v Advanced maintenance (collapsible)                     |
|   Hardware profile: ELTEK_BDCBB_CONFIG_2                 |
|   [USE CONFIG 2] [USE CONFIG 4]                          |
|   Per-port bindings / retire old OIDs                    |
|                                                          |
| INVENTORY & DIAGNOSTICS                                  |
| Type: BDFB           Physical shelves: 1                 |
| Location: TELXIUS    Physical frames: 2                  |
| Panels: 4            Breakers: 3                         |
| Feed A: Configured   Feed B: --                          |
| Telemetry: EXPLICIT BINDINGS                             |
|                                                          |
| Credential secrets stay inside collector runtime         |
| No SNMP keys/communities in browser                      |
+----------------------------------------------------------+
```

**Reglas:** el acceso habitual a edición está en `OPEN DC INPUTS ON CHASSIS →`, que abre el editor canónico de AccessPorts para conectar shunts, paneles y OIDs. Mantenimiento avanzado no sustituye el editor; permite cambiar el perfil físico y retirar mapeos obsoletos cuando esté autorizado. Confirmaciones de cableado y datos nominales siguen siendo responsabilidad de la instalación real.

## 11.3 — Interacciones del área central

```text
BDFB-01 (physical view)
  |
  +-- CHASSIS --> SHELF --> FRAME-01 --> PANEL-01 [SELECTED]
  |                                    \-> PANEL-02 [AVAILABLE]
  |                     \-> FRAME-02 --> PANEL-01 [AVAILABLE]
  |                                     \-> PANEL-02 [AVAILABLE]
  |
  +-- SELECT PANEL (click in physical diagram)
         |
         +-- Refresh the lower "SELECTED PANEL" preview
         |    +-- installed / available / total positions
         |    +-- P01 through P24 (only actual Equipment inventory)
         |    +-- installed breaker name and recorded Power Path destination
         |    +-- whether an explicit MQTT binding exists
         |
         +-- OPEN PANEL COMPOSITION --> canonical Equipment editor
         +-- click installed breaker --> breaker Equipment detail
```

En el BDFB de ejemplo hay **dos frames, dos paneles por frame y 24 posiciones por panel**. `FRAME-01/PANEL-01` contiene tres breakers y veintiuna posiciones libres; los otros paneles están vacíos en la captura, pero siguen existiendo en el inventario. Otros dispositivos pueden tener otra geometría: **no forzar la disposición de dos frames ni crear posiciones vacías adicionales**.

Los paneles se ordenan verticalmente **dentro de cada frame**. Al pulsar el panel solo se cambia el contenido del detalle inferior; la navegación a `/device/:panelId` ocurre únicamente al seguir `OPEN PANEL COMPOSITION`. El inspector SNMP no sustituye esta representación física.

## 11.4 — Matriz de procedencia y estados

| Área                                            | Fuente                                           | Evidencia visual esperada                      | Precaución                                        |
| ----------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------- |
| Chassis, frames, paneles, breakers y posiciones | Topología / Equipment persistidos                | Instalados, libres y nombre del breaker        | No inventar geometría ni breakers                 |
| Destino de breaker                              | Power Path explícito                             | Nombre de destino o `No connected destination` | Sin inferir cableado                              |
| Promedios descendientes                         | Bindings MQTT de Equipment                       | `MQTT LIVE` + promedio V/A/W/contador          | Son promedios de equipos, no carga de shunt       |
| Shunts SNMP de entrada                          | Lecturas del collector vía API                   | A/B o A1/A2/B1/B2 y sello temporal             | `LAB SIMULATED` no certifica instalación          |
| Histórico SNMP                                  | TimescaleDB, muestras persistidas por AccessPort | 24H / 7D / 15D / 1M y V/A/W/kWh                | Potencia y energía derivadas, sin rellenar cortes |
| Histórico de descendientes                      | Telemetría MQTT almacenada                       | Gráficas separadas de SNMP                     | No combinar fuentes o tipos de energía            |
| Commissioning                                   | Perfil, AccessPorts, OID y confirmaciones        | Editor del chassis / mantenimiento             | Nunca exponer secrets del collector               |

## 11.5 — Contrato de densidad y usabilidad

1. **Sin scroll infinito en Inspector:** `Resumen`, `Entradas`, `Gráficas` y `Config.` son secciones mutuamente excluyentes. Las pestañas se mantienen visibles durante el desplazamiento del Inspector.
2. **Sin espacio central desaprovechado:** gabinete arriba y panel enfocado abajo. No rellenar con tarjetas eléctricas repetidas.
3. **Selección local:** tocar `PANEL-01` cambia la inspección inferior, sin perder contexto de rack o sala; la acción `OPEN PANEL COMPOSITION →` abre detalle.
4. **Historial acotado:** los filtros del gráfico permiten comparar shunts por magnitud y periodo sin mostrar simultáneamente cuatro gráficos SNMP.
5. **Estados claros:** distinguir sin datos, no configurado, sin conexión, laboratorio sintético, lectura obsoleta y lectura verificada; no presentar un `0` falso para una medición desconocida.
6. **Accesibilidad:** las cuatro pestañas admiten teclado (flechas, Inicio y Fin); controles con foco visible; las tarjetas de panel se pueden seleccionar con teclado y enlaces separados.
7. **Conservación del dominio:** la vista solo lee el inventario y las series; no modifica MongoDB o TimescaleDB ni cambia certificaciones/roles mediante operaciones visuales.

---

# SCREEN 12 — PANEL / BREAKER

Click `Panel A1`.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← BDFB-A          PANEL A1                                                       EXPLORE           │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ BDFB TREE          │ PANEL A1                                                   │ BREAKER          │
│                    │                                                            │                  │
│ ▼ BDFB-A          │   01  ┌─────┐   13 ┌─────┐                                 │ BREAKER 08       │
│   ▼ Frame A        │       │ 01  │      │ 13  │                                 │                  │
│     ● Panel A1     │   02  ├─────┤   14 ├─────┤                                 │ Position    08   │
│     ○ Panel A2     │       │ 02  │      │ 14  │                                 │ Feed        A    │
│                    │   03  ├─────┤   15 ├─────┤                                 │                  │
│                    │       │ 03  │      │ 15  │                                 │ Provisioned ✓    │
│                    │       ├─────┤      ├─────┤                                 │                  │
│                    │    ...│ ... │      │ ... │                                 │ Destination      │
│                    │       ├─────┤      ├─────┤                                 │ SERVER-01        │
│                    │   08  ┃ 08  ┃◄──────────── SELECTED                         │ Rack R-023       │
│                    │       ┗━━━━━┛      ├─────┤                                 │ U37-U39          │
│                    │   09  ├─────┤      │ ... │                                 │                  │
│                    │       │ 09  │      └─────┘                                 │ ● LIVE           │
│                    │       └─────┘                                              │                  │
│                    │                                                            │ [TRACE PATH]     │
└────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┘
```

`TRACE PATH` regresa al Screen 10 con ese camino iluminado.

Ésa es la coherencia que quiero:

```text
Device → Trace Power → Breaker
Breaker → Trace Power → Device
```

No dos features aislados.

---

# SCREEN 13 — TELEMETRY LENS

Esto es importante.

**No quiero una pantalla Telemetry separada por defecto.**

Quiero aplicar Telemetry encima del objeto que ya estamos viendo.

## Room + Telemetry

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ROOM 202                  LENS: [ PHYSICAL ] [● TELEMETRY]                                        │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ TOPOLOGY           │ TELEMETRY OVERLAY                                          │ LIVE DATA        │
│                    │                                                            │                  │
│ Room 202           │       ┌─────────┐                     ┌─────────┐           │ RACK R-023       │
│ ├─ R-021 ●         │       │ R-021   │                     │ R-025   │           │                  │
│ ├─ R-023 ●         │       │   ●     │                     │   ●     │           │ State   LIVE     │
│ ├─ R-025 ●         │       └─────────┘                     └─────────┘           │                  │
│ └─ R-030 ○         │                                                            │ Updated  2s ago  │
│                    │                         ┏━━━━━━━━━┓                          │                  │
│                    │                         ┃ R-023   ┃                          │ Metrics          │
│                    │                         ┃   ●     ┃                          │ ...              │
│                    │                         ┗━━━━━━━━━┛                          │                  │
│                    │                                                            │                  │
│                    │       ┌─────────┐                                           │                  │
│                    │       │ R-030   │                                           │                  │
│                    │       │ OFFLINE │                                           │                  │
│                    │       └─────────┘                                           │                  │
├────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┤
│ ● LIVE      ◐ STALE      ○ OFFLINE                         Last stream update 10:04:53             │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Rack + Telemetry

```text
42U ┌─────────────────────────┐
41U │ AVAILABLE               │
40U ├─────────────────────────┤
39U │ SERVER-01        ● LIVE │
38U │                  230 V  │
37U │                  1.8 A  │
36U ├─────────────────────────┤
35U │ RESERVED                │
34U │ RESERVED                │
33U ├─────────────────────────┤
32U │ SWITCH-01       ◐ STALE │
31U └─────────────────────────┘
```

## Power + Telemetry

```text
BDFB-A ● LIVE
   │
   │  53.1 V / 17.4 A
   ▼
PANEL A1
   │
   ▼
BRK-08 ●
   │
   ▼
SERVER-01 ● LIVE
```

La arquitectura prevista precisamente normaliza MQTT antes de llegar al navegador; el browser no debería recibir directamente objetos crudos de MQTT. :chatgpt-content-reference{index="9"}

---

# SCREEN 14 — HOME / OPERATIONS WORKSPACE (CONTRATO REVISADO · 2026-10-20)

**Estado:** reemplaza al dashboard meramente ilustrativo del contrato inicial. Éste es el Home operativo que ya existe en `/workspace`, ahora con un único cálculo LIVE compartido con `BDFB Physical View`.

El Home **no es un segundo modelo de inventario**, ni hace cálculos eléctricos desde paquetes MQTT RAW. Consume la topología canónica de Device/Equipment y lecturas explícitamente comisionadas y normalizadas. El acceso directo a un BDFB pineado abre su **BDFB Physical View**; el panel interno abre su **Equipment Composition**. La navegación física sigue siendo autoridad.

## Wireframe de escritorio

```text
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER                              [ Search ... ]         [ EXPLORE ] [ WAREHOUSE ] [ ADMIN ]             │
├──────────────┬────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [≡] TOPOLOGY │ ⌂ Home                                                         Network / Site                    │
│ (colapsable) │ INFRASTRUCTURE OVERVIEW                                                                           │
│              │ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌───────────────────────────┐         │
│ Network      │ │ EQUIPMENTS (PRIMARY)     │ │ REPORTING                │ │ NO RECENT DATA            │         │
│  └ Site      │ │ <Devices activos>        │ │ <Devices con lectura>    │ │ <Devices sin lectura>     │         │
│    └ Room    │ └──────────────────────────┘ └──────────────────────────┘ └───────────────────────────┘         │
│      └ Rack  │                                                                                                  │
│         └... │ DIRECT ACCESS                                                              Manage pins →        │
│              │ ┌───────────────────────────────────────────────┐  ┌──────────────────────────────────────────┐ │
│              │ │ ▣ BDFB-01                                     │  │           + ADD PINNED EQUIPMENT         │ │
│              │ │ Rack-01-BDFB  ›  BDFB-01                        │  │                                          │ │
│              │ │ Avg V        Avg I         Avg P               │  │ Pins de Device o Equipment canónicos.    │ │
│              │ │ 12.24 V      8.23 A        100.63 W            │  │                                          │ │
│              │ │ Avg E counter     Total P       Reporting      │  │                                          │ │
│              │ │ 0.3889 kWh        0.30 kW       3 / 8          │  │                                          │ │
│              │ │ Entire BDFB · last packet UTC                 │  │                                          │ │
│              │ │                                  Open →        │  │                                          │ │
│              │ └───────────────────────────────────────────────┘  └──────────────────────────────────────────┘ │
│              │                                                                                                  │
│              │ BDFB POWER OVERVIEW                                            ALL BDFBs · SYSTEM WIDE            │
│              │ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌───────────────────────────┐         │
│              │ │ TOTAL POWER (LIVE)       │ │ PERIOD ENERGY            │ │ BDFB MONITORING           │         │
│              │ │ Σ potencias válidas kW   │ │ — / sin cálculo validado │ │ con lectura / total       │         │
│              │ └──────────────────────────┘ └──────────────────────────┘ └───────────────────────────┘         │
│              │                                                                                                  │
│              │ TELEMETRY BY BDFB                                                       Telemetry →              │
│              │ ┌───────────┬────────┬────────┬────────┬────────────┬───────────┬─────────────┬────────────┐    │
│              │ │ BDFB      │ Avg V  │ Avg A  │ Avg W  │ Avg E ctr  │ Total kW  │ Reporting   │ Last pkt   │    │
│              │ ├───────────┼────────┼────────┼────────┼────────────┼───────────┼─────────────┼────────────┤    │
│              │ │ BDFB-01   │ ...    │ ...    │ ...    │ ...        │ ...       │ 3 / 8       │ UTC        │    │
│              │ └───────────┴────────┴────────┴────────┴────────────┴───────────┴─────────────┴────────────┘    │
└──────────────┴────────────────────────────────────────────────────────────────────────────────────────────────┘
```

_Los números del wireframe son ilustrativos, reproducidos de una captura de campo para explicar el diseño. Nunca se codifican en la aplicación ni representan telemetría LIVE permanente._

## Contrato funcional del Home

1. **Primary Equipment = Device activos** del inventario canónico, sin contar los Equipment anidados como dispositivos adicionales. «Reporting» representa Device con telemetría vinculada reciente (incluyendo descendientes BDFB).
2. **Direct Access** permite hasta tres tarjetas pineadas en el diseño actual. Un pin al chasis físico de un BDFB se resuelve al Device BDFB, abriendo Physical View; no salta a una composición antigua duplicada.
3. **BDFB LIVE** considera **todos los Equipment descendientes activos** del Device BDFB, no todos los puntos RAW ni únicamente la presentación gráfica de paneles. Se incorporan sólo muestras normalizadas, ligadas por bindings métricos explícitos, con observaciones y recepción recientes (ventana de 30 s). Cada Equipment contribuye a lo sumo una muestra reciente por métrica.
4. **Averages**: tensión (V), corriente (A), potencia (W) y valor de contador acumulado de energía (kWh) se promedian por Equipment con valores válidos para esa métrica. Los denominadores pueden diferir si falta alguna métrica. La energía promedio **NO** es consumo energético en el período.
5. **Total power (kW)** es la **suma** de las potencias instantáneas válidas de los Equipment; no es el promedio. Si una BDFB no tiene potencia disponible, aparece `—`, no `0`. El total global se marca como parcial si faltan BDFB.
6. **Reporting x / y** es el número de Equipment descendientes con al menos una métrica válida, frente al total de descendientes activos. Los elementos estructurales sin binding también pertenecen al denominador; se explicita «without current reading».
7. **LIVE, STALE, OFFLINE, NO DATA** dependen de la frescura real de los mensajes y no del estado de conexión TCP ni del campo RAW `state: ONLINE`. La ausencia de telemetría jamás prueba que un dispositivo esté apagado.
8. **History / 24H / 7D / 15D / 1M** son vistas históricas propias del inspector cuando existen datos; el Home **no calcula consumo del período a partir del promedio de contadores**. El KPI PERIOD ENERGY permanece `—` hasta implementar una consulta validada a TimescaleDB.
9. **Una sola autoridad matemática**: `aggregateBdfbDescendantTelemetry` alimenta Home y `BdfbTelemetryInspector`. Cada vista puede refrescarse en diferentes instantes por SSE, pero ya no implementa una fórmula alternativa.
10. **Responsive y accesibilidad**: tarjetas apiladas en móvil; tabla de alta densidad con scroll horizontal dentro de su contenedor; panel de topología colapsable con jerarquía navegable. Los enlaces llevan a rutas reales con permisos de servidor.

### Navegación y estados relevantes

```text
LOGIN → HOME (/workspace)
  ├─ TOPOLOGY → NETWORK → SITE → ... → RACK → DEVICE → BDFB PHYSICAL VIEW
  │                                                  └→ PANEL → EQUIPMENT COMPOSITION
  ├─ DIRECT ACCESS [pinned BDFB] → BDFB PHYSICAL VIEW
  ├─ MANAGE PINS → NETWORK / inventory configuration
  └─ TELEMETRY → /telemetry

LIVE DATA:
MQTT → normalización + bindings → latest-state de Equipment
                                    └→ aggregateBdfbDescendantTelemetry
                                          ├→ Home: averages + total power
                                          └→ Inspector: averages + coverage

HISTORY:
TimescaleDB → consultas validadas de período (sin extrapolación de counters)
```

**Restricción de implementación:** los datos RAW del emulador pueden exponer 96 puntos aunque sólo 3 breakers estén comisionados. Nunca se agregan los 93 puntos restantes a las medias; un punto RAW no equivale a un Equipment físico validado.

---

# SCREEN 15 — GLOBAL SEARCH

No quiero una `/search` tradicional.

Quiero Command Palette.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│                  ┌────────────────────────────────────┐                  │
│                  │ ⌕  server-01                      │                  │
│                  ├────────────────────────────────────┤                  │
│                  │                                    │                  │
│                  │ DEVICE                             │                  │
│                  │                                    │                  │
│                  │ > SERVER-01                        │                  │
│                  │   Lima / Building A / Level 02     │                  │
│                  │   Room 202 / Rack R-023 / U37-U39 │                  │
│                  │                                    │                  │
│                  │ RACK                               │                  │
│                  │                                    │                  │
│                  │   RACK SERVER-01-BACKUP            │                  │
│                  │   Trujillo / ...                   │                  │
│                  │                                    │                  │
│                  └────────────────────────────────────┘                  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

Enter:

```text
SEARCH
  ↓
resolve object
  ↓
Site
  ↓
Structure
  ↓
Level
  ↓
Room
  ↓
Rack
  ↓
Device
  ↓
FIT SELECTION
```

Ésta puede ser una de las mejores features del sistema.

---

# SCREEN 16 — SETTINGS / ADMIN

Ésta sí puede ser UI tradicional.

Blueprint no tiene por qué contaminar todo.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER        SETTINGS                                                        Eduardo ▼      │
├──────────────────────┬─────────────────────────────────────────────────────────────────────────────┤
│ SETTINGS             │ USERS                                                                       │
│                      │                                                                             │
│ Profile              │ ┌───────────────────────────────────────────────────────────────────────┐   │
│ Security             │ │ Name             Role           Status                Actions         │   │
│                      │ ├───────────────────────────────────────────────────────────────────────┤   │
│ Users             ●  │ │ User A           Admin          Active                ...             │   │
│ Roles                │ │ User B           Standard       Active                ...             │   │
│                      │ │ User C           Standard       Disabled              ...             │   │
│ Data Import          │ └───────────────────────────────────────────────────────────────────────┘   │
│ Drafting             │                                                                             │
│ System               │                                                      [ + ADD USER ]         │
│                      │                                                                             │
│ Danger Zone          │                                                                             │
│                      │                                                                             │
└──────────────────────┴─────────────────────────────────────────────────────────────────────────────┘
```

Las áreas propuestas de Settings ya están identificadas como Profile, Security, Users, Roles, Data Import, Drafting, System y Danger Zone. :chatgpt-content-reference{index="11"}

---

# Entonces, visualmente Site Mapper sería esto

```text
                                  SITE MAPPER
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                 NAVIGATE                            OPERATE
                    │                                   │
                    ▼                                   ▼
              ┌────────────┐                       WORKSPACE
              │  NETWORK   │
              └─────┬──────┘
                    ▼
              ┌────────────┐
              │    SITE    │
              └─────┬──────┘
                    ▼
              ┌────────────┐
              │ STRUCTURE  │
              └─────┬──────┘
                    ▼
              ┌────────────┐
              │   LEVEL    │
              └─────┬──────┘
                    ▼
       ╔══════════════════════════╗
       ║      ROOM BLUEPRINT      ║
       ║                          ║
       ║   PHYSICAL CANVAS CORE   ║
       ╚════════════╤═════════════╝
                    │
       ┌────────────┼──────────────┐
       │            │              │
       ▼            ▼              ▼
     RACK          POWER        TELEMETRY
       │            │              │
       ▼            ▼              │
   ELEVATION       BDFB            │
       │            │              │
       ▼            ▼              │
     DEVICE       PANEL            │
       │            │              │
       └──────┬─────┘              │
              ▼                    │
          POWER PATH ◄─────────────┘
```

## Lo más importante

Yo **no empezaría construyendo los 17 screens**.

El primer milestone visual debería ser exactamente:

```text
SCREEN 01 — Network
       ↓
SCREEN 02 — Site
       ↓
SCREEN 03 — Structure
       ↓
SCREEN 04 — Level
       ↓
╔══════════════════════════════╗
║ SCREEN 05 — ROOM BLUEPRINT  ║
╚══════════════════════════════╝
       ↓
SCREEN 07 — Rack Focus
```

Y dentro de **Screen 05** resolvería primero al 100%:

```text
TOP BAR
   +
TOPOLOGY TREE
   +
PHYSICAL GRID
   +
ROOM POLYGON
   +
RACK REPRESENTATION
   +
SELECTED STATE
   +
INSPECTOR
   +
PAN / ZOOM
   +
FIT ROOM
   +
FIT SELECTION
   +
COORDINATE / SCALE BAR
```

Sin drag todavía.

Sin telemetry.

Sin power.

Sin CAS.

**Sólo navegación espacial impecable.**

Una interacción de canvas tipo herramienta de diseño es perfectamente compatible con este planteamiento: pan separado de selección, zoom, coordenadas de viewport y `fitView` son patrones soportados explícitamente por herramientas actuales como React Flow. :chatgpt-content-reference{index="12"}

Después de que esos seis screens se sientan como **un mismo sistema**, desbloquearía `06 Edit → 08 Elevation → 09 Device → 10 Power`. Esa secuencia nos evita justo lo que quieres evitar: ir probando componentes aislados “a ver qué queda bien”.
