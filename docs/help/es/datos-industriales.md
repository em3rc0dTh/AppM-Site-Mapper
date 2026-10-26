# Entender de dónde vienen los datos

Site Mapper puede mostrar datos procedentes de diferentes sistemas de medición. No necesitas conocer su configuración técnica para consultar los equipos.

![Cómo llegan los datos](/help/diagrams/es/data-flow.svg)

## MQTT: lecturas de circuitos

![Ejemplo real de un breaker recibiendo lecturas MQTT](/help/screenshots/breaker-live.png)

En los paneles, una fuente MQTT puede enviar valores correspondientes a cada breaker. Es importante que cada señal esté vinculada al interruptor correcto.

## SNMP: información de entradas y controladores

![Ejemplo real de entradas DC recibidas mediante SNMP](/help/screenshots/snmp-inputs.png)

Un controlador SNMP puede proporcionar valores de las entradas principales de un BDFB, como la corriente o el voltaje. Estas lecturas no son necesariamente iguales a las de los circuitos individuales.

## Historial: valores de antes

![Ejemplo real de históricos separados por fuente y magnitud](/help/screenshots/history-charts.png)

Cuando existen lecturas guardadas, puedes consultarlas en **Charts** o en el historial del equipo. Una curva anterior no significa que el equipo esté enviando información en este momento.

## Modbus: compartir información con otros sistemas

Site Mapper también puede ofrecer datos a sistemas industriales externos mediante Modbus. Eso no convierte a Modbus en otra medición física: es una manera de compartir datos preparados para su consulta.

## ¿Quién configura las conexiones?

La preparación del broker MQTT, el controlador SNMP y las direcciones de Modbus corresponde al personal de integración autorizado. Desde Site Mapper podrás revisar las lecturas y, si tienes los permisos necesarios, las asociaciones de equipos y señales que admite la interfaz.

**Resultado:** puedes distinguir la lectura de un breaker, la de una entrada principal y los datos enviados a otros sistemas.

[Vincular MQTT](vincular-mqtt.md) · [Vincular SNMP](configurar-snmp.md).
