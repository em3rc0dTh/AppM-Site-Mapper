> **ACTUALIZACIÓN 26/10/2026:** este v1 reúne solo los 16 primeros casos de topología y archivado. El **catálogo de cobertura integral v2** se encuentra en [help-workflow-master-map-v2.md](help-workflow-master-map-v2.md) (177 flujos candidatos, 15 áreas). Los pasos críticos industriales y sus dependencias están en [help-workflows-industrial-detail-v2.md](help-workflows-industrial-detail-v2.md). Estos documentos preceden a cualquier ampliación pública del Help Center.

# Site Mapper MK1 — Contrato de flujos de trabajo para el Help Center

**Diseño previo al Help Center — 26/10/2026**  
**Estado:** borrador de producto (NO equivale a implementación, aprobación de reglas nuevas ni certificación).  
**Rama revisada:** feat/mk1-in-app-help-manual-2026-10-26, commit 319d0795.  
**Objetivo:** registrar qué tareas existen, qué pasos reales las componen, quién puede realizarlas, sus efectos y las condiciones que bloquean la operación. **Primero se aprueban flujos; después se escriben guías y recorridos.**

## 1. Diferencias que el producto debe dejar claras

- **Crear entidad:** dar de alta identidad y contexto físico.
- **Editar entidad:** modificar datos, geometría o distribución ya registrada, con validaciones de integridad.
- **Quitar un elemento del plano:** modificar el borrador de Blueprint; NO equivale a eliminación permanente.
- **Archivar entidad:** cambiar \`ACTIVE → ARCHIVED\` conservando su identidad e historia. Actualmente hay servicio y API; **no está confirmada una acción general de UI para archivar/restaurar topología desde su ficha**.
- **Restaurar entidad:** cambiar \`ARCHIVED → ACTIVE\` con el padre vigente y condiciones satisfechas.
- **Eliminar definitivamente:** quitar físicamente el registro y referencias; **NO es un flujo normal del producto ni hay \`DELETE\` de topología expuesto**. Contrato de dominio: hard delete reservado a limpieza administrativa/migración/pruebas sin referencias protegidas.
- **Eliminar PowerPath:** la ruta \`DELETE /api/power-paths/[id]\` ejecuta **archive**, no hard delete; requiere \`power:write\`. No confundir con entidad espacial.

Esta especificación distingue **HECHO** (comportamiento en código), **PARCIAL** (partes disponibles pero sin proceso completo) y **PROPUESTO** (política aún no implementada).

## 2. Modelo para cada workflow

Cada flujo debe describirse con los mismos campos:

| Campo                    | Qué captura                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| ID y nombre              | Identificador estable; título comprensible para el usuario       |
| Actor y autorización     | STANDARD, ADMIN o SUPERADMIN; comprobación también en servidor   |
| Punto de entrada         | Pantalla correcta, entidad padre, control visible                |
| Prerrequisitos           | Estado activo, geometría, dependencias, información obligatoria  |
| Secuencia feliz          | Clics y acciones en orden, literal si existen en UI              |
| Validación               | Restricciones del dominio, versiones y permisos                  |
| Confirmación             | Qué ve el usuario antes de ejecutar el cambio                    |
| Resultado                | Qué queda guardado, a dónde se navega y qué mensaje aparece      |
| Errores recuperables     | Qué se explica y cómo continuar sin perder datos                 |
| Recuperación             | Cancelar borrador, reintentar seguro, restaurar si procede       |
| Estado y evidencia       | Código que lo respalda, pruebas requeridas y capturas pendientes |
| Artículo del Help Center | Sólo si el flujo está implementado y revisado                    |

El Helper no debe fabricar pasos o asumir que tener una API garantiza un botón disponible.

## 3. Matriz inicial de flujos

| ID    | Tarea                                            | Estado 26/10                                      | Quién puede                                             | Cuándo documentar al usuario                  |
| ----- | ------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| WF-01 | Navegar Network → Site → Room → Rack             | HECHO                                             | Todos con \`topology:read\`                             | Ya                                            |
| WF-02 | Crear Network                                    | HECHO (servicio/formulario contextual)            | ADMIN / SUPERADMIN                                      | Tras validar ubicación real del control       |
| WF-03 | Crear Site y dibujar sus límites                 | HECHO                                             | ADMIN / SUPERADMIN                                      | Ya, con pasos exactos                         |
| WF-04 | Editar límites de un Site                        | HECHO (con reservas)                              | ADMIN / SUPERADMIN                                      | Tras comprobar containment de Structures      |
| WF-05 | Crear / editar Structure                         | HECHO (con reservas)                              | ADMIN / SUPERADMIN                                      | Tras comprobar límites de Rooms/descendientes |
| WF-06 | Crear Level, crear Room y dibujar perímetro      | HECHO                                             | ADMIN / SUPERADMIN                                      | Ya                                            |
| WF-07 | Editar sala, Bay, Position y Rack en Blueprint   | HECHO                                             | ADMIN / SUPERADMIN                                      | Ya, distinguir borrador/guardado              |
| WF-08 | Quitar Bay, Position o Rack desde Blueprint      | PARCIAL (guardas presentes, revisar dependencias) | ADMIN / SUPERADMIN hoy                                  | Tras revisar referencias y confirmar modal    |
| WF-09 | Archivar Site / Structure / Room                 | PARCIAL (API sin workflow general UI)             | ADMIN / SUPERADMIN hoy por \`topology:write\`           | NO: diseñar y completar antes                 |
| WF-10 | Restaurar entidad archivada                      | PARCIAL (API sin recorrido visible completo)      | ADMIN / SUPERADMIN hoy                                  | NO: inventario de archivadas y navegación     |
| WF-11 | Eliminar topología definitivamente               | NO IMPLEMENTADO para uso normal                   | Nadie en UI                                             | NO: no prometer función                       |
| WF-12 | Crear Device/Equipment; administrar posiciones   | HECHO (con reglas propias)                        | ADMIN / SUPERADMIN                                      | Documentar por tarea/rol                      |
| WF-13 | Mover o desmontar Device/Equipment               | PARCIAL según acción y dependencias               | ADMIN / SUPERADMIN                                      | Sólo pasos validados                          |
| WF-14 | Crear, revisar y archivar PowerPath              | HECHO en API, UI a verificar por caso             | ADMIN / SUPERADMIN con \`power:write\`                  | Por operación concreta                        |
| WF-15 | Mapear señales y consultar lecturas              | HECHO parcialmente según fuente configurada       | Escritura: actor autorizado; lectura: roles con permiso | No mezclar configuración y consulta           |
| WF-16 | Revisar cambios, cancelar y recuperar borradores | HECHO por editor; cobertura variable              | Según pantalla                                          | Documentar por editor                         |

Los campos **HECHO** no significan que todas las variantes y la UX estén certificadas mediante pruebas E2E.

## 4. WF-03 — Crear Site (flujo real)

**Actor:** ADMIN/SUPERADMIN con \`topology:write\`.  
**Entrada:** Network que será su padre (no una pantalla de Sites indiferenciada).  
**Prerrequisitos:** sesión válida, Network correcta y activa, nombre del nuevo Site.

1. Entrar por **EXPLORE** a la Network que contendrá el Site.
2. En esa Network, seleccionar **+ CREATE SITE** (etiqueta dependiente de traducción UI).
3. Escribir nombre y completar campos que solicite el formulario.
4. Seleccionar **Define boundary**. Se abre el editor de polígono.
5. En el canvas elegir los vértices en orden. **Mínimo 3**, no 4; máximo 256. Cuatro es lo usual para un rectángulo, pero se admite cualquier polígono simple válido.
6. Cerrar el polígono seleccionando el primer punto o el control para finalizar límite. Se pueden seleccionar/mover vértices y revisar antes de confirmar; Undo/Clear no son operaciones sobre entidades persistidas.
7. Seleccionar la confirmación del editor de límites; el formulario efectúa el alta de Site mediante POST \`/api/topology\` con la geometría.
8. Esperar respuesta, localizar el Site bajo la Network y reabrirlo. **No describir este guardado como SAVE LAYOUT:** ese botón corresponde a Blueprint de Room.

**Validaciones:** nombre válido; polígono con área positiva, sin autointersección y coordenadas admitidas; padre activo y correcto; autorización.  
**Bloqueos útiles:** invalid polygon, nombre vacío, permisos, padre archivado.  
**Evidencia de aceptación:** Site con ID propio, padre correcto y polígono persistente después de recargar.  
**Guía pública:** "Crear un sitio" solo después de confirmar las etiquetas de botones en la versión activa.

## 5. WF-04 — Editar perímetro de Site

**Actor:** ADMIN/SUPERADMIN.  
**Entrada:** ficha de un Site existente y activo; botón de edición de límites (no "Edit layout" genérico).  
**Pasos reales:**

1. Abrir el Site correcto.
2. Elegir **Editar límites** / control de edición que muestre la UI actual.
3. Seleccionar el vértice que se desea cambiar y arrastrarlo. Para agregar vértice, el editor permite seleccionar un segmento del polígono cerrado. Para quitar uno, usar **Remove Vertex** si la figura puede mantener al menos tres.
4. Comprobar la forma y confirmar desde el editor; la aplicación envía PUT \`/api/spatial/sites/[id]/boundary\` con la versión.
5. Reabrir el Site y comprobar los límites.

**Implementado:** edición de geometría, versiones optimistas (\`BOUNDARY_CONFLICT\`), validación de polígono y estado activo.  
**Brecha a resolver ANTES de certificar el flujo:** en \`site-boundary-service.ts\` no se ve una validación de que las Structures activas sigan contenidas tras estrechar el Site. Esa protección debe diseñarse y probarse. Nunca enseñar a desplazar límites ignorando construcciones internas.

## 6. WF-05 — Editar Structure

Análogo al Site, pero la nueva geometría **sí debe permanecer dentro del Site**: esto está implementado en \`structure-boundary-service.ts\`. Falta validar explícitamente que Room(s) activas bajo los Level(s) de la Structure no queden fuera después del cambio de límite. Cuando no haya colisión de dependencias, guardar con control de versión y verificar resultado.

## 7. WF-07 y WF-08 — Blueprint de Room (incluida la acción Remove selected)

**Actor:** ADMIN/SUPERADMIN.  
**Entrada:** Room activa → **Blueprint → EDIT ROOM**.  
**Secuencia:** cambiar límite de Room o agregar/editar Bay, Position y Rack → revisar borrador → **SAVE LAYOUT** → abrir otra vez.

**Remove selected ya existe** para elementos del borrador:

- Si se selecciona un **Bay/Cluster** con Positions aún presentes en el borrador, UI **bloquea** y pide retirar primero esas Positions.
- Si se selecciona una **Position** con Rack, UI **bloquea** y pide retirar primero el Rack.
- Si se selecciona un **Rack**, el editor puede quitarlo del borrador. Al guardar, el servicio valida que no tenga hijos activos y que su CAS no tenga asignaciones \`RESERVED/EQUIPPED\`; si los tiene, devuelve \`RACK_NOT_EMPTY\`.
- Un elemento existente que se omite en la nueva versión del layout queda **ARCHIVED** mediante la transacción \`commitLayout\`, no se borra de MongoDB.
- El cambio persiste **solamente con SAVE LAYOUT**. \`Remove selected\` solo modifica la vista editada hasta ese momento.

**Brecha de seguridad a revisar:** controles de dependencias no reducidas al árbol visible (incluyendo conexiones, bindings, historias o referencias históricas), y mensaje de confirmación comprensible antes del guardado que retire objetos.

## 8. WF-09 — Propuesta de retirar/archivar una entidad (NO presentar como implementado en UI)

### Objetivo del usuario

**Retirar del uso una entidad que ya no se necesita, sin arriesgar otros espacios, equipos o registros.** En público llamarlo "Archivar" o "Retirar", evitando prometer "Eliminar definitivamente".

### Política de producto propuesta

1. **Sin cascada automática.** Un Site con Structures, Levels, Rooms, Racks o equipos activos **no puede archivarse**. La condición se verifica en servidor; UI solo explica.
2. No confiar únicamente en \`listChildren(id)\`: revisar la existencia de descendientes relevantes, composiciones por IDs, CAS reservado/ocupado, conexiones PowerPath y mappings de telemetría. Definir el detalle por tipo de entidad.
3. Si existen hijos archivados o referencias históricas, mantener relación y restauración coherente; **el diseño aún debe decidir la restricción exacta sobre archivados históricos**. No publicitar borrado permanente.
4. El actor deberá tener una autorización específica. **Recomendación inicial: SUPERADMIN para archivar Site, Structure, Level y Room** usando permiso nuevo \`topology:archive\` o un permiso de peligro adecuadamente segregado; ADMIN solo para operaciones específicas de retiro de elementos hoja si se aprueban. Hoy \`topology:write\` habilita la API de archive para ADMIN y SUPERADMIN: **debe restringirse** antes de exponer interfaz.
5. Antes de confirmar, mostrar nombre, tipo, ubicación, efecto, objetos activos y dependencias. Si hay dependencias, botón de confirmación deshabilitado con enlaces para inspeccionarlas.
6. Modal de confirmación no preseleccionado y mensaje específico: "Archivar sitio X" y "Este sitio dejará de aparecer en las vistas habituales. Puedes restaurarlo si cumple las condiciones".
7. El backend deberá revalidar el estado en la escritura y proteger concurrencia con versión/transacción/guardas atómicas. \`TopologyService.archive\` hoy lee hijos y después hace \`repository.replace\` sin un guardado condicional equivalente a \`replaceIfVersion\`; **posible carrera** si se añade hijo a la vez. No declarar robustez concurrente hasta corregir.
8. Registrar auditoría: usuario, entidad, operación, timestamp y resultado. La API actual no prueba una auditoría de la acción de archive en el handler revisado.
9. Proveer vista **Archivadas** para RESTORE y restricciones de padre. No presentar archivo como permanente.
10. Si cambia algún prerequisito durante la confirmación, responder conflicto con un mensaje claro, **sin modificar nada**.

### Estados del proceso propuesto

```text
Seleccionar entidad
  -> Consultar dependencias y permiso
  -> ¿Tiene hijos activos o relaciones que requieren atención?
       Sí: mostrar bloqueo y accesos para revisar elementos
       No: mostrar confirmación exacta de entidad/efecto
  -> Usuario confirma
  -> Servidor valida de nuevo rol, estado, versión y dependencias
  -> ¿Algún dato cambió?
       Sí: operación cancelada; explicar conflicto y actualizar vista
       No: ARCHIVED + auditoría + salida del árbol de activos
  -> Opción de restaurar desde Archivadas
