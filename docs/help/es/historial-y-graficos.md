# Ver cómo cambiaron las lecturas

El historial responde una pregunta sencilla: **¿cómo cambió esta medición durante las últimas horas o días?** Un valor histórico no siempre describe lo que ocurre ahora mismo.

![Historial real de entradas SNMP y lecturas MQTT del BDFB](/help/screenshots/history-charts.png)

## Ver datos anteriores de un equipo

![Historial de un Panel con curvas separadas por magnitud](/help/screenshots/panel-history.png)

1. En **EXPLORE**, abre la sala, el rack y el equipo correcto.
2. Busca **LIVE TELEMETRY** o su sección de historial.
3. Consulta primero la hora de la última lectura.
4. Selecciona **24H** para ver el último día o **7D** para ver la última semana, si la pantalla ofrece esas opciones.
5. Observa la unidad de cada valor y el periodo elegido.

## Ver el historial de entradas del QDF

1. Abre el **Device BDFB**.
2. Ve a **INSPECTOR → Charts**.
3. Selecciona el periodo y una magnitud, por ejemplo **Current** o **Voltage**.
4. Comprueba qué entrada (A, B u otra) corresponde a cada curva.

En algunas vistas del QDF pueden aparecer periodos adicionales, como **15D** o **1M**.

## Reportes descargables

### Reporte completo del QDF

Desde el BDFB puedes abrir un reporte para **24H, 7D, 15D o 1M**. El resumen muestra el comportamiento general del QDF sin mezclarlo con un breaker individual.

Incluye, cuando existen datos:

- Voltaje mínimo, promedio, máximo y variación del período.
- Corriente promedio y pico.
- Potencia promedio y pico.
- Energía del período.
- Disponibilidad de datos.
- Tabla de breakers instalados con sus valores históricos observados.
- Exportación CSV e impresión / PDF.

### Reporte de un breaker

Desde un Breaker abre **Operación → Gráficas → Abrir reporte del breaker**.

El reporte usa el mismo período **24H, 7D, 15D o 1M** y muestra únicamente ese circuito: Voltaje, Corriente, Potencia, último contador de Energía, intervalos registrados y detalle histórico.

Esto permite revisar un breaker sin mezclarlo con los demás circuitos del QDF.

## Si no aparece ningún gráfico

Puede que no haya mediciones guardadas en el periodo elegido. Cambia el intervalo si corresponde y revisa si el equipo tiene lecturas recientes.

## No confundas estos datos

- **LIVE:** información recibida recientemente.
- **Historial:** mediciones de momentos anteriores.
- **Potencia o energía estimada:** cálculos que pueden mostrarse de forma separada a una lectura directa.

**Resultado:** puedes explicar qué mide el gráfico, a qué equipo pertenece y de qué periodo proviene.

[Ver datos recientes](telemetria.md) · [Estados de lectura](verificacion.md).
