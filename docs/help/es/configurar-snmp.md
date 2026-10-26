# Conectar las lecturas de una entrada DC

En un BDFB, las **entradas principales de energía** se revisan por separado de los breakers. Site Mapper puede recibir esas mediciones mediante SNMP. Primero identifica la entrada física; después relaciona sus lecturas.

![De la entrada de energía a las lecturas](/help/diagrams/es/snmp.svg)

## Antes de comenzar

Comprueba con la persona responsable cuál es el tipo de equipo instalado. Site Mapper puede mostrar perfiles **Config2** (entradas A y B) o **Config4** (A1, A2, B1 y B2). No cambies de perfil para intentar solucionar un valor extraño.

## Preparar la entrada

1. Abre el **Device BDFB** correcto.
2. Busca la configuración de las entradas o el editor de **ACCESS PORTS**.
3. Comprueba el perfil físico seleccionado antes de agregar las entradas.
4. Crea una entrada de energía **POWER → INPUT → EXTERNAL**.
5. Elige la identificación de la entrada y los paneles que alimenta, según la instalación.
6. Completa las características que solicita el formulario y confirma el cableado **solo si fue revisado físicamente**.

## Vincular las mediciones

1. En la misma entrada, activa la opción para configurar sus lecturas SNMP cuando esté disponible.
2. Escribe la identificación del controlador (**Source**) y el **OID de corriente** verificado.
3. Agrega el **OID de voltaje** si dispones de su identificación comprobada.
4. Confirma la correspondencia y guarda.
5. Regresa a la entrada y comprueba qué mediciones aparecen asociadas.

## Si se guardó la entrada, pero faltan lecturas

**No vuelvas a crear la entrada.** El equipo puede haber guardado el terminal correctamente y dejado pendiente la asociación de uno de los OIDs. Abre ese mismo terminal, comprueba lo que ya está asociado y completa únicamente lo que falta.

## Ver el resultado

Abre **INSPECTOR → Inputs** en el BDFB. Si ya se reciben mediciones, verás valores y estados. Para consultar periodos anteriores, utiliza **Charts**.

**Resultado:** sabes qué entrada estás revisando, de qué controlador vienen sus datos y si las lecturas están disponibles.

[Consultar circuitos y entradas](recorrido-completo-login-mqtt-snmp-modbus.md) · [Gráficos](historial-y-graficos.md).
