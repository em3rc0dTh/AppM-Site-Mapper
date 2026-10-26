# Revisar el historial y los gráficos

Un gráfico sirve para comprobar **cómo cambió una lectura con el tiempo**. No siempre describe lo que ocurre en este instante.

![Mediciones y circuitos](/help/diagrams/es/readings.svg)

## Ver datos anteriores de un equipo

1. En **EXPLORE**, abre la sala, el rack y el equipo correcto.
2. Busca **LIVE TELEMETRY** o su sección de historial.
3. Consulta primero la hora de la última lectura.
4. Selecciona **24H** para ver el último día o **7D** para ver la última semana, si la pantalla ofrece esas opciones.
5. Observa la unidad de cada valor y el periodo elegido.

## Ver el historial de entradas SNMP

1. Abre el **Device BDFB**.
2. Ve a **INSPECTOR → Charts**.
3. Selecciona el periodo y una magnitud, por ejemplo **Current** o **Voltage**.
4. Comprueba qué entrada (A, B u otra) corresponde a cada curva.

En algunas vistas de SNMP pueden aparecer periodos adicionales, como **15D** o **1M**.

## Si no aparece ningún gráfico

Puede que no haya mediciones guardadas en el periodo elegido. Cambia el intervalo si corresponde y revisa si el equipo tiene lecturas recientes.

## No confundas estos datos

- **LIVE:** información recibida recientemente.
- **Historial:** mediciones de momentos anteriores.
- **Potencia o energía estimada:** cálculos que pueden mostrarse de forma separada a una lectura directa.

**Resultado:** puedes explicar qué mide el gráfico, a qué equipo pertenece y de qué periodo proviene.

[Ver datos recientes](telemetria.md) · [Estados de lectura](verificacion.md).
