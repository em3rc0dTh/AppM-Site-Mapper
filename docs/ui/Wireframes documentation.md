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

14 OPERATIONS WORKSPACE
15 GLOBAL SEARCH
16 SETTINGS / ADMIN
```

El golden path contractual actual ya exige esa progresión desde Network hasta Blueprint, Rack, CAS, BDFB, Breaker, Power Path y Telemetry. :chatgpt-content-reference{index="1"}

---

# SCREEN 00 — LOGIN

Nada de dashboard antes de tiempo.

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
  ├── si existe lastContext ──► reconstruir contexto
  │
  └── si no ─────────────────► NETWORK
```


## FALTA LA VISTA HOME en donde se muestran los BDFB pineados y la información "telemétrica" de cada uno de ellos. 
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

# SCREEN 11 — BDFB

Entramos en `BDFB-A`.

Ahora vuelve a aparecer una representación **física**.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← POWER PATH        BDFB-A                                                            EXPLORE      │
├────────────────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ POWER TREE         │ BDFB PHYSICAL VIEW                                         │ BDFB-A           │
│                    │                                                            │                  │
│ ● BDFB-A           │  ┌──────────────────────────────────────────────────────┐  │ Identity         │
│   ├─ Shelf 01      │  │                     BDFB-A                           │  │ ...              │
│   │  ├─ Frame A    │  │                                                      │  │                  │
│   │  │  ├─ A1      │  │  ┌─────────────────────┐ ┌─────────────────────┐     │  │ Feed       A     │
│   │  │  ├─ A2      │  │  │ FRAME A             │ │ FRAME B             │     │  │                  │
│   │  │  └─ A3      │  │  │                     │ │                     │     │  │ Panels      6    │
│   │  └─ Frame B    │  │  │ ┌────┐ ┌────┐       │ │ ┌────┐ ┌────┐       │     │  │ Breakers   ...   │
│   └─ Shelf 02      │  │  │ │ A1 │ │ A2 │  ...  │ │ │ B1 │ │ B2 │  ...  │     │  │                  │
│                    │  │  │ └────┘ └────┘       │ │ └────┘ └────┘       │     │  │ Telemetry ● LIVE │
│                    │  │  │                     │ │                     │     │  │                  │
│                    │  │  └─────────────────────┘ └─────────────────────┘     │  │                  │
│                    │  │                                                      │  │                  │
│                    │  └──────────────────────────────────────────────────────┘  │                  │
│                    │                                                            │                  │
└────────────────────┴────────────────────────────────────────────────────────────┴──────────────────┘
```

La jerarquía contractual que estamos materializando aquí es `BDFB → Shelf → Frame → Panel → Holder/Breaker`. :chatgpt-content-reference{index="8"}
Recuerda, puede o no puede tener frame, eso se setea cuando creas el device (si es un bdfb), entonces, muestras ello o no, todo depende de la configuración pero siempre lo usas como rferencia de posición. 
Por otro lado, los panels van uno bajo el otro dentro del mismo frame, nunca derecha.
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

# SCREEN 14 — OPERATIONS WORKSPACE

Ahora sí podemos tener algo parecido a dashboard.

Pero sólo como **launcher hacia el mapa físico**. los BDFB tienen su estructura ya diseñada en el zip. 

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ SITE MAPPER          OPERATIONS                                                 [⌕ Search]         │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                    │
│  ATTENTION                                                                                         │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐                        │
│  │ ● Device telemetry offline       │  │ ⚠ Feed B unavailable            │                        │
│  │ SERVER-32                        │  │ SERVER-18                        │                        │
│  │                                  │  │                                  │                        │
│  │ Lima › L02 › R-024               │  │ Lima › L03 › R-032               │                        │
│  │                  [ LOCATE → ]    │  │              [ TRACE POWER → ]   │                        │
│  └──────────────────────────────────┘  └──────────────────────────────────┘                        │
│                                                                                                    │
│  PINNED                                                                                            │
│  ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐                             │
│  │ Rack R-023         │ │ BDFB-A             │ │ SERVER-01          │                             │
│  │ ● Healthy          │ │ ● Live             │ │ ● Live             │                             │
│  │ [OPEN]             │ │ [OPEN]             │ │ [OPEN]             │                             │
│  └────────────────────┘ └────────────────────┘ └────────────────────┘                             │
│                                                                                                    │
│  RECENT                                                                                            │
│                                                                                                    │
│   Room 202                  Rack R-023                  Panel A1                                    │
│   3 min ago                 6 min ago                   8 min ago                                   │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Esto coincide con las capacidades ya identificadas de workspace, pinned devices, BDFB summary, notifications, navigation tree, contextual panels y distintas vistas operativas. :chatgpt-content-reference{index="10"}

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