# Revisar una conexión de energía

Site Mapper puede mostrar el camino de alimentación que **está registrado en el sistema**: desde un equipo de origen hasta una entrada de destino.

## Abrir un Power Path

![Ejemplo real de la pantalla POWER PATH](/help/screenshots/power-path.png)

1. Abre el Equipment que quieres revisar.
2. En su Inspector busca **Power A**, **Power B**, **VIEW POWERPATH**, **Explore Power Path** o **FULL POWER TRACE**, según la pantalla.
3. Abre el recorrido.
4. Lee la pantalla de izquierda a derecha:
   - **Source equipment hierarchy**: de dónde parte.
   - **POWER OUTPUT**: terminal de salida.
   - **POWER PATH / FEED**: conexión registrada.
   - **POWER INPUT**: terminal de entrada.
   - **Destination equipment hierarchy**: a qué equipo llega.
5. Revisa el Inspector de la derecha para confirmar Source, Destination, Feed y Redundancy.

## Feed A y Feed B

Puedes encontrar **Feed A**, **Feed B**, ambos o ninguno. En la vista **A+B**, Site Mapper puede mostrar los dos caminos juntos.

Si dice **Feed A · Configured** y **Feed B · Not configured**, solo existe un camino registrado en Site Mapper para ese ejemplo.

![Explicación sencilla de una conexión registrada](/help/diagrams/es/power.svg)

## Qué significa Configured

**Configured significa que la ruta está registrada.** No demuestra por sí sola que haya corriente circulando, que el cableado físico sea correcto ni que la redundancia haya sido certificada.

## Registrar una conexión (solo si estás autorizado)

1. Confirma con la persona responsable cuáles son los dos extremos físicos.
2. Selecciona un **POWER OUTPUT** libre y la acción para conectar una carga.
3. Elige el Equipment de destino y su **POWER INPUT**.
4. Revisa ambos extremos y selecciona **Feed A** o **Feed B** según corresponda.
5. Confirma la conexión física únicamente cuando la información haya sido verificada.

## Si el terminal ya está CONNECTED

No crees otra conexión para el mismo extremo. Abre el Power Path existente y comprueba qué está registrado.

**Resultado esperado:** puedes nombrar el origen, el destino, el Feed y distinguir una ruta registrada de una medición eléctrica real.

[Consultar datos en tiempo real](telemetria.md).
