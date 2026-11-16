# Rastreo de Ruta v2.1 — ventana operacional

Estado (2026-11-16): **PR #226 fusionado en `main`**, código integrado; **UAT visual y funcional FIELD pendiente**. Ver [UAT MK1 v2.0](../certification/rfp-acceptance/10-UAT-MK1-V2-PLAN.md) (UAT-401..406, UAT-601).

## Entrada

Desde los controles de Power Trace existentes en Device, Equipment y Power se abre una ventana independiente, con el mismo lanzador usado por los workbenches de gráficas e informes:

- \`/workbench/power-trace?entityId=<id>\`
- \`/workbench/power-trace?entityId=<id>&path=<powerPathId>\` para resaltar una ruta.

La URL requiere sesión con permiso \`power:read\`; el módulo se abre como ventana independiente, sin modal ni menús laterales, pero reutiliza el **Workbench Shell MK2** con la identidad canónica \`AppManager SiteMapper Mk2\` y acceso a inicio. Los lectores sin \`telemetry:read\` no ven telemetría en la ventana.

## Contenido y reglas

- Workbench Shell MK2, fondo claro, título «Rastreo de Ruta», identidad del equipo y ubicación real. No se presenta branding \`Site Mapper MK1\` dentro del contenido.
- Feed A / equipo / Feed B en tres columnas; responsive apilado.
- Cada lado lista los PowerPaths registrados. Si hay varios, no oculta rutas adicionales.
- El recorrido usa exclusivamente fuente, Shelf / Frame (si existen), Panel, Breaker y AccessPorts obtenidos del servicio de trazabilidad. No se inventan elementos físicos ausentes.
- Telemetría V/I/P/E del breaker con timestamp; se recalcula la frescura desde \`receivedAt\`, según la política de 5 minutos y 3 intervalos perdidos del módulo telemetry-freshness. La ventana refresca la consulta cada 60 s y el reloj cada 30 s.
- Conciliación: estado PowerPath, vínculo MQTT y lectura. Los Excel no tienen actualmente una referencia de archivo/hoja/fila vinculada al DTO \`FullPowerTrace\`; por tanto «Sin referencia vinculada» **no equivale** a discrepancia ni a falta de archivos. La reconciliación de Excel requiere enlazar la evidencia documental al modelo, sin inventar coincidencias.
- Hallazgos concretos, sin tarjetas genéricas de redundancia, validación u orígenes simulados.
- Acciones inferiores: solo abrir los breakers presentes.
- Acciones superiores: refrescar; gráfica del BDFB seleccionado (cuando está disponible); exportar mediante imprimir/«Guardar como PDF»; imprimir.

## Límites de verdad

- PowerPath registrado != alimentación energizada.
- Dos rutas A/B != independencia eléctrica certificada.
- MQTT vinculado != lectura LIVE.
- Lecturas STALE/OFFLINE son históricas; no se presentan como medición en tiempo real.
- No se ingieren ni modifican Excel, persistencia ni telemetría en este cambio.

## Validación operacional pendiente después del merge

1. Abrir Power Trace desde Device, Equipment y Power; confirmar popup independiente y ausencia de modal.
2. Confirmar A3 con sus rutas reales (sin valores sintéticos) y navegar a ambos breakers.
3. Revisar equipo sin rutas, solo A, solo B, múltiples rutas y rutas sin feed.
4. Confirmar LIVE/STALE/OFFLINE, bindings ausentes y timestamps recientes.
5. Comparar layout a 1440×900, 1280×720 y zoom 125%; comprobar impresión/PDF.
6. Conservar evidencia CI del SHA integrado y completar UAT/SAT con datos y broker reales. Ninguna ejecución FIELD se infiere de la integración GitHub.