```

### Mensajes públicos sugeridos

- **Con hijos:** "No puedes archivar este sitio porque todavía contiene 3 edificios. Revisa sus espacios antes de continuar."
- **Sin autorización:** "Tu cuenta no tiene permiso para archivar este elemento."
- **Con dependencias:** "Este equipo sigue vinculado a una conexión. Revisa la conexión antes de archivarlo."
- **Con cambios concurrentes:** "El contenido cambió mientras realizabas esta operación. Actualiza la página y revísalo de nuevo."
- **Éxito:** "Sitio archivado. Ya no aparecerá en la lista habitual." (Mostrar acceso a restauración si corresponde.)

No exponer \`HAS_ACTIVE_CHILDREN\`, \`CAS_RELEASE_REQUIRED\` u otros códigos internos como texto principal para usuarios.

## 9. WF-10 — Restauración

**Existe** \`PATCH /api/topology/[id]\` con action \`restore\`. El servicio exige padre existente/activo y comprueba algunas relaciones de Equipment. **Falta un proceso de navegación, permisos/confirmación y validación integral para el usuario.**

Flujo propuesto: **Archivadas → filtrar → seleccionar → revisar padre disponible, colisiones, seriales y dependencias → confirmar → restaurada**. Debe mantener el mismo ID sin inventar un duplicado. Si una restauración alteraría geometría o ocupación, impedirla y explicar por qué.

## 10. Riesgos de integridad detectados para la fase de diseño

| Hallazgo                    | Situación en código                                                                     | Acción propuesta                                                |
| --------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Permiso de archivar         | API comparte \`topology:write\` con edición                                             | Separar permiso peligroso por operación                         |
| Niños directos              | \`archive\` bloquea hijos **activos** directos                                          | Expandir y definir dependencias por tipo                        |
| Referencias externas        | No hay comprobación demostrada de PowerPath/telemetría en \`archive\`                   | Hacer preflight de dependencias                                 |
| Concurrencia                | Leer hijos y luego \`replace\` no es operación atómica conjunta                         | Proteger con transacción/versión y creación de hijos coordinada |
| Experiencia                 | No se halló control general de Archive/Restore en la ficha de topología                 | Crear UI autorizada y estados vacíos/bloqueados                 |
| Cambiar límite de Site      | El servicio revisado valida polígonos/versiones, no contención de Structures existentes | No permitir sacar construcciones fuera del Site                 |
| Cambiar límite de Structure | Validación contra Site, no comprobación visible de Rooms descendientes                  | Comprobar hijos tras cambiar contorno                           |
| Blueprint remove            | Pasa de borrar borrador a archivar al guardar                                           | Mostrar confirmación de retiros y dependencias                  |
| Recuperación                | API de restore parcial                                                                  | Diseñar lista Archivadas y revalidación de conflictos           |
| Ayuda                       | Help Center anterior redactado antes de cerrar flujos                                   | Solo publicar guías de estados ejecutables validados            |

**Importante:** el hecho de que algunas verificaciones no estén visibles en el servicio revisado no sustituye una auditoría técnica de todas las integraciones. Este documento es un catálogo de flujos y brechas confirmadas en lectura, no ejecución ni prueba en una base real.

## 11. Orden de trabajo recomendado

**GATE WF-A — Definición:** revisar cada flujo con producto, backend y UI; aprobar privilegios y semántica Archive/Restore vs Delete.

**GATE WF-B — Integridad:** implementar preflight, guards atómicos, bloqueo por hijos/relaciones, contención geométrica, auditoría y mensajes amistosos.

**GATE WF-C — Interfaz:** completar acción, confirmación, estado bloqueado y lista Restaurar.

**GATE WF-D — Certificación:** pruebas de datos reales/sintéticos, concurrencia, permisos, recuperar historial y demostración en navegador con el rol autorizado.

**GATE WF-E — Help Center:** solo ahora generar por workflow artículo sencillo, diagramas ya renderizados, capturas del proceso real, ayuda contextual y recorrido interactivo. Cada guía referencia un ID WF y versión aprobada.

**Regla: no inventar "Delete Site" en el Help Center hasta que el workflow haya pasado GATE WF-D.**
