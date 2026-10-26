# Vincular las lecturas MQTT de un breaker

Cuando un interruptor aparece en Site Mapper, aún puede faltar conectar **sus lecturas**. Esta guía explica cómo asociar una señal de medición al breaker correcto.

![De la señal al interruptor](/help/diagrams/es/mqtt.svg)

## Antes de comenzar

Necesitas tener un **Panel** con el breaker instalado en su posición real. La persona responsable debe haber confirmado cuál es la fuente de datos y qué punto corresponde a ese interruptor.

## Asociar las lecturas

1. Abre el **Panel** que contiene el breaker.
2. Busca **MQTT POINT COMMISSIONING**.
3. Comprueba el nombre de la fuente (**Source**) y el identificador del grupo de puntos (**Prefix**).
4. Busca la fila correspondiente a la posición de tu breaker.
5. Revisa el punto propuesto para esa posición. **No lo confirmes solo porque su número coincida**.
6. Cuando se haya comprobado qué interruptor mide realmente esa señal, marca la casilla de verificación.
7. Selecciona **Confirm and commission point**.
8. Usa **Refresh commissioning** si necesitas actualizar el resultado.

## ¿Qué significan 0/4 y 4/4?

- **0/4:** todavía no hay lecturas vinculadas para las cuatro magnitudes.
- **4/4:** se han vinculado voltaje, corriente, potencia y energía.

**4/4 no significa que el equipo esté enviando datos ahora.** Para eso debes abrir el breaker y consultar **LIVE TELEMETRY**.

## Si aparece un conflicto

Puede que una fuente o un punto ya pertenezca a otro equipo. Detén la vinculación y pide revisar el origen; no reemplaces asociaciones existentes a ciegas.

**Resultado:** las cuatro magnitudes están asociadas al breaker verificado y puedes comprobar por separado si hay datos recientes.

[Ver lecturas](telemetria.md) · [Si no aparecen datos](verificacion.md).