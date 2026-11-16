# Site Mapper MK1 — UAT integral v2.0 (OWASP/Offline + Alarmas + Consola + Rastreo)

**Fecha documental:** 2026-11-16  
**Estado:** PLAN UPDATED — UAT NOT EXECUTED  
**Baseline de código bajo prueba:** `7a43be8161ef938dbd2da7b1586fefcd329fbd79` (main tras merge #223, #224, #225, #226).  
**Repositorio:** `em3rc0dTh/AppM-Site-Mapper`  
**Carácter:** adenda funcional y de seguridad al RFP Acceptance & Operability Pack; no sustituye ACC-001..ACC-018 ni pruebas SAT.

## 1. Autoridad, alcance y límites

- El SHA anterior identifica **código objetivo**, no una imagen certificada ni un despliegue; la ejecución deberá demostrar el SHA y digest reales en [09-RELEASE-IDENTIFICATION.md](09-RELEASE-IDENTIFICATION.md). El commit de esta documentación podrá ser posterior sin cambiar el baseline de aplicación; cualquier cambio de código exige revisión de impacto y nuevo freeze.
- PR [#223](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/223) (cookie/sesión 30 min idle y 8 h absoluta, CSRF, claves, TOTP y offline), [#224](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/224) (Alarm Rule Manager DC-48V), [#225](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/225) (retiro de Operational Console), [#226](https://github.com/em3rc0dTh/AppM-Site-Mapper/pull/226) (Rastreo de Ruta v2.1).
- La aceptación se fundamenta en [Offline Security Baseline](../../security/site-mapper-offline-security-baseline-v1.md), [Rule Manager](../../operations/alarm-rule-manager-mk1.md), [retirada de consola](../../operations/retire-operational-console.md), [Rastreo v2.1](../../ui/power-trace-v2.1.md), [G14](../../testing/system-certification.md) y [procedimientos ACC](03-TEST-PROCEDURES.md).
- GitHub Actions/CI son **evidencia técnica auxiliar**. No sustituyen UAT presencial ni SAT eléctrico, Metasys, exactitud de señales, recuperación de claves o validación de OT.
- OWASP Top 10 / ASVS son referencias para controles selectivos; este UAT **no acredita certificación OWASP, pentest ni ASVS completo**.

## 2. Seguridad de ejecución y puerta de entrada

1. Ejecutar pruebas de mutación/alarma/autenticación negativa únicamente en LAB/PRE-PROD aislado con identidades y datos sintéticos. En FIELD, cualquier acción mutativa requiere autorización explícita y plan de respaldo; por defecto, **observación de solo lectura**.
2. Ninguna prueba implica despliegue, edición de datos de cliente, cambios de firewall, SNMP SET, conmutación eléctrica, borrado, `docker compose down -v` o `volume prune`. El retiro de un contenedor preexistente es una **operación separada** bajo autorización y runbook, no parte automática de este paquete.
3. Registrar propietario del entorno, aprobación OT, release/imagen/digest, zona horaria y reloj LAN, origen LAB/FIELD de datos, inventario de fuentes y destino **privado** de evidencias; nunca publicar secretos, topología de cliente, IPs, seriales reales, capturas sensibles ni dumps en GitHub público.
4. Para AIR-GAP verificar ausencia física/lógica de WAN en ventana aprobada. Modo `PASSWORD_BREACH_MODE=local`; denylist **parcial**, no equivale a comprobación de todo el corpus filtrado. No activar `SITE_MAPPER_MFA_REQUIRED=true` antes de enrolamiento general, recuperación aprobada y custodia de `SITE_MAPPER_MFA_KEY`.
5. Marcar `NOT_RUN` antes de ejecución; `BLOCKED` solo con dependencia documentada; `PASS` exclusivamente por resultado observado, evidencia y firma. `FAIL` requiere ticket/retest. `N/A` necesita disposición formal. No convertir una Actions verde en `PASS` UAT.

## 3. Cobertura y trazabilidad

| ID | Origen | Entorno | Escenario | Estado inicial |
| --- | --- | --- | --- | --- |
| UAT-001 | Control | LAB/FIELD | Identidad de release | NOT_RUN |
| UAT-002 | Control | LAB/FIELD | Aislamiento de pruebas y procedencia | NOT_RUN |
| UAT-101 | PR223 Seguridad | LAB / FIELD controlado | Sesión idle y absoluta | NOT_RUN |
| UAT-102 | PR223 Seguridad | LAB / FIELD controlado | TOTP y recuperación | NOT_RUN |
| UAT-103 | PR223 Seguridad | LAB / FIELD controlado | Política de contraseñas offline | NOT_RUN |
| UAT-104 | PR223 Seguridad | LAB / FIELD controlado | RBAC, objeto y CSRF | NOT_RUN |
| UAT-105 | PR223 Seguridad | FIELD / LAN aislada | Cookies, HTTPS, HSTS y activos locales | NOT_RUN |
| UAT-106 | PR223 Seguridad | LAB / FIELD controlado | Reautenticación para credenciales OT | NOT_RUN |
| UAT-107 | PR223 Seguridad | LAB / FIELD controlado | Persistencia de clave MFA y reloj | NOT_RUN |
| UAT-201 | PR224 Alarmas | LAB / PRE-PROD | DRAFT, PUBLISH y revision CAS | NOT_RUN |
| UAT-202 | PR224 Alarmas | LAB / PRE-PROD | Herencia de políticas y legado | NOT_RUN |
| UAT-203 | PR224 Alarmas | FIELD con ingeniería / LAB | DC-48V y umbrales de commissioning | NOT_RUN |
| UAT-204 | PR224 Alarmas | LAB / PRE-PROD | V/A/P/E independientes y correlación | NOT_RUN |
| UAT-205 | PR224 Alarmas | LAB / PRE-PROD | Stale, replay, pérdida y LOAD_LOSS | NOT_RUN |
| UAT-206 | PR224 Alarmas | LAB / PRE-PROD | DISABLE y rollback auditado | NOT_RUN |
| UAT-207 | PR224 Alarmas | LAB / PRE-PROD | Control de permisos y concurrencia | NOT_RUN |
| UAT-301 | PR225 Retiro consola | LAB / appliance clonada | Servicio eliminado de Compose | NOT_RUN |
| UAT-302 | PR225 Retiro consola | FIELD inspección sin cambios | Contenedor residual y puerto | NOT_RUN |
| UAT-303 | PR225 Retiro consola | LAB / FIELD controlado | No regresión / conservación de datos | NOT_RUN |
| UAT-401 | PR226 Rastreo | LAB / FIELD lectura | Ventana independiente y permisos | NOT_RUN |
| UAT-402 | PR226 Rastreo | FIELD con datos reales | Rutas A/B y terminales de A3 | NOT_RUN |
| UAT-403 | PR226 Rastreo | LAB / FIELD lectura | Rutas ausentes y múltiples | NOT_RUN |
| UAT-404 | PR226 Rastreo | LAB / FIELD lectura | Frescura por breaker | NOT_RUN |
| UAT-405 | PR226 Rastreo | LAB / FIELD lectura | Responsive, impresión y PDF | NOT_RUN |
| UAT-406 | PR226 Rastreo | LAB / FIELD lectura | Conciliación Excel no vinculada | NOT_RUN |
| UAT-501 | Regresión | LAB / FIELD controlado | Golden path de topología | NOT_RUN |
| UAT-502 | Regresión | LAB / FIELD lectura | MQTT/SNMP/Timescale/Modbus | NOT_RUN |
| UAT-503 | Regresión | LAB / FIELD lectura | Aislamiento y calidad QDF | NOT_RUN |
| UAT-504 | Regresión | LAB / appliance clonada | Reboot/auto-recovery | NOT_RUN |
| UAT-505 | Regresión | LAB / restore aislado | Backup y restore seguro | NOT_RUN |
| UAT-601 | FIELD / SAT | FIELD autorizado | Verificación eléctrica A/B | NOT_RUN |
| UAT-602 | FIELD / SAT | FIELD autorizado | Metasys, ACL OT y firewall | NOT_RUN |
| UAT-603 | FIELD / SAT | FIELD autorizado | Operación LAN totalmente offline | NOT_RUN |

**Total:** 33 casos adicionales, inicialmente **33 NOT_RUN**, 0 PASS, 0 FAIL, 0 BLOCKED, 0 N/A. Se suman a los 18 ACC del paquete contractual, **sin alterar sus resultados históricos**.

## 4. Procedimientos y aceptación medible

### UAT-001 — Identidad de release

- **Alcance/entorno:** Control · LAB/FIELD.
- **Procedimiento:** Registrar SHA del código, hash de imagen/bundle, versión, configuración y entorno; comparar la ejecución contra el artefacto instalado.
- **Esperado / PASS:** El artefacto ejecutado corresponde al SHA de código congelado, sin cambios locales no documentados.
- **Evidencia mínima:** SHA, digest, inventario y acta.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-002 — Aislamiento de pruebas y procedencia

- **Alcance/entorno:** Control · LAB/FIELD.
- **Procedimiento:** Identificar LAB/PRE-PROD/FIELD, fuentes simuladas/reales, autorización de pruebas, redes, usuarios y repositorio de evidencias.
- **Esperado / PASS:** No se confunden valores LAB y FIELD; sin secretos, datos sensibles ni operaciones de producción no aprobadas.
- **Evidencia mínima:** Acta de alcance, entorno y permisos.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-101 — Sesión idle y absoluta

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Con usuarios de prueba, observar expiración por inactividad de 30 min, máxima de 8 h, cierre de sesión y revocación; verificar rechazos posteriores.
- **Esperado / PASS:** Expiración y revocación en servidor sin acceso residual; no basta una redirección visual.
- **Evidencia mínima:** Log sanitizado HTTP y timestamps.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-102 — TOTP y recuperación

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Enrolar MFA en cuenta de prueba con reloj LAN sincronizado; autenticar, probar OTP usado/incorrecto, código de recuperación de un uso, desactivación y recuperación administrativa aprobada.
- **Esperado / PASS:** MFA y recuperación funcionan offline, sin reutilización de códigos ni divulgación de secretos; no forzar MFA global durante el piloto.
- **Evidencia mínima:** Acta, respuesta redactada, evidencia de sincronía.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-103 — Política de contraseñas offline

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Ejercitar bootstrap, cambio y usuarios con PASSWORD_BREACH_MODE=local; ensayar contraseña débil/restringida y throttle; observar egress.
- **Esperado / PASS:** Se aplica la denylist local parcial y controles de fuerza bruta sin servicios WAN; no se afirma corpus global.
- **Evidencia mínima:** Resultados sanitizados y captura de red autorizada.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-104 — RBAC, objeto y CSRF

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Acceder a lecturas/mutaciones con perfiles autorizados y no autorizados, cross-origin, Origin inválido, content-type inválido y payload fuera de límites.
- **Esperado / PASS:** Mutaciones ilegítimas rechazadas por backend, sin modificaciones ni filtraciones; lecturas respetan permisos.
- **Evidencia mínima:** Matriz HTTP, respuesta y audit.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-105 — Cookies, HTTPS, HSTS y activos locales

- **Alcance/entorno:** PR223 Seguridad · FIELD / LAN aislada.
- **Procedimiento:** Con navegador local inspeccionar cookie de producción, TLS/CA interna, HSTS, carga de JS/fonts y reinicio sin acceso WAN.
- **Esperado / PASS:** Cookie segura __Host donde corresponda; TLS privado validado; sin recursos web externos ni dependencia de nube.
- **Evidencia mínima:** Evidencia navegador, inspección LAN y CA.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-106 — Reautenticación para credenciales OT

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Con permiso adecuado solicitar revelar credencial de prueba, sin y con reautenticación, y exceder throttling.
- **Esperado / PASS:** Revelado exige reautenticación y límite; secretos no aparecen en evidencias ni logs.
- **Evidencia mínima:** Resultados redactados y eventos de auditoría.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-107 — Persistencia de clave MFA y reloj

- **Alcance/entorno:** PR223 Seguridad · LAB / FIELD controlado.
- **Procedimiento:** Verificar con snapshot seguro persistencia de SITE_MAPPER_MFA_KEY, CA interna y NTP LAN; reiniciar solo clon autorizado.
- **Esperado / PASS:** MFA y sesiones se comportan según contrato tras restart, sin perder claves; el reinicio no habilita Internet.
- **Evidencia mínima:** Acta restore-clon, reloj y estado de servicios.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-201 — DRAFT, PUBLISH y revision CAS

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** En scope de prueba crear DRAFT, editar con publicada previa, confirmar impacto, publicar, probar stale revision 409.
- **Esperado / PASS:** DRAFT no afecta política publicada; publicación es explícita y rechaza revisión antigua.
- **Evidencia mínima:** Historial, respuestas API y audit.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-202 — Herencia de políticas y legado

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** Configurar reglas de prueba GLOBAL → QDF → PANEL → BREAKER y solapar código con alarm_policies legado.
- **Esperado / PASS:** Gana regla publicada más específica cuando aplica; política legacy prevalece en solapamiento.
- **Evidencia mínima:** Tabla de políticas efectivas.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-203 — DC-48V y umbrales de commissioning

- **Alcance/entorno:** PR224 Alarmas · FIELD con ingeniería / LAB.
- **Procedimiento:** Ver referencia DC-48V-24CELL y comprobar que no se convierte automáticamente en alarma; validar ficha de umbrales eléctricos aprobada.
- **Esperado / PASS:** Los números de referencia NO disparan alarmas; activación solo con ingeniería y publicación formal.
- **Evidencia mínima:** Ficha de umbrales/revisión aprobada.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-204 — V/A/P/E independientes y correlación

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** Inyectar muestras controladas por variable y breaker; observar ocurrencias y agrupación por ventana de 10 min.
- **Esperado / PASS:** Cada condición V/A/P/E queda registrada independientemente, con agrupación visual sin suprimir evidencia.
- **Evidencia mínima:** Capturas Alarm Center y eventos.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-205 — Stale, replay, pérdida y LOAD_LOSS

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** Reproducir stale/offline, duplicado/out-of-order, zero-current y expectedLoad con referencia; verificar reboot evaluador.
- **Esperado / PASS:** No confundir telemetría perdida con 0 real; LOAD_LOSS requiere historial de carga; advertir estados efímeros tras reinicio.
- **Evidencia mínima:** Secuencia temporal de muestras y alarmas.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-206 — DISABLE y rollback auditado

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** Deshabilitar regla publicada con incidencias existentes, revisar publicación previa e historial.
- **Esperado / PASS:** No se eliminan incidencias previas; DISABLE/rollback conserva evidencia y auditoría.
- **Evidencia mínima:** IDs de regla/eventos y acta.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-207 — Control de permisos y concurrencia

- **Alcance/entorno:** PR224 Alarmas · LAB / PRE-PROD.
- **Procedimiento:** Intentar save/publish/disable sin settings:write, sin confirmImpact y en operaciones concurrentes.
- **Esperado / PASS:** Operación no autorizada o sin confirmación rechazada; CAS no produce estado ambiguo.
- **Evidencia mínima:** Matriz de permisos, revisiones y logs.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-301 — Servicio eliminado de Compose

- **Alcance/entorno:** PR225 Retiro consola · LAB / appliance clonada.
- **Procedimiento:** Verificar docker compose config --services del manifiesto aprobado y ausencia de nueva imagen de consola.
- **Esperado / PASS:** Operational Console no está definido en Compose estándar; consola legacy sólo archivada.
- **Evidencia mínima:** Salida sanitizada de Compose.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-302 — Contenedor residual y puerto

- **Alcance/entorno:** PR225 Retiro consola · FIELD inspección sin cambios.
- **Procedimiento:** Leer etiquetas Docker del proyecto y propietario de puerto 3100 sin detener nada; registrar plan de retiro dirigido si existe residual.
- **Esperado / PASS:** No declarar ausencia del proceso por el solo cambio de YAML; servicio residual requiere autorización de retirada.
- **Evidencia mínima:** Inspección y plan aprobado.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-303 — No regresión / conservación de datos

- **Alcance/entorno:** PR225 Retiro consola · LAB / FIELD controlado.
- **Procedimiento:** Comparar servicios, Mongo/Timescale y capacidades nativas antes/después de la retirada autorizada; prohibir down -v y prune.
- **Esperado / PASS:** Continúan Site Mapper, alarmas, Blueprint/CAS, MQTT, SNMP, Modbus, datos e histórico sin borrado.
- **Evidencia mínima:** Health checks y conteos/snapshots.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-401 — Ventana independiente y permisos

- **Alcance/entorno:** PR226 Rastreo · LAB / FIELD lectura.
- **Procedimiento:** Abrir desde Device, Equipment y Power; comprobar /workbench/power-trace, ventana separada, power:read y ocultamiento telemetry:read.
- **Esperado / PASS:** No modal/AppShell; 403/denegación por permisos; sin exposición de telemetría a usuarios sin permiso.
- **Evidencia mínima:** Capturas y matriz RBAC.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-402 — Rutas A/B y terminales de A3

- **Alcance/entorno:** PR226 Rastreo · FIELD con datos reales.
- **Procedimiento:** Para A3 comparar feed A/B, source, shelf/frame cuando existan, panel, breaker, puertos origen/destino y PowerPaths con As-Built aprobado.
- **Esperado / PASS:** La interfaz reproduce las rutas verificadas, sin enlaces inventados; doble ruta no certifica independencia física.
- **Evidencia mínima:** Matriz A/B eléctrica en custodia privada.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-403 — Rutas ausentes y múltiples

- **Alcance/entorno:** PR226 Rastreo · LAB / FIELD lectura.
- **Procedimiento:** Inspeccionar equipo sin PowerPath, solo A, solo B, múltiples rutas, feed ausente y puertos sin documentar.
- **Esperado / PASS:** Representación explícita de ausencia/incertidumbre; no completar información mediante inferencias.
- **Evidencia mínima:** Capturas desidentificadas por escenario.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-404 — Frescura por breaker

- **Alcance/entorno:** PR226 Rastreo · LAB / FIELD lectura.
- **Procedimiento:** Observar V/I/P/E y receivedAt con LIVE, STALE, OFFLINE y CLOCK SKEW, refresco a 60 s y reloj a 30 s.
- **Esperado / PASS:** No etiquetar histórico como LIVE; frescura y sello temporal por breaker coherentes.
- **Evidencia mínima:** Captura con reloj/referencia y origen.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-405 — Responsive, impresión y PDF

- **Alcance/entorno:** PR226 Rastreo · LAB / FIELD lectura.
- **Procedimiento:** Comparar 1440x900, 1280x720, zoom navegador 125%, ventana emergente bloqueada y acción imprimir/Guardar como PDF.
- **Esperado / PASS:** Rutas, tablas y breakers legibles; exportación no filtra secretos ni contenido ficticio.
- **Evidencia mínima:** Capturas y PDF sanitizado.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-406 — Conciliación Excel no vinculada

- **Alcance/entorno:** PR226 Rastreo · LAB / FIELD lectura.
- **Procedimiento:** Abrir ruta con y sin referencia documental; comprobar límites del DTO FullPowerTrace y etiqueta de referencia no vinculada.
- **Esperado / PASS:** Sin afirmar coincidencia archivo/hoja/fila cuando falta vínculo; ausencia no se muestra como discrepancia eléctrica.
- **Evidencia mínima:** Captura y ficha de vinculación.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-501 — Golden path de topología

- **Alcance/entorno:** Regresión · LAB / FIELD controlado.
- **Procedimiento:** Recorrer Site→Structure→Level→Room→Blueprint→Rack/CAS→Device/Equipment→BDFB→PowerPath; refrescar y reautenticar.
- **Esperado / PASS:** Identidades y relaciones se reconstruyen y permanecen; Device/Equipment son hermanos, no subordinados.
- **Evidencia mínima:** Capturas y secuencia de IDs sanitizados.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-502 — MQTT/SNMP/Timescale/Modbus

- **Alcance/entorno:** Regresión · LAB / FIELD lectura.
- **Procedimiento:** Medir fuente identificada, calidad/antigüedad, latest→histórico→mapeo Modbus y contratos QDF; campo con permisos OT.
- **Esperado / PASS:** No se mezclan fuentes; unidades/escala/registro coherentes; no asumir integridad por CI.
- **Evidencia mínima:** Evidencia técnica por protocolo.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-503 — Aislamiento y calidad QDF

- **Alcance/entorno:** Regresión · LAB / FIELD lectura.
- **Procedimiento:** Comparar QDF-2/4/5, breaker y total V/A/kW/kWh, caída de enlace, timestamps fuera de orden y datos faltantes.
- **Esperado / PASS:** Sin contaminación de fuentes; total solo con insumos completos; faltantes no equivalen a lectura válida de cero.
- **Evidencia mínima:** Tabla fuente-punto-valor-hora.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-504 — Reboot/auto-recovery

- **Alcance/entorno:** Regresión · LAB / appliance clonada.
- **Procedimiento:** Reiniciar entorno clonado con autorización; esperar retorno de web, ingestión, alarmas, sesiones y persistencia.
- **Esperado / PASS:** Recupera servicio sin recrear mapping y sin borrar datos; documentar estado efímero del evaluador.
- **Evidencia mínima:** Registro antes/después y checks.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-505 — Backup y restore seguro

- **Alcance/entorno:** Regresión · LAB / restore aislado.
- **Procedimiento:** Restaurar copia sanitizada en destino separado; verificar topología, históricos, CA y claves protegidas.
- **Esperado / PASS:** RPO/RTO objetivos documentados y consistencia; ninguna restauración sobre base cliente.
- **Evidencia mínima:** Acta de restore aislado.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-601 — Verificación eléctrica A/B

- **Alcance/entorno:** FIELD / SAT · FIELD autorizado.
- **Procedimiento:** Ingeniero autorizado coteja PowerPath A/B, breaker/puertos y esquema eléctrico real; solo observación, no maniobras.
- **Esperado / PASS:** As-Built y recorrido concuerdan o se registra FAIL/BLOCKED; redundancia se certifica aparte.
- **Evidencia mínima:** Acta de ingeniería SAT privada.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-602 — Metasys, ACL OT y firewall

- **Alcance/entorno:** FIELD / SAT · FIELD autorizado.
- **Procedimiento:** Con personal OT validar Modbus TCP, Unit ID/register map, calidad y segmentación ACL/firewall de protocolos acordados.
- **Esperado / PASS:** Interoperabilidad y permisos verificables; NO se atribuye PASS por pruebas de emulador.
- **Evidencia mínima:** SAT firmado y matriz OT privada.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

### UAT-603 — Operación LAN totalmente offline

- **Alcance/entorno:** FIELD / SAT · FIELD autorizado.
- **Procedimiento:** En ventana aprobada comprobar sin WAN login, MFA si activo, HTTPS/CA, activos locales, telemetría, alarmas, histórico y restart seguro.
- **Esperado / PASS:** Sin dependencia de servicios externos; fallas y excepciones registradas y autorizadas.
- **Evidencia mínima:** Evidencia de salida WAN, acta y operador.
- **Resultado inicial:** `NOT_RUN` (ninguna ejecución UAT atribuida a esta revisión documental).

## 5. Ejecución sugerida y dependencias

1. `UAT-001/002`: congelar release ejecutado, entorno y autoridad. No usar el SHA de un commit documental como sustituto del SHA del binario.
2. `UAT-101..107`: LAB de identidad/OWASP; luego comprobación offline FIELD de solo lectura o autorizado.
3. `UAT-201..207`: gestión de reglas **solo LAB/PRE-PROD** hasta aprobar umbrales en ingeniería; dejar el perfil DC-48V como referencia no operativa.
4. `UAT-301..303`: verificar manifiesto, detectar residual sin retirarlo, y comparar regresiones usando snapshot de entorno separado.
5. `UAT-401..406`: ventana detached, permisos, escenarios de rutas y A3 REAL con evidencia privada; no interpretar dos rutas como redundancia validada.
6. `UAT-501..505`: golden path, protocolos, historia y continuidad sobre entorno seguro.
7. `UAT-601..603`: SAT real con firma del cliente/ingeniería/OT, sin maniobras ni cambios no autorizados.
8. En paralelo, ejecutar `ACC-001..ACC-018` si el compromiso contractual lo exige; registrar cada corrida por separado y consolidar en acta final.

## 6. Criterios de salida y no conformidades

- Aceptación de **software/UAT**: casos LAB aplicables con PASS, sin FAIL abierto, evidencias completas y digest coincidente; BLOCKED/N/A explícitos y aprobados según alcance. No implica FIELD ACCEPTED.
- **FIELD ACCEPTED**: adicionalmente ruta A/B física, alarmas/umbrales autorizados, commissioning de fuentes, ACL/segmentación, HTTPS privado, reloj, Modbus/Metasys, reboot, backup/restore y As-Built con responsables y evidencia.
- UAT de producción **no** puede firmarse si falla una invariante de seguridad, identidad, integridad del dato, calidad eléctrica o respaldo relevante; una discrepancia física o falta de acceso genera FAIL/BLOCKED, jamás PASS por simulación.
- Identificar limitación conocida: registros Modbus sin calidad explícita pueden exponer 0 indistinguible de 0 válido; no usar esto como prueba de seguridad industrial ni control automático.
- Si cambia la aplicación después de `7a43be8161ef938dbd2da7b1586fefcd329fbd79`, crear una **nueva** ficha de release y retestar casos impactados. Mantener resultados originales fechados, nunca reescribir su historial.

## 7. Registro y cierre

Completar [11-UAT-MK1-V2-RESULTS.md](11-UAT-MK1-V2-RESULTS.md), junto con [04-TEST-RESULTS.md](04-TEST-RESULTS.md) para ACC-001..018 y [09-RELEASE-IDENTIFICATION.md](09-RELEASE-IDENTIFICATION.md) para el artefacto realmente ejecutado. Mantener evidencia FIELD en custodia privada; en repositorio público incluir únicamente identificadores controlados no sensibles.

**Dictamen documental de partida:** PLAN ACTUALIZADO / EJECUCIÓN NO REALIZADA / ACEPTACIÓN CLIENTE PENDIENTE.
