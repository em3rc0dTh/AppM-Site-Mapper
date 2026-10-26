# Site Mapper · Help Center para usuarios (documentación interna)

El Help Center de la aplicación está dirigido a **usuarios finales**, no a desarrolladores. Este archivo es una nota de mantenimiento para el equipo y **no aparece en la aplicación**.

## Contenido separado por público

| Ubicación | Uso |
| --- | --- |
| docs/help/es/*.md | Guías sencillas en español |
| docs/help/en/*.md | Guías equivalentes en inglés |
| public/help/diagrams/es y /en | Diagramas SVG ya renderizados, con etiquetas por idioma |
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