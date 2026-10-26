# Help Center de Site Mapper MK1 · Manual de uso y mantenimiento

**Edición H1 · 26/10/2026.** Público: operadores, capacitadores y desarrolladores.  
**Estado real:** centro de ayuda y documentación contextual implementados. Los tours automáticos, capturas faltantes y diagramas Mermaid renderizados _en la app_ no están incluidos en H1.

## 1. Qué es

El Help Center acompaña a Site Mapper: no es un producto externo, CMS ni servicio adicional. **Su fuente de verdad son los archivos Markdown en `docs/user-guide/`.** Cada capítulo se escribe y mantiene una sola vez.

- **`/help`**: centro navegable y búsqueda sobre el contenido de los capítulos.
- **`/help/<slug>`**: lectura íntegra con índice lateral y navegación entre capítulos.
- **`? Ayuda`**: panel contextual en cabecera, que recomienda artículos según la ruta donde estás.
- **Búsqueda:** por título, resumen, palabras clave y texto de los capítulos, sin tildes y sin servidor de búsqueda.
- **Idioma:** la navegación, tarjetas y controles siguen el idioma seleccionado; **el cuerpo de cada capítulo se carga desde la edición inglesa o española según el idioma activo**, con archivos Markdown diferenciados y nombres de dominio preservados.

**No hace:** alterar hardware, guardar datos, cambiar permisos, reparar MQTT automáticamente, crear PowerPaths ni certificar la instalación física.

## 2. Cómo usarlo sin asistencia

1. Inicia sesión con tu cuenta, recibida por un canal autorizado. Si necesitas reemplazar una contraseña temporal, termina ese paso primero.
2. Abre `? Ayuda` en la barra superior. Lee el resumen de cada guía contextual.
3. Selecciona una guía para ver su contenido. La navegación no modifica el inventario ni afecta tus configuraciones.
4. Para revisar todos los temas, abre `/help` o selecciona **Explorar el centro de ayuda** en el panel.
5. Busca palabras como `rack`, `PowerPath`, `MQTT` o `STALE`. Usa los filtros por categoría para reducir resultados.
6. En el artículo, lee antes de operar: **Objetivo → prerrequisitos → pasos → resultado esperado → advertencias → recuperación**.
7. Si falta un control, revisa que estés en la pantalla correcta y que tu rol lo permita. **No intentes saltarte los permisos mediante API o MongoDB.**

### Qué capítulo abrir según la necesidad

| Quiero…                                              | Capítulo                                            |
| ---------------------------------------------------- | --------------------------------------------------- |
| Entrar y gestionar mi cuenta                         | Primer acceso y usuarios                            |
| Comprender Network, Room, Rack y Equipment           | Conceptos esenciales                                |
| Crear un Site/Structure/Level/Room                   | Crear y navegar entidades                           |
| Dibujar una Room y colocar Rack                      | Dibujar la sala y colocar un Rack                   |
| Componer Equipment y Panels                          | Device, Equipment y posiciones                      |
| Entender puertos ocupados y Feed A/B                 | Conexiones físicas de potencia                      |
| Comisionar MQTT y cuatro métricas                    | Commissioning MQTT                                  |
| Leer MQTT y SNMP separados, historia y salida Modbus | Recorrido de Login a MQTT, SNMP, Timescale y Modbus |
| Diagnosticar LIVE, STALE, UNMAPPED o NO DATA         | Comprobaciones y errores                            |
| Aprender sin cambiar datos                           | Práctica guiada de solo lectura                     |

El material de laboratorio usa nombres sintéticos; **no** reutilices seriales, OIDs o puntos de esos ejemplos en equipos reales.

## 3. Arquitectura de H1

