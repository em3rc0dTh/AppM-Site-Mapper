# Consultar circuitos y entradas de energía

En ciertos equipos, como los paneles de distribución, puedes revisar tanto los **circuitos individuales** como las **entradas principales de energía**.

![Circuitos e ingresos de energía son lecturas diferentes](/help/diagrams/es/readings.svg)

![BDFB Physical View muestra Chassis, Frames, Panels y posiciones de circuito](/help/screenshots/bdfb-physical.png)

## Ver los circuitos

1. Abre el **Device** del equipo que necesitas.
2. Busca la vista de componentes (**PHYSICAL VIEW**).
3. Selecciona el **Panel** que contiene los circuitos.
4. Revisa sus posiciones y abre el interruptor correspondiente.
5. Consulta sus lecturas de voltaje, corriente, potencia o energía cuando estén disponibles.

![Breaker individual con sus lecturas de circuito](/help/screenshots/breaker-live.png)

## Ver las entradas principales

1. Regresa al **Device**.
2. Abre **INSPECTOR → Inputs**, si esa opción está disponible.
3. Revisa las entradas identificadas como **A**, **B** u otras etiquetas.
4. Para ver lecturas anteriores, abre **Charts** y selecciona el periodo disponible, como **24H**.

![Entradas principales A/B mostradas de forma independiente](/help/screenshots/snmp-inputs.png)

## ¿Por qué los valores pueden ser diferentes?

Las lecturas de un interruptor y las de una entrada principal corresponden a puntos de medición diferentes. No tienen por qué mostrar el mismo valor.

## Si faltan lecturas

Puede que esa entrada todavía no esté configurada o que no haya enviado información reciente. Puedes seguir consultando los circuitos que sí tienen datos.

**Al terminar:** sabrás dónde revisar circuitos y entradas principales sin confundir sus lecturas.

[Qué hacer si faltan datos](verificacion.md).
