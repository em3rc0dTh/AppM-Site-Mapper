# 7 · Primera práctica completa (entrenamiento de operadores)

**Duración orientativa:** 25–40 minutos. Una persona que nunca haya probado Site Mapper debe poder completar **un recorrido de observación** sin modificar datos, y después —en una base de entrenamiento y con permiso— **un recorrido de creación**.

## Preparación del instructor

Elige primero el modo de clase:

| Modalidad                           | Requisitos                                                  | Riesgo                                                     |
| ----------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| **A. Visita guiada / solo lectura** | Usuario STANDARD; topología y PowerPath A existentes        | No modifica datos                                          |
| **B. Taller de creación**           | ADMIN autorizado; base aislada de capacitación              | Crea entidades de prueba                                   |
| **C. Telemetría en directo**        | Lo anterior + broker externo, emulador y fuente verificados | Solo se muestran mediciones sintéticas reales del emulador |

**Nunca practiques creando o retirando un PowerPath sobre un breaker que alimenta equipos reales.** Si el ambiente no tiene un cableado verificado o un fixture de simulación autorizado, registra únicamente inventario y revisa conexiones ya existentes.

## A. Recorrido seguro sin modificar datos

### Escena 1 — “¿Dónde estoy?”

1. Inicia sesión y localiza **EXPLORE**.
2. Recorre Network → Site → Structure → Level → Room.
3. Desde la Room identifica **Bay**, **Position** y **Rack**.
4. Abre el Rack y ubica el **Device** que contiene el circuito.

**Demostración:** la persona puede decir cuál es la Room/Rack padre de un Equipment.

### Escena 2 — “¿Qué contiene el equipo?”

1. Abre el Device y navega por Equipment: Chassis → Shelf → Frame → Panel.
2. En el Panel identifica **POSITIONAL · 24 slots**, posición 01 y el breaker instalado.
3. Abre el Equipment **CB-01** y encuentra la sección **PHYSICAL TERMINALS**.

**Demostración:** sabe distinguir el Device padre del Equipment breaker y puede reconocer una posición libre.

### Escena 3 — “¿Qué alimenta ese puerto?”

1. Haz clic en **Power output**.
2. Lee **CONNECTED**, **FEEDS → NETWORK BOARD / AP-01-01** y **Feed A**.
3. Abre **VIEW POWERPATH** y **FULL POWER TRACE**.
4. Vuelve al NETWORK BOARD y comprueba **POWERED BY ← CB-01**.
5. Identifica que Feed B está **no configurado**.

**Demostración:** sabe mostrar ambas puntas del vínculo y no confunde A con redundancia.

### Escena 4 — “¿Está midiendo o solo está registrado?”

1. En el Panel abre **MQTT POINT COMMISSIONING**.
2. Localiza fuente, prefijo, punto y `4/4 metric bindings` de CB-01.
3. Abre **LIVE TELEMETRY** en el breaker, identifica el origen y las cuatro variables.
4. Selecciona **24H** y **7D** y explica que lo que ve es histórico.

**Demostración:** sabe que 4/4, LIVE y PowerPath son hechos distintos; si no hay MQTT, informa STALE/NO DATA.

## B. Taller de creación en base aislada

Solo si el instructor ha preparado una base sin datos de cliente y ha confirmado permiso de escritura:

1. Desde una Network de prácticas, crea el Site `SITE-TRAIN-01`, su Structure `BLDG-TRAIN-01`, Level `LEVEL-01` y Room `ROOM-TRAIN-01`, dibujando los límites en los formularios espaciales.
2. En el **Blueprint** de Room, entra en **EDIT ROOM**, coloca Bay/Rack y guarda con **SAVE LAYOUT**.
3. Crea un Device adecuado bajo el Rack y un Equipment padre. Instala un Panel de **24 slots** y un Equipment `CIRCUIT_BREAKER` en la **posición 01**.
4. Revisa el Access Port del breaker. Si el material de prácticas lo incluye, crea otro Equipment de carga con puerto POWER INPUT y verifica su identidad.
5. **No crees un PowerPath** salvo que exista una conexión/fixture realmente validado para esa práctica. Cuando exista, sigue [Conexiones físicas](conexiones.md).
6. **No comisiones MQTT** salvo que el instructor haya confirmado por adelantado el source, raw point y breaker correcto. Cuando exista, sigue [Commissioning MQTT](telemetria.md).
7. Reabre todos los objetos y demuestra que sobreviven a la navegación. Si estás en modo en memoria, advierte que **no** persistirán tras detener el servidor.

Crear el Panel o el breaker no obliga a rellenar los otros 23 slots ni a usar un serial de emulador compartido.

## Lista de observación del instructor

| Competencia       | Cumplida cuando la persona…                                         |
| ----------------- | ------------------------------------------------------------------- |
| Navegación        | Encuentra un Equipment a partir de Network/Site/Room                |
| Identidad         | Diferencia Device, Equipment, Panel y Circuit Breaker               |
| Posición          | Identifica slots ocupados/disponibles sin crear inventario ficticio |
| Puertos           | Señala OUTPUT/INPUT/BIDIRECTIONAL y explica su diferencia           |
| Conexión          | Identifica el peer de un puerto CONNECTED y abre PowerPath          |
| Seguridad         | No intenta reutilizar un terminal ocupado                           |
| Commissioning     | Distingue fuente, prefijo, punto sugerido y 4/4 bindings            |
| Telemetría        | Explica la diferencia LIVE / histórico / STALE / UNMAPPED           |
| Manejo de errores | Ante un error, captura contexto y **no** borra datos                |

**Resultado final:** el alumno completa el recorrido A de manera autónoma y explica verbalmente qué parte es topología, qué parte conexión física y qué parte telemetría. El recorrido B solo se evalúa cuando haya ambiente autorizado.

[Volver al índice del manual](README.md) · [Plan de capturas y capacitación](capturas-y-capacitacion.md).
