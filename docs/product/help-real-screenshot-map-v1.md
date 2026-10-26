# Help Center — mapa de evidencia visual real

**Fecha:** 26/10/2026 · **Uso:** interno. Este inventario relaciona las capturas recibidas con los workflows del Help Center. No se muestra al usuario.

## Criterio editorial

Las capturas reales enseñan **dónde hacer clic y qué debería verse**. Los SVG explican **qué significa** un concepto. No se publica una captura solo por existir: cada imagen debe aportar una decisión o paso y no debe depender de valores concretos del laboratorio.

Las capturas pueden contener nombres y valores de ejemplo. El Help Center debe evitar tratarlos como defaults. Los estados `LAB SIMULATED`, `LIVE` y `Configured` se explican expresamente para no convertir evidencia de software en una afirmación física.

## Capturas seleccionadas para publicación

| Asset publicado           | Captura fuente | Uso en Help Center                                        |
| ------------------------- | -------------- | --------------------------------------------------------- |
| `create-site.webp`        | 12:32:11       | Reconocer **+ CREATE SITE**, nombre y **Define boundary** |
| `draw-site-boundary.webp` | 12:32:18       | Reconocer Draw/select, vértices y **Finish boundary**     |
| `create-room.webp`        | 12:32:55       | Reconocer **+ CREATE ROOM** y el formulario               |
| `edit-room.webp`          | 12:33:23       | Reconocer EDIT ROOM, borrador, herramientas y SAVE LAYOUT |
| `rack-focus.webp`         | 12:33:43       | Distinguir Rack Focus, OPEN RACK ELEVATION y TRACE POWER  |
| `breaker-live.webp`       | 12:35:23       | Reconocer breaker, LIVE, V/I/P/E, Source y Last packet    |
| `power-path.webp`         | 12:35:28       | Leer Source → Output → Feed → Input → Destination         |

Todos los assets se guardan bajo `public/help/screenshots/`, son copias recortadas y comprimidas de las capturas entregadas y se sirven dentro del mismo build de Site Mapper.

## Evidencia de referencia revisada

| Hora     | Pantalla / evidencia                | Uso recomendado                               |
| -------- | ----------------------------------- | --------------------------------------------- |
| 12:32:01 | Workspace / Infrastructure overview | Orientación inicial; métricas y Direct Access |
| 12:32:07 | Network view                        | Jerarquía de navegación                       |
| 12:32:11 | Create Site                         | Publicada                                     |
| 12:32:18 | Draw Site Boundary                  | Publicada                                     |
| 12:32:27 | Site con Structure                  | Confirmación posterior a creación             |
| 12:32:31 | Create Structure                    | Complemento de creación espacial              |
| 12:32:38 | Structure view                      | Navegación hacia Level                        |
| 12:32:43 | Create Level                        | Formulario de Level                           |
| 12:32:50 | Level view                          | Navegación hacia Room                         |
| 12:32:55 | Create Room                         | Publicada                                     |
| 12:33:01 | Room / Blueprint                    | Vista normal de Room                          |
| 12:33:08 | Room edit                           | Herramientas de edición                       |
| 12:33:17 | Place Rack / Position               | Campos de ubicación                           |
| 12:33:23 | EDIT ROOM / Save Layout             | Publicada                                     |
| 12:33:36 | Rack seleccionado en Room           | Inspect / Open rack focus                     |
| 12:33:43 | Rack Focus modal                    | Publicada                                     |
| 12:33:49 | Front elevation                     | Capacidad y ocupación U                       |
| 12:33:56 | Edit CAS                            | Reserva, montaje y allocation                 |
| 12:34:05 | Rack Equipment inspector            | Open Equipment / Trace Power                  |
| 12:34:15 | Chassis + SNMP capacity             | Capacidad DC; LAB SIMULATED                   |
| 12:34:35 | BDFB Overview                       | Resumen SNMP / utilización                    |
| 12:34:40 | BDFB Inputs                         | Entradas A/B y OIDs del laboratorio           |
| 12:34:43 | BDFB Charts                         | Historial SNMP y MQTT separados               |
| 12:34:47 | BDFB Settings                       | Configuración de DC Inputs / mantenimiento    |
| 12:34:53 | Chassis composition                 | Shelf / Frames / paneles                      |
| 12:34:57 | Panel vacío                         | 0/24; distinguir capacidad e instalación      |
| 12:35:04 | Panel Overview                      | 3/24 y datos de identidad                     |
| 12:35:07 | Panel Telemetry                     | Promedios de breakers reportando              |
| 12:35:14 | Panel history                       | Charts por magnitud                           |
| 12:35:19 | Breaker Telemetry tab               | Lectura propia del breaker                    |
| 12:35:23 | Breaker LIVE                        | Publicada                                     |
| 12:35:28 | Power Path                          | Publicada                                     |

## Capturas que no se publican todavía

Las pantallas de SNMP Settings, OIDs, CAS y mantenimiento quedan como evidencia interna hasta que sus workflows estén aprobados para el rol destinatario. Son útiles para capacitación técnica, pero añadirlas al recorrido inicial aumentaría la carga cognitiva de un usuario nuevo.

## Regla para nuevas capturas

Una captura se publica cuando responde al menos una pregunta concreta del usuario: **¿dónde estoy?, ¿qué botón uso?, ¿qué debería ver después?, ¿qué estado significa esto?**. Si no responde una de esas preguntas, permanece como evidencia interna.
