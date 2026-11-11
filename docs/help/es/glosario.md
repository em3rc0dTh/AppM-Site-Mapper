# Glosario simple de Site Mapper

Este glosario explica las palabras que aparecen en Site Mapper usando lenguaje cotidiano. No necesitas experiencia en redes, electricidad ni sistemas para entenderlo.

La regla más importante es esta: **algunas palabras describen lugares, otras describen equipos y otras solo ayudan a ubicar esos equipos**. Una referencia de ubicación no significa que exista un equipo físico en ese punto.

## Cómo leer la jerarquía

Para los QDF del laboratorio, el recorrido puede verse así:

**Network → Site → Structure → Level → Room → Container Cluster / Bay → Position / Anchor → Rack → BDFB → Chassis → Shelf → Frame → Panel → Breaker**

No tienes que recorrer todos los niveles para operar el sistema. El árbol permite ver la jerarquía completa, mientras que las vistas directas permiten entrar al Rack, al BDFB, al Panel o al Breaker con menos clics.

## Network

**Qué es:** el nivel superior con el que Site Mapper agrupa una o más instalaciones.

**Para qué sirve:** permite que varias sedes pertenezcan a una misma infraestructura administrada.

**Qué no significa:** no es un equipo físico y no genera mediciones.

## Site

**Qué es:** una sede o instalación física.

**Para qué sirve:** agrupa los edificios, salas y equipos que pertenecen a ese lugar.

**Ejemplo:** una estación o sede donde existen racks y equipos eléctricos.

## Structure

**Qué es:** un edificio o estructura física dentro de una sede.

**Para qué sirve:** organiza los niveles o pisos.

## Level

**Qué es:** un nivel o piso de una estructura.

**Para qué sirve:** agrupa las salas que existen en ese nivel.

## Room

**Qué es:** una sala o ambiente físico.

**Para qué sirve:** contiene la distribución espacial de racks y otras referencias de ubicación.

## Container Cluster / Bay

**Qué es:** una zona física dentro de una sala que Site Mapper usa para agrupar posiciones relacionadas.

**Para qué sirve:** ayuda a ordenar dónde pueden ubicarse racks o gabinetes.

**Qué no significa:** no es un equipo eléctrico, no tiene telemetría y no necesita ser operado.

## Position / Anchor

**Qué es:** una referencia de posición dentro de una sala o de un Container Cluster.

**Ejemplo:** **QDF5 anchor** es la referencia que indica dónde se ubica el rack asociado a QDF-5.

**Para qué sirve:** relaciona el rack con una posición concreta del plano.

**Qué no significa:** no es el QDF, no es el BDFB y no genera mediciones.

## Footprint

**Qué es:** el espacio que ocupa un rack visto desde arriba.

**Ejemplo:** **600 × 600 mm** significa que el rack ocupa un área física de 600 mm de ancho por 600 mm de profundidad.

**Qué no significa:** no indica la altura del rack ni su capacidad eléctrica.

## Rack

**Qué es:** el gabinete físico que contiene uno o más equipos.

**Front Elevation:** muestra el rack de frente y permite ver qué equipos ocupan sus posiciones.

## Device

**Qué es:** un equipo principal administrado por Site Mapper.

**Ejemplo:** **BDFB QDF-5**.

En la interfaz se intenta mostrar el nombre real del equipo para que no tengas que pensar en la palabra “Device”.

## BDFB

**Qué es:** el equipo de distribución de energía que contiene la composición física y los circuitos que Site Mapper supervisa.

**Ejemplo:** **BDFB QDF-5**.

Desde su **Physical View** puedes ver Chassis, Shelves, Frames, Panels y Breakers.

## Equipment

**Qué es:** una pieza física que forma parte de un Device o de otro Equipment.

**Ejemplos:** Chassis, Shelf, Frame, Panel y Breaker.

La palabra existe en el modelo de Site Mapper, pero en las vistas operacionales se prefieren los nombres físicos reales.

## Chassis

**Qué es:** la estructura principal que contiene la composición interna del BDFB.

## Shelf

**Qué es:** una bandeja o nivel físico dentro del Chassis.

## Frame

**Qué es:** una estructura dentro de un Shelf que agrupa Panels.

## Panel

**Qué es:** un panel que contiene posiciones donde se instalan Breakers.

Un Panel puede tener posiciones libres. Una posición libre **no significa** que exista un breaker apagado.

## Breaker

**Qué es:** un interruptor o circuito individual instalado en una posición de un Panel.

Cuando tiene mediciones disponibles, Site Mapper puede mostrar Voltaje, Corriente, Potencia y Contador de Energía, además de su historial.

## Front Elevation

**Qué es:** la vista frontal del Rack.

**Para qué sirve:** permite identificar qué equipo está instalado y abrirlo.

No es un plano de la sala ni una lectura eléctrica.

## Physical View

**Qué es:** la vista de composición física del BDFB.

**Para qué sirve:** permite recorrer Chassis, Shelf, Frame, Panel y Breaker.

También puedes abrir directamente un Panel sin recorrer cada nivel intermedio.

## Operación

**Qué es:** la vista donde Site Mapper muestra el estado actual, lecturas, históricos y alarmas disponibles.

Una ausencia de datos no significa automáticamente que un equipo esté apagado.

## Reporte QDF

**Qué es:** un resumen histórico del comportamiento del QDF durante un período seleccionado.

Puede mostrar valores como mínimo, promedio, máximo, pico, energía del período y disponibilidad de datos.

## Reporte de Breaker

**Qué es:** un resumen histórico de un Breaker individual durante un período seleccionado.

Permite revisar su comportamiento sin mezclarlo con el resto de breakers del QDF.

## Si una palabra todavía no queda clara

Busca primero el objeto físico que conoces: **Rack, BDFB, Panel o Breaker**. Las palabras de ubicación —Network, Site, Room, Cluster, Position o Anchor— solo sirven para indicar dónde está ese objeto dentro de Site Mapper.
