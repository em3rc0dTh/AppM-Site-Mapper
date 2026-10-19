# Matriz de evidencia visual · Manual Maestro MK1

**Objetivo:** ninguna instrucción dirigida a una persona sin experiencia puede depender de «busca algo parecido». Cada acción debe asociarse a una **captura auténtica** de la versión correspondiente, con el botón numerado, estado anterior y resultado posterior, redactados en español.

## Convención editorial de las imágenes

- **REAL / VERIFICADA:** captura de la UI implementada, con estado visible y sin secretos. Puede explicar visualmente un paso.
- **REAL / ERROR:** captura auténtica de un fallo; útil para el capítulo de resolución, **no** como ejemplo de éxito.
- **PENDIENTE:** todavía no hay captura de esa interacción validada. Nunca sustituir por una imagen de diseño generada.
- **DIAGRAMA CONCEPTUAL:** muestra relaciones (modelo/flujo), pero **no** simula la UI.
- La evidencia de una base de aceptación, como `site_mapper_mk1_acceptance_02`, se identifica como **entorno de aceptación**. No declararla producción.

## Qué debe tener cada imagen de un paso

1. **ID** estable y nombre de la pantalla.
2. **Dónde estoy:** ruta funcional y nombre de entidad padre.
3. **Qué debo pulsar:** número y flecha sobre el control real.
4. **Qué escribo:** datos sintéticos autorizados, sin credenciales.
5. **Qué ocurre:** captura posterior, estado esperado y su significado.
6. **Qué no hacer:** error/prohibición que se evita.
7. **Fecha/versión/rol de captura** y responsable de validación.

## Catálogo obligatorio de capturas (secuencia de lectura)

| Fase | IDs | Capturas y estados requeridos | Evidencia actualmente disponible |
| --- | --- | --- | --- |
| 01. Login | UI-01 a UI-04 | Login, campos Email/Password, SIGN IN, error seguro | **PENDIENTE** |
| 02. Primer acceso | UI-05 a UI-08 | Change password, retorno a Login, Workspace | **PENDIENTE** |
| 03. Usuarios | USR-01 a USR-08 | Settings, Users, + ADD USER, formulario, ACTIVE, gestión de estado, Roles | **PENDIENTE** |
| 04. Navegación | NAV-01 a NAV-04 | EXPLORE, árbol Network/Site/Structure/Level/Room, breadcrumb, volver | **PARCIAL:** árbol visible en capturas de Room y Equipment |
| 05. Alta espacial | ESP-01 a ESP-08 | + CREATE SITE/STRUCTURE/LEVEL/ROOM, Define boundary, Save Site/Room, aparición en árbol | **PARCIAL:** editor de polígono de Room, capturas antiguas con error HTTP/JSON |
| 06. Room Blueprint | BP-01 a BP-08 | EDIT ROOM, Bay, Position, Place Rack, SAVE LAYOUT, Rack confirmado | **PENDIENTE:** capturas de transición completa |
| 07. Rack y CAS | RACK-01 a RACK-06 | Rack Elevation, EDIT CAS, reservar U, montar, lectura EQUIPPED | **PENDIENTE** |
| 08. Device | DEV-01 a DEV-04 | Crear Device, formulario, guardar, ficha en Rack | **PENDIENTE** |
| 09. Equipment | EQ-01 a EQ-08 | ADD EQUIPMENT, Warehouse/One-off, Panel POSITIONAL, slot vacío/ocupado, breaker | **PARCIAL:** fichas reales de Equipment y Panel |
| 10. Access Port | AP-01 a AP-06 | ACCESS PORTS, creación y edición, POWER OUTPUT libre/CONNECTED, peer | **REAL:** inspector CB-01 y NETWORK BOARD conectados |
| 11. PowerPath | PWR-01 a PWR-08 | Source, Destination, revisión Feed, CONFIRM, SOURCE_ALREADY_CONNECTED, VIEW POWERPATH | **REAL:** formulario bloqueado por fuente ocupada y ambos extremos CONNECTED |
| 12. Trace | TRACE-01 a TRACE-04 | Full Power Trace, Feed A y B, origen/destino, estados | **PARCIAL:** traza vista en capturas del laboratorio |
| 13. MQTT | MQTT-01 a MQTT-06 | Panel MQTT commissioning, confirmación, conflicto, 4/4 | **PENDIENTE de capturas completas** |
| 14. LIVE e histórico | TEL-01 a TEL-06 | Latest State, LIVE, STALE, 24H/7D, sin histórico | **PARCIAL:** capturas de diagnóstico y estado telemetría |
| 15. Modelo de datos | DB-01 a DB-05 | MongoDB Compass: base de aceptación, `topology_nodes`, `kind`, Equipment.accessPorts, `power_paths` | **REAL:** capturas de Compass de base `site_mapper_mk1_acceptance_02` |
| 16. Práctica completa | FIN-01 a FIN-05 | Pantallas consecutivas y checklist de evaluación autónoma | **PENDIENTE** |

### Material auténtico ya suministrado en el proyecto

- `image(20261019-165537).png`: CB-01 y Power output **CONNECTED**, vínculo a NETWORK BOARD.
- `image(20261019-165548).png`: NETWORK BOARD, AP-01-01 **CONNECTED**, relación inversa.
- `image(20261019-165606).png`: formulario Connect Equipment Power bloqueado con **SOURCE_ALREADY_CONNECTED**.
- `image(20261013-220254).png` y `image(20261013-220840).png`: editor de contorno de Room **con fallos de guardado**. Usar únicamente en apartado de errores.
- `image(20261019-204251).png` y `image(20261019-204300).png`: MongoDB Compass, estructura/colecciones de la base de aceptación.

Los nombres identifican evidencias compartidas en el proyecto, **no rutas garantizadas dentro del repositorio**. Cualquier incorporación a GitHub debe pasar por control de sensibilidad y aprobación del material.

## Modelo de ficha visual por microtarea

**PWR-05 · Origen ocupado**

- **Dónde estoy:** Equipment CB-01 / Power output.
- **Qué veo:** CONNECTED y `FEEDS → NETWORK BOARD / AP-01-01`.
- **Acción autorizada:** abrir **VIEW POWERPATH** para comprender la ruta.
- **Acción prohibida:** registrar una segunda conexión desde ese AP.
- **Resultado verificable:** el formulario indica `SOURCE_ALREADY_CONNECTED` y no permite **CONFIRM PHYSICAL CONNECTION**.

## Criterios antes de publicar al usuario final

- [ ] Capturas reales de **cada paso que exige un clic**, empezando por Login.
- [ ] En cada tarea: estado antes/después, botón y resultado.
- [ ] Usuario de prueba completa Login, crear entidades y verificar un PowerPath sin preguntar al desarrollador.
- [ ] Una segunda persona independiente repite el ejercicio y reconoce los estados de error.
- [ ] No existen ejemplos que muestren una operación fallida como éxito.
- [ ] Las capturas excluyen datos de cliente, credenciales y URLs privadas.
- [ ] La versión del documento concuerda con el commit de código usado en las imágenes.

**Estado editorial:** el texto del manual maestro es utilizable como guía de operaciones y referencia del modelo; **el paquete ilustrado final permanece pendiente de capturas y aceptación de usuarios nuevos**.

[Manual maestro](manual-maestro.md) · [Modelo de datos](modelo-de-datos.md) · [Plan de capturas anterior](capturas-y-capacitacion.md).
