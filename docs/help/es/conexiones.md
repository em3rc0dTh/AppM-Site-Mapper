# Revisar una conexión de energía

Site Mapper permite ver **de dónde sale una conexión de energía y a qué equipo llega**.

![Ejemplo de una conexión de energía](/help/diagrams/es/power.svg)

## Ver una conexión existente

1. Abre el equipo que quieres revisar.
2. Busca **PHYSICAL TERMINALS** o **ACCESS PORTS**.
3. Selecciona el terminal de energía.
4. Si aparece **CONNECTED**, significa que hay una conexión registrada.
5. Selecciona **VIEW POWERPATH** para ver el recorrido.
6. Comprueba el nombre del equipo de origen, el de destino y la entrada o salida correspondiente.

## ¿Qué significan Feed A y Feed B?

Son dos posibles caminos de alimentación. Puedes encontrar uno, ambos o ninguno registrado. Que aparezca **Feed A** no significa que también exista **Feed B**.

## Registrar una conexión (solo si estás autorizado)

1. Comprueba con la persona responsable que los dos equipos están conectados físicamente.
2. Selecciona un terminal libre **POWER OUTPUT** y elige **CONNECT LOAD**.
3. Busca el equipo de destino y su **POWER INPUT**.
4. Revisa ambos extremos y elige **Feed A** o **Feed B** según corresponda.
5. Solo si los datos son correctos, selecciona **CONFIRM PHYSICAL CONNECTION**.

## Si el terminal ya está conectado

No necesitas crear otra conexión. Abre **VIEW POWERPATH** para revisar la existente.

**Importante:** una conexión mostrada aquí indica lo que se registró en Site Mapper. No confirma por sí sola que haya energía en ese momento.

[Ver datos de los equipos](telemetria.md).