```text
docs/user-guide/*.md + docs/user-guide/en/*.md                              ← Fuente única
src/modules/help/catalog.ts                        ← Allowlist, categorías, rutas
src/modules/help/server.ts                         ← Lectura de archivo y búsqueda
src/modules/help/components/markdown-article.tsx   ← Render seguro de Markdown
src/modules/help/components/help-explorer.tsx      ← Navegación y filtros
src/modules/help/components/contextual-help.tsx    ← Sugerencias en la pantalla actual
src/app/help/page.tsx                              ← Centro de ayuda protegido
src/app/help/[slug]/page.tsx                       ← Artículo protegido
src/app/help.css                                   ← Estilo responsive
```

No hay APIs nuevas, base de datos nueva, CMS, servicios terceros ni paquetes para la visualización.

## 4. Seguridad, límites y capturas reales

- El acceso en servidor exige permiso `topology:read`. Los capítulos solo se leen desde nombres de archivos declarados en el catálogo; el slug de la URL nunca se usa como ruta arbitraria de sistema.
- El contenido Markdown se convierte en nodos de React escapados, no se interpreta HTML sin control ni se ejecuta JavaScript.
- Los diagramas Mermaid existentes aparecen como **texto de diagrama**, no como una captura o gráfico verificado del producto. El render gráfico está pendiente.
- Los enlaces a otros artículos se mantienen en `/help`. Referencias técnicas pueden ir al repositorio para consulta.
- Las capturas auténticas siguen catalogadas en [Evidencia visual](evidencia-visual.md). **REAL**, **PARCIAL** y **PENDIENTE** no son equivalentes.
- Nunca fotografíes claves ni publiques datos de clientes: este repositorio es público.
- El paquete Docker incluye los Markdown en tiempo de ejecución. El trazado de archivos del framework también debe incluirlos.

## 5. Cómo mantenerlo correctamente

1. Una PR que cambie una pantalla o procedimiento también debe revisar el capítulo correspondiente bajo `docs/user-guide/`.
2. Validar en el código y en una sesión permitida el texto literal de cada control, su pantalla de origen y su resultado. No inventar botones.
3. Reescribir las secciones **dónde entrar, antes de empezar, qué pulsar, resultado, qué evitar, cómo recuperarse**.
4. Si el capítulo es nuevo, agregar el archivo y un registro en `helpCatalog` con un slug seguro. Actualizar `recommendHelp()` si corresponde.
5. Mantener resúmenes bilingües, y toda etiqueta UI en ambos catálogos `src/messages/en.json` y `es.json`.
6. Actualizar la [matriz de evidencia visual](evidencia-visual.md) con capturas autorizadas y su fecha/versión.
7. Ejecutar `npm run docs:check`, `npm run typecheck`, `npm run lint`, `npm run test` y `npm run build`.
8. Antes de aprobar, validar manualmente `/help`, búsqueda, pestañas, navegación anterior/siguiente, diálogos Escape/cerrar y permisos STANDARD/ADMIN, con teclado y en 1366×768, 1440×900 y móvil.

## 6. Hitos con evidencia separada

| Hito                                                                              | Estado                                              |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| H1: centro, buscador, lectura de Markdown, panel contextual, accesibilidad básica | Código implementado; pendiente validación CI/visual |
| H2: fotografías reales exhaustivas anotadas y ensayo con operador autónomo        | Pendiente                                           |
| H3: recorridos interactivos con controles, roles y estados validados              | Pendiente                                           |
| H4: cuerpos completos de guías traducidos y validados en inglés                   | Pendiente                                           |

**H1 no debe calificarse como manual final ilustrado ni onboarding E2E certificado** hasta completar la matriz visual y el ensayo de usuario real.

### Tours futuros: criterio de aceptación

Un recorrido de Blueprint debe identificar controles auténticos y verificar contexto/rol antes de explicar cada paso: abrir Room → `EDIT ROOM` → colocar Position/Rack → `SAVE LAYOUT` → reabrir. Nunca guardará por el usuario ni simulará éxito. Si se cambia de sala, se cancela. En STANDARD solo se explicará el recorrido, sin presentar acciones que no tiene permiso de ejecutar.

[Índice de lecciones](README.md) · [Práctica guiada](practica-guiada.md) · [Evidencias y capturas](evidencia-visual.md).
