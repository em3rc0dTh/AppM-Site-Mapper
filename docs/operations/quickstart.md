# Quickstart operativo · MVP MK1

**Tres caminos distintos.** Elige uno antes de comenzar: (A) visual efímero, (B) visual con inventario Mongo existente o (C) laboratorio integral persistente. No mezcles datos de los tres modos.

## Requisitos

- Node.js 22.13–22.x, npm, Git.
- Docker Engine + plugin `docker compose` para los modos persistentes; WSL2 sirve como shell del laboratorio.
- Navegador compatible. Para MQTT real, **broker y emulador externos** ya disponibles; el repo no los inicia.
- Credenciales y configuración privada en un archivo `.env` ignorado por Git. **Nunca pegarlas en issues, capturas, logs o chats.**

> **¿Ya tienes un laboratorio Site Mapper funcionando?** No ejecutes de nuevo el Compose base ni su seed. Empieza con [Reanudar la instalación sin perder datos](laboratorio-industrial-para-principiantes.md): `python3 scripts/telemetry/estado-laboratorio.py`. La guía también muestra desde Login hasta la captura MQTT, la entrada SNMP Config2 A/B y las lecturas Modbus. Las instrucciones de esta página sirven para instalaciones nuevas y tareas de ingeniería; no regeneran automáticamente el inventario ni las credenciales.

## A. Demo visual rápida — sin DB ni hardware

```bash
npm ci
npm run local:dev -- --no-open
```

Navega a http://127.0.0.1:3000/login, introduce las credenciales **temporales mostradas por el comando** y recorre `Workspace → Network → Room → Rack → Device`. El servidor incluye una topología sintética de ejemplo; todo desaparece al detener el proceso. Si ves datos y UI, **no significa que MQTT y Modbus estén conectados**.

## B. Inventario Mongo existente — no inicializar a ciegas

Si la aplicación ya usa un inventario operativo, primero revisa el nombre de la base de datos y haz auditoría en **modo lectura**. El entorno donde se certificó CB-01 utilizó una base de aceptación diferente del default `appm_site_mapper`; no hay que sustituirlo por defecto ni ejecutar una migración incidental.

```bash
npm ci
npm run audit:mongo
```

Este comando requiere un `MONGODB_URI` privado vigente y la selección explícita correcta de `MONGODB_DB_NAME`. Consulta [Mongo + MQTT](mongodb-live-mqtt.md) para el modo de inspección y la incorporación de cuentas. **No uses** `--new` ni `--crud-test` contra un inventario que quieres conservar.

## C. Stack persistente completo — Compose

### C1. Preparar la configuración local

Si aún no existe `.env`, créalo a partir de `.env.example` y edita las variables. **No sobrescribas** el `.env` que ya funciona.

```bash
test -e .env || cp .env.example .env
```

El Compose necesita como mínimo:

| Nombre                           | Qué configurar                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `BOOTSTRAP_ADMIN_TOKEN`          | Secreto aleatorio privado para el bootstrap de la primera cuenta (aunque ya exista una cuenta)     |
| `MODBUS_BRIDGE_TOKEN`            | Otro token distinto y privado, **24+ caracteres**, compartido entre App y sidecar                  |
| `MODBUS_SOURCE_UNITS_JSON`       | JSON con Unit IDs **autorizados**; el laboratorio previo usó `EMU-BFDB-01 → 1`, `02 → 2`, `03 → 3` |
| `MONGODB_DB_NAME`                | **Nombre exacto de la base de datos que deseas abrir**, no el de otra prueba                       |
| `TELEMETRY_ENABLED`              | `true` solo si la conexión MQTT se ha aprobado y está disponible                                   |
| `MQTT_BROKER_URL` y credenciales | URL alcanzable **desde el contenedor**; si utilizas túnel, sus host/puertos son temporales         |
| `MQTT_TOPIC_FILTER`              | Normalmente `data/dev/#`                                                                           |
| `MODBUS_POINT_LAYOUT`            | `panels-4x24` para el emulador actual; validar antes de usar otra fuente                           |

