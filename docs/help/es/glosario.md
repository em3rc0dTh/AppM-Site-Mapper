# Glosario de Site Mapper

Este glosario explica las palabras que aparecen en la navegación, los planos y las vistas de equipos.

No necesitas ser especialista en redes, electricidad o sistemas para usarlo. Cuando una palabra representa una referencia interna de Site Mapper y no un objeto físico, se indica expresamente.

## Cómo leer la jerarquía

Site Mapper organiza la infraestructura como un árbol. Un elemento puede contener a otro:

**Network → Site → Structure → Level → Room → Container Cluster / Bay → Position / Anchor → Rack → Device → Equipment**

Esta jerarquía sirve para responder una pregunta sencilla: **¿dónde está el elemento que estoy viendo?**

No todos los niveles representan un equipo físico y no todos generan mediciones.

## Network

**Qué es:** el nivel más alto usado para agrupar una o más instalaciones.

**Para qué sirve:** permite mantener varias sedes dentro de una misma organización de infraestructura.

**Ejemplo:** una red que contiene la instalación de Lurín.

**No significa:** que exista un dispositivo físico llamado “Network”. No genera telemetría.

## Site

**Qué es:** una sede o instalación física.

**Para qué sirve:** agrupa edificios, niveles, salas y equipos que pertenecen al mismo lugar.

**Ejemplo:** una estación o sede de operación.

**No significa:** el estado de los equipos que contiene.

## Structure

**Qué es:** un edificio o una estructura física dentro de una sede.

**Para qué sirve:** organiza los niveles y salas de ese edificio.

**No significa:** un rack ni un equipo eléctrico.

## Level

**Qué es:** un piso o nivel de una estructura.

**Para qué sirve:** agrupa las salas ubicadas en ese nivel.

**No significa:** un nivel eléctrico o un nivel de alarma.

## Room

**Qué es:** una sala física.

**Para qué sirve:** contiene posiciones, racks y equipos ubicados en esa sala.

**Ejemplo:** la sala donde se encuentra un QDF.

## Container Cluster / Bay

**Qué es:** una zona física de la sala utilizada para agrupar una o más posiciones cercanas.

**Para qué sirve:** ayuda a representar cómo están distribuidos los gabinetes en el plano.

**Ejemplo:** el grupo donde se encuentra QDF5.

**No significa:** un equipo que genere mediciones.

## Position / Anchor

**Qué es:** una referencia de posición usada por Site Mapper para indicar dónde se coloca un rack dentro del plano.

**Para qué sirve:** conserva la ubicación física del rack y permite relacionarlo con su huella o superficie.

**Ejemplo:** `QDF5 anchor` es la referencia donde está colocado el rack QDF5.

**No significa:** un equipo, un sensor ni una fuente de telemetría. No requiere ninguna acción operacional del usuario.

## Footprint / Huella física

**Qué es:** el espacio que ocupa un objeto visto desde arriba.

**Para qué sirve:** muestra el tamaño físico reservado en el plano.

**Ejemplo:** una huella de **600 × 600 mm** significa que el rack ocupa 600 mm por 600 mm en el plano.

**No significa:** la altura del rack ni su capacidad en unidades U.

## Rack

**Qué es:** el gabinete físico donde se instala el equipo.

**Para qué sirve:** permite consultar la ocupación del gabinete mediante la vista **Front Elevation**.

**Front Elevation** muestra el rack de frente y permite abrir directamente el equipo instalado.

## Device

**Qué es:** un equipo principal administrado por Site Mapper.

**Ejemplo:** **BDFB QDF-5**.

**Para qué sirve:** actúa como punto de entrada al equipo completo y a sus vistas operacionales.

## Equipment

**Qué es:** una pieza física que forma parte de un Device o de otro Equipment.

**Ejemplos:** Chassis, Shelf, Frame, Panel o Breaker.

**Para qué sirve:** representa la composición física real del equipo.

## BDFB / QDF

**Qué es:** el equipo de distribución de energía identificado por el cliente.

**Ejemplo:** **BDFB QDF-5**.

**Qué puedes consultar:** vista física, estado operacional, entradas, gráficos, alarmas y reportes históricos cuando existan datos.

## Chassis

**Qué es:** la estructura principal que contiene componentes internos del BDFB.

## Shelf

**Qué es:** una división física dentro del Chassis.

## Frame

**Qué es:** una estructura dentro de un Shelf que agrupa paneles.

## Panel

**Qué es:** un conjunto de posiciones físicas donde pueden instalarse breakers.

**Importante:** Site Mapper puede mostrar el panel y sus breakers aunque no exista una medición eléctrica directa del panel como conjunto.

## Breaker

**Qué es:** un interruptor o circuito individual instalado en una posición de un panel.

**Qué puedes consultar:** identificación, posición y, cuando existen mediciones registradas, voltaje, corriente, potencia, energía e historial.

## Vista física

**Qué responde:** “¿qué está instalado y cómo está organizado?”

No debe interpretarse como una indicación de que todos los elementos estén transmitiendo datos en este momento.

## Operación

**Qué responde:** “¿qué está ocurriendo con el equipo?”

Incluye mediciones, estados, alarmas e históricos cuando están disponibles.

## Front Elevation

**Qué es:** la vista frontal del rack.

**Para qué sirve:** permite ver qué equipo ocupa cada zona del gabinete y abrir directamente el equipo seleccionado.

## Reportando

**Qué significa:** Site Mapper recibió datos recientes del elemento esperado.

**Ejemplo:** `36 / 36 breakers reportando` significa que los 36 breakers instalados tienen datos recientes.

**No significa:** que no exista ninguna alarma eléctrica. La cobertura de datos y las alarmas son conceptos distintos.

## Datos parciales

**Qué significa:** existe información para una parte del período o de las magnitudes esperadas, pero no para todas.

Los datos faltantes no se convierten en cero.

## Sin datos en este intervalo

**Qué significa:** no existen mediciones aceptadas para esa magnitud durante el período seleccionado.

**No significa:** que el equipo esté apagado.

## Intervalo

**Qué es:** una parte del período utilizada para organizar las mediciones históricas.

Por ejemplo, un reporte de 24 horas se divide internamente en intervalos para poder representar la evolución de los valores.

## Variación de voltaje (Δ)

**Qué significa:** diferencia entre el voltaje máximo y el voltaje mínimo observados en el período seleccionado.

**Ejemplo:** máximo 52.3 V y mínimo 51.8 V → variación 0.5 V.

No es una alarma por sí misma.

## ¿Dónde veo cada cosa?

| Si quieres saber… | Abre… |
| --- | --- |
| Dónde está un QDF | Plano de sala / árbol de navegación |
| Qué ocupa un rack | Front Elevation |
| Cómo está compuesto un BDFB | Vista física |
| Qué ocurre ahora | Operación |
| Cómo cambió durante horas o días | Gráficas / Reporte |
| Qué ocurrió en un breaker específico | Breaker → Gráficas → Abrir reporte del breaker |
| Qué significa una palabra | Este glosario |

Si una pantalla muestra una palabra de infraestructura que no entiendes, primero revisa este glosario. La ayuda debe explicar el concepto sin depender de conocimiento técnico externo.
