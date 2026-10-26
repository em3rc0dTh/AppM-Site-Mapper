# Crear un sitio, edificio o sala

Los espacios se crean **desde el objeto que los contiene**. Por ejemplo, un Site nace dentro de una Network y una Room nace dentro de un Level.

## Antes de empezar

Abre **EXPLORE** y comprueba que estás en la instalación correcta. Si no aparecen botones de creación, puede que tu cuenta sea solo de consulta.

## Crear un Site

![Ejemplo real del botón para crear un Site](/help/screenshots/create-site.webp)

_En una Network encontrarás **+ CREATE SITE**. Escribe primero un nombre y después define su contorno._

1. Abre la **Network** donde estará el Site.
2. Selecciona **+ CREATE SITE**.
3. Escribe un nombre que permita reconocerlo.
4. Selecciona **Define boundary**.

![Editor real para dibujar el límite de un Site](/help/screenshots/draw-site-boundary.webp)

5. En **Draw / select**, marca los puntos del contorno en orden. Necesitas **al menos 3 puntos**.
6. Cierra el contorno y revisa que las líneas no se crucen.
7. Si un punto quedó mal, selecciónalo y muévelo. También puedes usar **Undo**, **Clear** o **Remove vertex** cuando correspondan.
8. Selecciona **Finish boundary** y vuelve al formulario de creación.
9. Confirma la creación del Site.
10. Revisa el árbol de la izquierda: el nuevo Site debe aparecer dentro de la Network correcta.

**Importante:** aquí no se utiliza **SAVE LAYOUT**. Ese botón pertenece al plano interno de una Room.

## Crear un Structure y un Level

1. Abre el Site correspondiente.
2. Selecciona **+ CREATE STRUCTURE**, escribe el nombre y define su límite.
3. Cuando el Structure esté creado, ábrelo.
4. Selecciona **+ CREATE LEVEL**, escribe el nombre y confirma.

Un Level organiza salas; no necesitas dibujar un nuevo contorno para cada Level en este paso.

## Crear una Room

![Ejemplo real del formulario Create Room](/help/screenshots/create-room.webp)

1. Abre el **Level** correcto.
2. Selecciona **+ CREATE ROOM**.
3. Escribe el nombre.
4. Selecciona **Define boundary**.
5. Dibuja un contorno válido dentro del espacio disponible y confirma la creación.
6. Abre la Room desde el árbol para comprobarla.

![Cómo se organiza una instalación](/help/diagrams/es/places.svg)

## Si no puedes guardar

Comprueba que el contorno esté cerrado, que no se cruce consigo mismo y que el nuevo espacio corresponda al padre que tienes abierto. Si el botón no aparece, revisa tus permisos.

**Resultado esperado:** el nuevo Site, Structure, Level o Room aparece debajo del objeto correcto y vuelve a aparecer después de recargar.

[Siguiente: organizar una Room y colocar un rack](espacios-y-racks.md).
