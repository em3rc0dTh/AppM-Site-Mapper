# Site Mapper · Help Center para usuarios (documentación interna)

El Help Center de la aplicación está dirigido a **usuarios finales**, no a desarrolladores. Este archivo es una nota de mantenimiento para el equipo y **no aparece en la aplicación**.

## Contenido separado por público

| Ubicación                         | Uso                                                              |
| --------------------------------- | ---------------------------------------------------------------- |
| docs/help/es/*.md                 | Guías sencillas en español                                       |
| docs/help/en/*.md                 | Guías equivalentes en inglés                                     |
| public/help/diagrams/es y /en     | Diagramas SVG ya renderizados, con etiquetas por idioma          |
| docs/user-guide y docs/operations | Referencia detallada de técnicos, responsables y desarrolladores |

La aplicación busca y muestra **solo** archivos aprobados de docs/help. Los manuales técnicos anteriores se conservan en el repositorio, pero no se consultan desde la vista de ayuda.

## Cómo escribir para el usuario

1. Titula por tarea: “Colocar un rack”, “Ver las lecturas”, “Entrar al sistema”.
2. Usa frases breves, preguntas habituales, pasos numerados y un resultado observable.
3. Emplea el nombre verdadero del botón y explica para qué sirve. No muestres comandos, API, bases de datos, notas de laboratorio ni instrucciones de depuración.
4. Si una opción requiere permisos especiales, dilo de forma sencilla.
5. En energía, recuerda que una ruta registrada no demuestra presencia real de corriente; NO DATA no demuestra apagado.
6. Si cambia el procedimiento, actualiza sus versiones en ambos idiomas.
7. Las figuras se entregan como SVG visibles: formato de contenido `![Descripción](/help/diagrams/es/rack.svg)`. No publicar Mermaid como texto.
8. Ningún artículo debe contener datos privados de instalaciones o clientes.

## Implementación

- src/modules/help/catalog.ts: slugs estables, títulos y categorías.
- src/modules/help/server.ts: búsqueda y lectura por idioma en docs/help.
- src/modules/help/components/markdown-article.tsx: muestra SVG de una lista de archivos autorizados sin aceptar HTML arbitrario.
- src/app/help: centro navegable y capítulos.
- src/modules/help/components/contextual-help.tsx: guías según pantalla.
- infra/site-mapper/Dockerfile y next.config.ts: empaquetan guías en el runtime.

## Comprobación

La CI revisa catálogo, idioma, existencia de SVG, typecheck, lint, formato y build. Aún debe verificarse manualmente en un navegador autenticado: lectura en ambos idiomas, diagramas visibles, búsqueda, enlaces y desplazamiento móvil. Las ilustraciones SVG son conceptuales, no capturas de pantalla real.

## Enfoque por workflows (v3)

El Help Center ofrece **23 guías en español y 23 en inglés**, conectadas en cinco recorridos: espacios, equipos, conexiones, lecturas y tareas habituales. Las imágenes son **ocho diagramas conceptuales SVG por idioma**, no capturas fotográficas ni esquemas Mermaid sin procesar.

- **Fuentes de producto:** `docs/product/help-workflow-master-map-v2.md` contiene 177 workflows candidatos. `docs/product/help-workflows-industrial-detail-v2.md` documenta las dependencias industriales y la recuperación. La referencia interna de cada artículo figura en `helpWorkflowCoverage` de `src/modules/help/catalog.ts`.
- **Navegación de usuario:** `helpJourneys` agrupa guías por objetivo; `/help/[slug]` muestra el paso actual y la secuencia relacionada. En móviles, la navegación debe mantener scroll accesible.
- **No es 177 artículos públicos:** muchos flujos del mapa requieren config/CLI, API técnica o aún están en diseño. Ninguno se presentará como una opción de Site Mapper si no tiene pantalla y resultado corroborados.
- **Eliminación segura:** Help explica la diferencia entre `Remove selected` de Blueprint, `Archive` de Equipment y ausencia de `Delete Site` general. No sugiere hard delete ni cascadas.
- **Configurar mediciones:** MQTT y SNMP tienen guías distintas, con requisito de identidad física, confirmación y estado final. La creación de puerto SNMP y el registro de OIDs son dos pasos persistentes; si el segundo falla, la guía no debe recomendar crear otro puerto.
- **Soporte:** explicaciones de estados, conexión y medición separan registro lógico de verdad física. El usuario necesita ayuda clara; el integrador recibe los runbooks técnicos.

**Aceptación pendiente:** revisar en navegador auténtico ambos idiomas, la secuencia de recorridos, pantallas con permisos, dispositivos móviles, y las acciones de guardar/archivar. CI certifica código y vínculos, no topología física ni resultados de usuario.


## Contrato editorial para usuarios nuevos

La ayuda pública debe partir de **la tarea del usuario**, no del nombre interno del subsistema. El orden recomendado para una persona sin experiencia es:

1. orientarse en Site Mapper;
2. entender Network → Site → Structure → Level → Room → Rack → Equipment;
3. crear espacios;
4. organizar una Room y colocar racks;
5. abrir un rack y reconocer su ocupación;
6. preparar Panel/Breakers;
7. revisar PowerPath;
8. leer V/A/W/kWh;
9. comprender la relación MQTT;
10. consultar históricos y resolver estados sin datos.

Los términos **CAS**, **commissioning**, **OID**, **TimescaleDB**, **binding** y similares se presentan únicamente después de explicar la acción que resuelven.

### Evidencia visual

Las capturas reales se usan cuando responden a una acción concreta: **Create Site**, dibujo del boundary, **Create Room**, **EDIT ROOM**, Rack Focus, breaker LIVE y Power Path. Los SVG conceptuales se conservan solo cuando explican una relación que no cabe en una única captura.

Reglas:

- cada imagen debe responder "dónde estoy", "qué debo pulsar" o "qué resultado debo ver";
- no repetir capturas solo para decorar;
- los artículos muestran una leyenda debajo de cada imagen;
- las capturas de laboratorio no demuestran cableado real, exactitud de sensor ni disponibilidad de producción;
- una pantalla que muestre `LIVE` ilustra una lectura reciente; no certifica el circuito físico;
- los artículos de edición deben explicar en lenguaje normal que el usuario necesita permisos para hacer cambios;
- Help Center no expone runbooks de infraestructura al usuario Standard.

### Dos capas de navegación

`/help` presenta primero una **ruta recomendada de diez pasos para nuevos usuarios**. Debajo se mantienen los recorridos por objetivo y, finalmente, el buscador completo de artículos.

Esto evita que una persona nueva tenga que decidir entre conceptos como MQTT, SNMP o PowerPath antes de entender la jerarquía física y la navegación.
