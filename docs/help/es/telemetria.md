# Consultar datos en tiempo real

Algunos equipos envían mediciones que Site Mapper puede mostrar como **LIVE**. Esta pantalla sirve para saber **qué valor se recibió, de qué equipo y cuándo**.

## Abrir las lecturas de un breaker

![Ejemplo real de un breaker con lecturas LIVE](/help/screenshots/breaker-live.png)

1. Abre la Room y el Rack donde está el equipo.
2. Navega hasta el Panel y selecciona el breaker.
3. Abre **Telemetry** o revisa el bloque **Own telemetry**.
4. Comprueba el estado **LIVE**, los valores y la línea **Source / Last packet**.

## Qué significa cada valor

| Dato                   | Qué muestra       |
| ---------------------- | ----------------- |
| **V / Voltage**        | Voltaje           |
| **I / Current**        | Corriente         |
| **P / Power**          | Potencia          |
| **E / Energy counter** | Energía acumulada |

![Cómo se separan las lecturas de entradas y circuitos](/help/diagrams/es/readings.svg)

## Qué significa LIVE

**LIVE significa que Site Mapper recibió una muestra suficientemente reciente según su configuración.** No es una certificación de cableado, alimentación física o exactitud del sensor.

Por eso conviene revisar también **Source** y **Last packet** antes de interpretar un valor.

## Panel: instalado no significa lo mismo que reportando

En un Panel puedes encontrar textos como **3/24 positions MQTT LIVE**, **3 installed** y **21 available**. Significa que el Panel tiene 24 posiciones y que tres están ocupadas/reportando en ese ejemplo; no significa que existan 24 breakers.

## Ver lecturas anteriores

![Historial de Panel por magnitud y periodo](/help/screenshots/panel-history.png)

Abre **History & diagnostics · charts**. Según la pantalla podrás seleccionar periodos como **24H**, **7D**, **15D** o **1M**.

## Si aparece STALE, NO DATA u otro estado

No concluyas que el equipo está apagado. El problema puede estar en la fuente, la asociación de la señal, la antigüedad de la última muestra o el histórico. Usa [Si un equipo no muestra datos](verificacion.md).

**Resultado esperado:** puedes decir qué equipo estás leyendo, cuál es la unidad, cuál fue la última muestra y si el dato es reciente.

[Ver circuitos y entradas de energía](recorrido-completo-login-mqtt-snmp-modbus.md).