La muestra del archivo `.env.example` contiene nombres y campos vacíos, **no secretos listos para usar**. Genera y conserva tus tokens localmente. El Compose del laboratorio establece `APP_ENV=development` y `APP_PERSISTENCE=mongodb`; no debes interpretarlo como plantilla segura de producción.

### C2. Arrancar sin borrar volúmenes

```bash
docker compose -f docker-compose.telemetry.yml up -d --build
docker compose -f docker-compose.telemetry.yml ps
```

Puertos de host (loopback): Site Mapper 3000, Operational Console 3100, MongoDB 27017, TimescaleDB 55432, Telemetry Store 18081 y Modbus FC03 1503. Consultar http://127.0.0.1:3000/api/health solo confirma que la API HTTP responde, **no la conectividad de todas las dependencias**.

Para una instalación ya creada, **reconstruye solo los servicios necesarios** y conserva los volúmenes de datos:

```bash
docker compose -f docker-compose.telemetry.yml \
  up -d --no-deps --build --force-recreate site-mapper modbus-tcp
```

No uses `docker compose down -v`, `docker volume rm`, `mongosh dropDatabase`, ni cambies seriales para resolver un problema de HTTP. El `mongo-init` únicamente configura el replica set; no crea topología sintética.

### C3. Acceso inicial

La instalación persistente **no imprime automáticamente un usuario por defecto**. Si el Mongo ya tiene cuentas, inicia sesión con la existente. Si es una **base nueva**, utiliza una sola vez el endpoint autenticado `POST /api/auth/bootstrap`, suministrando el token privado y `email`, `password`, `displayName`; ver [autenticación](../security/authentication.md). No crees cuentas con inserciones directas en Mongo. El bootstrap rechaza un segundo primer usuario.

### C4. Diagnóstico funcional

Con sesión iniciada, comprueba las rutas HTTP que corresponden al entorno actual:

```text
GET /api/telemetry/diagnostics
GET /api/telemetry/panel-commissioning?panelId=<panel-equipment-id>
GET /api/telemetry/entity?targetId=<breaker-equipment-id>&window=LIVE
GET /api/telemetry/entity?targetId=<breaker-equipment-id>&window=24h
```

El panel visual debe mostrar `4/4` solo después de un commissioning aprobado y verificado; `NO DATA`, `UNMAPPED`, `STALE` y `LIVE` tienen significados distintos. Las ventanas **son sensibles a mayúsculas/minúsculas** (`LIVE`, `24h`, `7d`, `15d`, `1M`). No usar `24H` en la API.

Para verificar TimescaleDB/Modbus con CB-01 **únicamente si ese Equipment y su emulador existen en tu base**:

```bash
node scripts/operations/certify-modbus-cb01.mjs \
  --source EMU-BFDB-01 \
  --point 0_1_1 \
  --breaker 4d394db4-b263-4ca3-9fa2-fb10661d89ff
```

El éxito se marca con `MODBUS_CERT_PASS` y coincidencia de los cuatro FLOAT32 con histórico del **mismo breaker**. En otro inventario, debes usar **sus** identidades y la correspondencia real.

## Operación después del arranque

| Necesitas…                           | Guía                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| Datos demo y guion de presentación   | [MVP-DEMO-ES](../product/MVP-DEMO-ES.md)              |
| Ver cómo se enlazan las fuentes MQTT | [Laboratorio MQTT](mqtt-modbus-lab.md)                |
| Error `HISTORY_STORE_UNAVAILABLE`    | [Conectividad del histórico](history-connectivity.md) |
| Ver permisos y seguridad             | [RBAC](../security/rbac-matrix.md)                    |
| Preparar backup/restore              | [Backup y restore](backup-restore.md)                 |
| Desplegar fuera del laboratorio      | [Gates de release](../release/MVP-READINESS.md)       |

**Regla de cierre:** un demo presentable solo requiere el recorrido mostrado; un MVP piloto persistente requiere, además, salud de los tres caminos: fuente MQTT, escritura/histórico de Site Mapper y lectura Modbus cuando forme parte del caso de uso.
