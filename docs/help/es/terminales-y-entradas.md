# Agregar terminales y entradas de energía

Los **terminales** representan los puntos donde un equipo recibe o entrega energía. Para identificarlos correctamente necesitas conocer el equipo y la función de cada conexión.

![Origen y destino de una conexión](/help/diagrams/es/power.svg)

## Consultar los terminales

1. Abre el Equipment que quieras revisar.
2. Busca **PHYSICAL TERMINALS** o **ACCESS PORTS**.
3. Selecciona un terminal para conocer su nombre, tipo y estado.
4. Identifica si es **INPUT** (entrada), **OUTPUT** (salida) o **BIDIRECTIONAL**.

## Agregar un terminal (si tienes acceso)

1. En la sección de terminales, abre el formulario para agregar uno.
2. Escribe un nombre reconocible.
3. Selecciona **POWER** cuando se trate de energía.
4. Elige su dirección: **INPUT** o **OUTPUT**, según la instalación.
5. Revisa los datos adicionales y guarda.
6. Comprueba que aparece en el equipo correcto.

## Entradas de energía de un BDFB

Al preparar una entrada externa de energía, el formulario puede solicitar una **Feed A o B**, paneles asociados y características de la entrada o del shunt. Debes utilizar los datos de la instalación real.

No marques una entrada como **verificada** hasta comprobar cómo está conectada.

## ¿Qué pasa si está CONNECTED?

Significa que Site Mapper ya tiene una conexión registrada en ese terminal. Puedes abrir **VIEW POWERPATH** para saber con qué equipo está relacionado.

**Resultado:** reconoces el sentido de cada terminal y sabes cuándo añadir una entrada o revisar una conexión existente.

[Siguiente: revisar conexiones](conexiones.md) · [Entradas SNMP](configurar-snmp.md).