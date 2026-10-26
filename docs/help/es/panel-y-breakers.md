# Crear un panel y colocar interruptores

Un **Panel** contiene posiciones numeradas donde puedes instalar interruptores (**Circuit Breakers**). Primero debes tener el equipo principal y el lugar donde se ubicará el panel.

![Panel y posiciones de un rack](/help/diagrams/es/rack.svg)

## Antes de comenzar

- Abre el **Device** correcto y luego el componente que contendrá el panel.
- Revisa que se trate de la instalación adecuada.
- Para agregar componentes necesitas acceso de edición.

## Crear el panel

1. En **PHYSICAL COMPOSITION**, selecciona **+ ADD EQUIPMENT**.
2. Elige una plantilla compatible en **FROM WAREHOUSE** o selecciona **ONE-OFF**.
3. Para una pieza individual, indica su nombre y el tipo **PANEL**.
4. Selecciona **POSITIONAL** para que tenga posiciones numeradas.
5. Escribe la capacidad que corresponde al panel; por ejemplo, **24** posiciones si ese es el modelo real.
6. Guarda con **Create and install** o **Install Equipment**.
7. Abre el panel y comprueba su cantidad de posiciones.

## Agregar un breaker

1. Dentro del panel abre **INTERNAL COMPOSITION**.
2. Selecciona **MANAGE POSITIONS**.
3. Busca la posición libre que necesitas, por ejemplo **POSITION 01 · AVAILABLE**.
4. Selecciona la opción para agregar Equipment a **esa posición**.
5. Elige **CIRCUIT_BREAKER**, completa sus datos y guarda.
6. Comprueba que ahora aparece como **OCCUPIED**.

## ¿Qué significa 24 posiciones?

Es la capacidad del panel, no la cantidad de interruptores instalados. Puedes tener un panel de 24 posiciones con solo una ocupada.

## Si una posición no está disponible

No instales otra pieza encima. Revisa cuál está ocupando el espacio y confirma la ubicación con la persona encargada.

**Resultado:** ves el panel dentro de su equipo y cada breaker en su posición correcta.

[Siguiente: entradas y terminales](terminales-y-entradas.md) · [Lecturas MQTT](vincular-mqtt.md).