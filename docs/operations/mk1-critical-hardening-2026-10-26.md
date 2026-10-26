# MK1 · Hardening crítico · 26/10/2026

Estado de entrega: código preparado para revisión, **sin validación de ejecución**. No apto para producción hasta la aceptación del operador.

Base histórica del hardening: `feat/site-mapper-work-2026-10-23` en `3613de7f075a80c5070b1ec033ae8c90a773ea9f`. Rama original: `fix/mk1-critical-hardening` (`624fe463ddb89824c26f1980aba176d1a94f0bbf`). El 26/10/2026 este trabajo fue reconciliado sobre el `main` consolidado mediante PR #108, preservando además Help Center (#104), Acrel commissioning (#105) y la consolidación MK1 (#103).

No se ejecutaron tests, pruebas manuales de la aplicación, lint, typecheck, builds, servicios, contenedores, brokers, migraciones ni consultas a bases de datos. La revisión realizada fue lectura de código y diff. No se añadieron suites de pruebas. Los commits llevan `[skip ci]` para no solicitar CI automático al publicar.

## Resultado por FIX

“IMPLEMENTADO” describe código o documentación incorporados; no significa probado, certificado ni desplegado.

| FIX    | Estado       | Cambio y límite                                                                                                                                                                                                                                                                            |
| ------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FIX-01 | IMPLEMENTADO | Persistencia explícita; memoria solo con entorno development/test explícito. Staging/production comparten política de cookies Secure y TLS. Mongo requiere URI y nombre de base.                                                                                                           |
| FIX-02 | IMPLEMENTADO | Revisión monotónica y CAS en escrituras de topología, layout, movimiento, archivado, restauración, pin y CAS físico. Conflictos HTTP 409. Respuestas de los principales escritores se vuelven a leer con la revisión persistida.                                                           |
| FIX-03 | IMPLEMENTADO | Preflight de ocupación, revalidación transaccional y `uq_active_rack_position`. Migración versionada bloquea duplicados sin repararlos. Pendiente ejecutarla.                                                                                                                              |
| FIX-04 | IMPLEMENTADO | Guardas Mongo transaccionales de jerarquía, CAS, puertos, PowerPaths y bindings. Archivado rechaza puertos activos y referencias activas; restauración comprueba ascendencia, ocupación y referencias. No elimina conexiones.                                                              |
| FIX-05 | PARCIAL      | QoS 1, sesión persistente configurable, PUBACK después del manejador, spool con fsync de archivo/directorio, límites de cola y diagnóstico de captura. Fallo de spool impide publicar esa lectura. Continúan límites de deduplicación y de replay del historial eléctrico descritos abajo. |
| FIX-06 | IMPLEMENTADO | Cuatro métricas MQTT en una transacción; lote SNMP de laboratorio completo en una transacción. Idempotencia por mapping semántico, conflictos de propietario y versiones de inventario. En memoria la operación devuelve 503: exige almacenamiento atómico Mongo.                          |
| FIX-07 | IMPLEMENTADO | Bootstrap único, mutaciones de usuarios con CAS, barrera para último superadmin, revocación y auditoría transaccionales. Rate limit por cuenta y por edge autenticado, JSON acotado, SSE con autorización por entrega.                                                                     |
| FIX-08 | IMPLEMENTADO | Promoción reutiliza índices/validador canónicos, preflight de referencias, mantenimiento, candidato único, journal y respaldo. Los renames no son una transacción multi-colección; recuperación requiere procedimiento operacional.                                                        |
| FIX-09 | IMPLEMENTADO | Runbook ampliado para Mongo, Timescale, spool y broker; dependencias de restore, retenciones y RPO/RTO pendientes. Se retiró el drop automático de índices al arrancar.                                                                                                                    |

## Diseño de concurrencia y referencias

`integrity_fences`, clave `canonical`, serializa las transacciones de topología, PowerPaths, TelemetryBindings y administración. Se usa snapshot + write concern majority. Esta escritura compartida evita el write skew entre archivar un equipo y crear una referencia en otra colección. Las transacciones pueden reintentarse por el driver; las revisiones esperadas no se actualizan durante el reintento, por lo que una edición concurrente no se sobrescribe.

