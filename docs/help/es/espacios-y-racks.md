# Organizar una sala y colocar un rack

Dentro de una **Room**, Site Mapper muestra un plano llamado **Blueprint**. En modo normal puedes inspeccionarlo; con permisos de edición puedes cambiar su distribución.

## Antes de editar

Abre la Room correcta y revisa su nombre. El botón **EDIT ROOM** debe estar disponible para tu cuenta.

## Entrar al modo de edición

![Vista real de EDIT ROOM y sus herramientas](/help/screenshots/edit-room.webp)

1. Selecciona **EDIT ROOM**.
2. La parte superior mostrará **EDIT · UNSAVED DRAFT**. Eso significa que todavía estás trabajando en un borrador.
3. En el panel lateral puedes encontrar:
   - **EDIT ROOM BOUNDARY** para modificar el contorno de la sala.
   - **+ Draw Bay / Cluster** para dibujar una zona.
   - **+ Place Rack** para colocar un rack.
   - **+ Place Empty Position** para reservar una posición vacía.
   - **SELECT / EDIT** para seleccionar un elemento ya existente.

## Colocar un rack

1. Abre **+ Place Rack**.
2. Escribe un nombre reconocible.
3. Elige el **Bay / Cluster** correspondiente.
4. Revisa ancho, profundidad y capacidad U si la pantalla los solicita.
5. Colócalo en la posición indicada por el canvas.
6. Comprueba visualmente que el rack quedó dentro de la zona correcta.
7. Selecciona **SAVE LAYOUT**.

**SAVE LAYOUT es el paso que hace persistente la distribución.** Si seleccionas **Cancel** antes de guardar, los cambios del borrador no deben considerarse confirmados.

## Abrir el rack después de guardarlo

![Vista real de Rack Focus dentro de una Room](/help/screenshots/rack-focus.webp)

Al seleccionar un rack puedes encontrar acciones diferentes:

- **Open rack focus**: abre una vista rápida del rack.
- **OPEN RACK ELEVATION**: muestra su ocupación en unidades U.
- **TRACE POWER**: sigue sus conexiones de alimentación registradas.
- **INSPECT**: muestra información del objeto sin moverlo.

No confundas **abrir o inspeccionar** con **editar la distribución**.

## Si Remove selected está bloqueado

El objeto puede contener otros elementos. Por ejemplo, una Position puede contener un Rack y un Rack puede contener Equipment. Revisa primero sus dependencias; no retires objetos en cascada solo para conseguir guardar.

**Resultado esperado:** al salir y volver a la Room, el rack aparece en la posición guardada y puedes abrirlo desde el plano.

[Siguiente: ver y organizar los equipos de un rack](equipos-y-posiciones.md).