La barrera es deliberadamente global. Su coste de contención y latencia queda pendiente de medición; no se ha afirmado una capacidad de operaciones/segundo. No sustituye detener versiones anteriores o escritores externos que no implementen el protocolo. No coordina el spool con Mongo y Timescale mediante una transacción distribuida.

Los cambios de puertos también comprueban PowerPaths ya existentes (tipo, exposición, dirección y feed). Los cambios de panel o breaker con bindings comisionados vuelven a comprobar panel, posición, fuente y ownership. Puede ser necesario retirar explícitamente un binding antes de modificar su relación física. El cambio no añade una autorización para borrar conexiones.

El adaptador de memoria continúa siendo solo de desarrollo y no proporciona integridad transaccional entre módulos ni auditoría durable. La aceptación de los FIX que involucran varias colecciones se realizará en MongoDB, nunca en memoria. El commissioning atómico falla de forma explícita en ese adaptador.

## Esquema y compatibilidad

- `topology_nodes.revision`: entero seguro positivo, aditivo. Un documento sin revisión se compara con `revision: {$exists:false}` **y** su `updatedAt` anterior; la primera escritura aceptada lo promueve a 1. Después cada escritura incrementa la revisión. No hay backfill masivo.
- `users.revision` y `telemetry_bindings.revision`: también aditivos; protegen modificaciones concurrentes. La retirada de bindings no puede resucitarse mediante una copia obsoleta.
- `updatedAt` se conserva como API pública de versión de los editores espaciales y avanza de forma monotónica junto con la revisión de topología.
- Nuevo índice parcial único `uq_active_rack_position` en `topology_nodes.parentId` para racks activos. Se preservan `uq_active_publisher_serial`, `uq_topology_access_port_id` y los demás índices canónicos.
- `topology-schema.ts` centraliza el manifiesto de índices y el validador. El validador permite ausencia de revisión, pero no revisiones inválidas. No normaliza ni elimina documentos.
- `integrity_fences`: barrera transaccional y señal de mantenimiento. `identity_initialization`: cierre durable del bootstrap. `schema_migrations`: recibo de migración. `promotion_journal`: fases y nombres exactos para recuperar una promoción interrumpida.
- `admin_audit` existente recibe la auditoría en la misma transacción que usuarios/layout; no se necesita un consumidor adicional para considerarla almacenada.
- Se conserva la actualización controlada de una identidad SOURCE descubierta por serial único desde Device hacia su Chassis raíz; se prueba de nuevo su relación dentro de la transacción.
- `TelemetrySample.historyCapture` añade `PERSISTED`, `FAILED` o `DISABLED`; expresa el resultado del intento de historial de esa lectura, no una garantía del snapshot combinado de todas las lecturas anteriores. LIVE continúa significando frescura.

Una base existente sin índices/validador compatibles devuelve `MIGRATION_REQUIRED` al abrir el repositorio. No basta con hacer pull y arrancar sobre una base antigua. El arranque no elimina índices históricos ni repara conflictos. Una base completamente nueva puede inicializar sus colecciones vacías e índices sin migrar datos existentes.

## Variables de entorno

| Variable                                                         | Política                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_ENV`                                                        | Valores development/test/staging/production. Staging y production activan seguridad de producción. Si falta y NODE_ENV=production, se exige la política segura. Un APP_ENV explícito conserva la posibilidad de laboratorio con Next optimizado. |
| `APP_PERSISTENCE`                                                | Ahora obligatoria: mongodb o memory. No hay fallback implícito. memory requiere development/test explícito.                                                                                                                                      |
| `MONGODB_URI`, `MONGODB_DB_NAME`                                 | Ambas obligatorias con Mongo. TLS y autenticación obligatorios en staging/production según la política existente unificada.                                                                                                                      |
| `MQTT_CLIENT_ID`                                                 | Nueva. Identificador estable y exclusivo por suscriptor/réplica. Obligatoria con MQTT en staging/production. Activa Clean Session=false. No compartir ID entre procesos activos.                                                                 |
| `AUTH_TRUSTED_PROXY_TOKEN`                                       | Nueva, opcional, secreto de al menos 32 caracteres. El edge elimina cabeceras aportadas por clientes e inyecta `x-appm-proxy-token` y una sola IP canónica en `x-appm-client-ip`. Sin prueba válida no se confía en forwarded headers.           |
| `INDUSTRIAL_MQTT_SPOOL`                                          | Volumen persistente privado por suscriptor, obligatorio en staging/production con MQTT. Debe soportar fsync de archivos y directorios.                                                                                                           |
| `INDUSTRIAL_PROFILES_JSON` y configuración de perfiles existente | Cada fuente MQTT admitida en producción necesita perfil de captura durable. Fuente sin perfil bloquea su captura/ACK; no se publica silenciosamente.                                                                                             |
| `INDUSTRIAL_MQTT_MAX_PENDING`                                    | Existente: límite de spool. No se aumentó automáticamente.                                                                                                                                                                                       |
| `INDUSTRIAL_TIMESCALE_ENABLED`                                   | Existente: habilita outbox Mongo hacia serie industrial Timescale. No habilitarlo no equivale a tener historial industrial en Timescale.                                                                                                         |

Sin edge autenticado, las peticiones comparten el presupuesto de edge desconocido (60/minuto) y cada cuenta conserva 5 intentos/15 minutos. Puede limitar usuarios detrás de un mismo ingreso; configurar el edge antes de la aceptación de carga. El rate limit Mongo usa ventanas fijas atómicas y el login exitoso no borra ese presupuesto compartido.

## Actualización local · instrucciones, no ejecutadas

1. Conservar cambios locales propios antes de cambiar de rama. Descargar la rama:

   ```bash
   git fetch origin
   git switch --track origin/fix/mk1-critical-hardening
   ```

   Si ya existe localmente, usar `git switch fix/mk1-critical-hardening` y `git pull --ff-only origin fix/mk1-critical-hardening`.

2. Revisar `.env.example`, configurar secretos fuera de Git y disponer de MongoDB replica set o cluster compatible con transacciones. No degradar a escrituras sin transacción si Mongo es standalone.
3. Detener todos los escritores, incluidos procesos de la rama anterior, scripts, collectors y workers. Registrar backup recuperable, configuración y offsets/capturas pendientes. El flag `--writers-stopped` es una declaración del operador, no detecta procesos externos.
4. El operador ejecutará primero el preflight de la migración pendiente sobre el destino acordado, con credenciales cargadas por un mecanismo privado:

   ```bash
   node --experimental-strip-types scripts/migrations/versioned/mk1-critical-hardening-001.ts --expect-db <NOMBRE_DB>
   ```

5. Solo después de revisar un preflight limpio y el backup, el operador puede aplicar:

   ```bash
   node --experimental-strip-types scripts/migrations/versioned/mk1-critical-hardening-001.ts --expect-db <NOMBRE_DB> --writers-stopped --backup-id <ID_BACKUP> --apply
   ```

   No se ejecutó ninguna de estas órdenes en esta entrega. No se ejecutó tampoco el preflight. Ante errores de datos, preparar una corrección específica revisada por el propietario: no borrar duplicados, puertos ni bindings para forzar la migración.

6. Si una aplicación de migración falla, la marca `maintenance` queda retenida intencionalmente; mantener escritores detenidos. Revisar `maintenance.owner`, el backup y cualquier índice ya creado. No retirar la marca automáticamente. Liberarla solo después de resolver el incidente, con filtro del owner exacto y registrando la decisión.
7. La promoción legacy es **opcional y separada** del hardening. Ahora requiere además `--expect-db`, y para `--apply`, `--writers-stopped --backup-id`. Usa candidato único, índices y validador canónicos. No ejecutar una promoción para actualizar solamente el código.
8. Después de la migración y configuración, el operador arrancará su entorno habitual y realizará la aceptación siguiente. No fusionar el PR hasta registrar los resultados y corregir fallos.

No cambiaron dependencias ni SQL de Timescale. No se ejecutó instalación de paquetes. Las migraciones SQL 001–004 ya presentes pertenecen al trabajo base; comprobar su estado en el entorno durante la validación, sin asumir que ya están aplicadas.

## Verificaciones manuales pendientes del operador

| Caso                         | Resultado que debe comprobarse                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entorno incompleto           | Sin APP_PERSISTENCE o sin URI/DB Mongo no arranca usando memoria por defecto. Producción/staging rechazan memory, Mongo sin TLS y MQTT sin TLS/credenciales.                                     |
| Cookies                      | En HTTPS de staging/production, login y logout usan Secure, HttpOnly y SameSite; el laboratorio development explícito conserva su política local.                                                |
| Escritura concurrente        | Dos peticiones basadas en el mismo documento para move/archive/restore/pin/layout/CAS: una confirma y la otra recibe 409; ninguna borra cambios ajenos.                                          |
| Documento antiguo            | Sin revision: primera escritura crea revision 1; una segunda petición con la versión antigua se rechaza; updatedAt no retrocede.                                                                 |
| Racks                        | Crear/mover/restaurar dos racks a una Position simultáneamente: como máximo uno activo, error de dominio/409 para el otro.                                                                       |
| Migración conflictiva        | Duplicados de rack, publisher o AccessPort y referencias inválidas bloquean la aplicación; no cambian documentos automáticamente.                                                                |
| Equipment conectado          | Archivado con AccessPorts activos, PowerPaths o TelemetryBindings activos se rechaza, conservando conexiones y datos.                                                                            |
| Carrera referencia/archivado | Crear PowerPath o binding mientras se archiva/remueve su equipo o puerto: no queda referencia activa huérfana.                                                                                   |
| Restauración y CAS           | Padres archivados, Position ocupada, CAS incompatible o referencias físicas faltantes bloquean; restaurar ancestros no reactiva automáticamente descendientes.                                   |
| Cambios de conexiones        | Cambiar dirección/feed de puerto conectado o posición/serial/prefijo de breaker/panel comisionado no deja conexiones incoherentes.                                                               |
| Movimiento de Device         | Concurrente con montaje CAS de su Equipment: no cambia contexto de rack dejando equipo montado en una ubicación incompatible.                                                                    |
| Commissioning MQTT           | Interrumpir antes de la cuarta métrica: se conservan cero nuevas métricas; al confirmar se guardan las cuatro. Repetir misma solicitud no duplica mappings.                                      |
| Commissioning SNMP           | Igual para el plan completo de inputs V/I; fuente competidora o versión de inventario obsoleta causa rollback completo.                                                                          |
| MQTT durable                 | Publicador QoS 1, clientId estable, broker persistente: observar PUBACK después de fsync/captura. Reiniciar proceso antes/después del ACK y contrastar pendientes, Mongo y Timescale.            |
| Spool fallido/lleno          | No aparece la lectura nueva como aceptada/LIVE; no se envía PUBACK QoS 1; hay fallo/estado DEGRADED y reconexión. Recuperar sin borrar pendientes.                                               |
| Deduplicación                | Reenviar mismo messageId/payload: una captura industrial lógica. Reusar messageId con payload diferente: conflicto visible, nunca sobrescritura. Ver límite sin messageId abajo.                 |
| Historial fallido            | Si falla `/samples`, `historyCapture=FAILED`; no informar PERSISTED por el mero estado LIVE. Contrastar el outbox industrial independiente.                                                      |
| Bootstrap                    | Dos inicializaciones simultáneas: un solo primer superadmin y un cierre durable. No reabre al archivar usuarios.                                                                                 |
| Último administrador         | Dos desactivaciones/demotions simultáneas de superadmins: queda al menos uno activo; cambios rechazados no tienen auditoría de éxito.                                                            |
| Auditoría                    | Una falla en la inserción de admin_audit revierte la modificación. Cambio de rol/password y revocación son atómicos en Mongo.                                                                    |
| Login concurrente            | Login con contraseña anterior mientras se cambia la contraseña: no crea sesión válida después de la revocación.                                                                                  |
| Rate limit                   | Rotar X-Forwarded-For sin prueba de edge no evade límite por cuenta; rollover concurrente no reinicia el contador varias veces.                                                                  |
| SSE                          | Revocar sesión/cambiar rol/desactivar usuario: la siguiente entrega se rechaza y se cierra el stream; sin actividad, revisión periódica cada 15 s. Fallo de lectura de identidad también cierra. |
| Cuerpo HTTP                  | JSON demasiado grande, profundo o con claves inseguras se rechaza antes de procesar las rutas sensibles, incluidos layout y boundaries.                                                          |
| Promoción/rollback           | Sobre una copia aislada: interrumpir entre renames, revisar journal y recuperar backup sin escribir en una colección incorrecta ni liberar mantenimiento prematuramente.                         |
| Reinicio/restore completo    | Reconstruir jerarquía, CAS, PowerPaths, bindings, usuarios, industrial raw/history/outbox y Timescale; reconciliar spool, IDs y huecos antes de reabrir escritores.                              |

## Riesgos residuales y límites conocidos

1. **FIX-05 sigue parcial.** La deduplicación industrial de publicaciones repetidas requiere `messageId` estable del publicador. El `captureId` conserva idempotencia de reintentos del mismo archivo de spool, pero una redelivery de broker sin ID de aplicación puede producir otra captura. No se afirma exactly-once.
2. El outbox industrial hacia `industrial_observations` se conserva. No se implementó un outbox nuevo para reconstruir automáticamente cada fila fallida del historial eléctrico legacy `/samples`; se expone `historyCapture=FAILED`. Capturar raw industrial no prueba que todas las tablas de historial estén completas.
3. QoS 1 de la suscripción no convierte publicaciones QoS 0 en durables. QoS 2 no está soportado y se rechaza. Persistencia/retención del broker y supervivencia del volumen requieren validación externa. No reutilizar MQTT_CLIENT_ID en dos réplicas.
4. Fuente no configurada o payload inválido puede causar reconexiones repetidas y backlog de mensajes sin ACK. Corregir perfil/tópico/dato con el operador; no purgar automáticamente la cola. Medir contención y throughput con el bridge Modbus y el historial habilitados: el ACK espera al manejador completo.
5. No hay transacción distribuida Mongo/Timescale/spool. Mantener backup coordinado y registrar huecos. RPO/RTO aún no acordados ni medidos.
6. Cambios de esquema y guardas más estrictas pueden descubrir inconsistencias antiguas. No se ha inspeccionado ninguna base real, por lo que no se conoce su cantidad ni su corrección requerida.
7. Las restricciones transaccionales completas son del camino Mongo. Memoria no es entorno de aceptación ni sustituto de persistencia durable.
8. La UI existente conserva contratos y presentación. Los nuevos campos de diagnóstico son observables por API; no se rediseñaron todos los indicadores UI para mostrar historia por cada campo de un snapshot combinado.
9. Sin lint, typecheck, build ni ejecución, siguen pendientes compatibilidad de compilación, errores de integración y comportamiento efectivo. El PR Draft no constituye autorización de producción.

La lista completa de archivos se encuentra en [mk1-critical-hardening-files.md](mk1-critical-hardening-files.md). Recuperación: [backup-restore.md](backup-restore.md).

## Nota de integración a main

La reconciliación hacia `main` no copia el árbol antiguo de la rama sobre el producto actual. Se reaplica únicamente el diff propio de los 7 commits de hardening desde su ancestro común y se resuelven explícitamente los conflictos con cambios posteriores. Los dos conflictos reales estuvieron en `panel-commissioning` y `mongo-telemetry-binding-repository`; la resolución conserva provenance/batch commissioning de Acrel y añade request hardening, integrity fence, reference guards y atomicidad de bindings.

La integración final se valida mediante los workflows vigentes del repositorio antes del merge de PR #108.
