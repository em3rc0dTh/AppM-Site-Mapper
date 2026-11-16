# Clean Host Installation · Site Mapper MK1

Este procedimiento valida portabilidad sobre un host que no contiene el estado del desarrollador. Describe el camino de ingeniería actual desde source y separa explícitamente el futuro bundle de cliente.

## 1. Objetivo

Partir de un host limpio y llegar a:

```text
Docker + Compose
 -> Site Mapper
 -> MongoDB
 -> TimescaleDB
 -> Telemetry Store
 -> optional SNMP collector
 -> Modbus sidecar
 -> persistent volumes
 -> health verification
```

La conexión de equipos físicos reales se realiza después mediante [Field Commissioning](../field/README.md).

## 2. Requisitos del host

Para el camino actual desde repositorio:

- Linux/WSL2 compatible con Docker;
- Git;
- Docker Engine;
- Docker Compose plugin;
- acceso al repositorio privado;
- capacidad de obtener las imágenes base;
- almacenamiento persistente suficiente;
- reloj/NTP correcto.

Para una **VM/appliance de cliente comparable al workload actualmente observado**, el baseline aprobado es:

- **4 vCPU**;
- **16 GB RAM**;
- **200 GB SSD virtual expandible**, preferentemente thin-provisioned;
- **x86_64/amd64**;
- Ubuntu Server 24.04 LTS como sistema base objetivo.

Validar el host de forma no destructiva antes del commissioning:

```bash
bash scripts/release/client-vm-preflight.sh
```

El sizing, sus márgenes, escalamiento y límites se documentan en [Client VM / Appliance Baseline](client-vm-appliance.md).

Node.js no es obligatorio en el host cuando todo se construye dentro de Docker. Sí es necesario para el modo DEV sin Docker.

Registrar versiones reales en la evidencia de instalación:

```bash
docker version
docker compose version
git --version
uname -a
```

## 3. Obtener el release

No instalar una rama arbitraria.

```bash
git clone <repository>
cd AppM-Site-Mapper
git fetch --all --tags
git checkout <approved-release-ref>
git rev-parse HEAD
```

Registrar el SHA. Si existe una modificación local, la instalación deja de representar el release aprobado.

## 4. Contrato de arranque limpio con seed-01

Para esta línea de release el arranque persistente canónico es:

```dotenv
MONGODB_DB_NAME=seed-01
SITE_MAPPER_SEED_PROFILE=seed-01
```

Sobre una Mongo vacía, la aplicación debe crear automáticamente la base canónica de `seed-01`: Network, Site, Structure, Level, Room, área/posiciones QDF, racks QDF-2/QDF-4/QDF-5, BDFB, Equipment y perfiles industriales declarados por el seed.

**No se admite como procedimiento normal** ejecutar después scripts Python, `mongosh`, updates manuales a colecciones o fixtures para completar lo que el seed debió crear.

Si el seed encuentra una contradicción de identidad, serial, parentage, tipo o estructura, debe **fallar explícitamente**. No debe “reparar” silenciosamente datos incompatibles.

El estado sintético de integración (publishers/emuladores/fixtures) es otra capa y no forma parte de la verdad física canónica del seed.

## 5. Configuración privada

Crear el archivo local solo si no existe:

```bash
test -e .env || cp .env.example .env
```

Generar secretos fuera de Git. El Compose persistente exige, como mínimo para su configuración base:

- `TIMESCALE_DB_PASSWORD`;
- `BOOTSTRAP_ADMIN_TOKEN`;
- `TELEMETRY_STORE_TOKEN`;
- `MODBUS_BRIDGE_TOKEN`;
- `MODBUS_SOURCE_UNITS_JSON`.

Además debe decidirse explícitamente:

- `APP_ENV`;
- `MONGODB_DB_NAME`;
- si `TELEMETRY_ENABLED` estará activo;
- broker/topic/source identities;
- perfiles SNMP/industriales;
- política Modbus.

No copiar un `.env` de otro cliente.

## 6. Validar el Compose antes de arrancar

```bash
docker compose -f docker-compose.telemetry.yml config --quiet
```

Si se utilizará la extensión industrial:

```bash
docker compose \
  -f docker-compose.telemetry.yml \
  -f docker-compose.industrial.yml \
  config --quiet
```

Un error de variable requerida se corrige en configuración; no debe eliminarse la guarda para “hacerlo arrancar”.

## 7. Primera instalación persistente

```bash
docker compose -f docker-compose.telemetry.yml up -d --build
docker compose -f docker-compose.telemetry.yml ps
```

No utilizar `down -v` durante diagnóstico.

Los volúmenes contienen estado que no se reconstruye con `git pull`.

## 8. Salud mínima

Verificar:

```text
Site Mapper HTTP
MongoDB replica set
TimescaleDB
Telemetry Store
Modbus sidecar
Operational Console when enabled
SNMP collector when selected
```

El endpoint de Site Mapper confirma disponibilidad HTTP, no todas las dependencias. Consultar también los healthchecks/diagnósticos de los servicios correspondientes.

## 9. Bootstrap

En una base nueva:

1. confirmar el `MONGODB_DB_NAME` correcto;
2. utilizar `BOOTSTRAP_ADMIN_TOKEN` por el endpoint de bootstrap;
3. crear un único primer administrador;
4. comprobar login;
5. retirar/rotar el secreto de bootstrap según la política del deployment.

No insertar usuarios directamente en MongoDB.

## 10. Persistencia y reinicio

Antes de incorporar equipos reales:

1. crear un objeto de prueba controlado o usar el inventario aprobado;
2. reiniciar los contenedores sin borrar volúmenes;
3. confirmar que usuarios/topología persisten;
4. confirmar que TimescaleDB conserva su esquema;
5. confirmar que los servicios vuelven a healthy.

## 11. Existing installation

Si el host ya contiene datos:

- no ejecutar seeds;
- no cambiar el nombre de DB por conveniencia;
- ejecutar el preflight de migración aplicable;
- obtener backup verificable;
- detener writers cuando la migración lo requiera;
- aplicar únicamente la migración versionada aprobada.

Consultar [Backup/Restore](../operations/backup-restore.md) y las notas de hardening/migración.

## 12. Conectar equipos reales

Después de que la plataforma base sea estable:

```text
Site Survey
 -> real Device/Equipment
 -> MQTT/SNMP
 -> RAW
 -> commissioning
 -> LIVE
 -> history
 -> Modbus
 -> Metasys SAT
```

Seguir [Commissioning de equipos reales](../field/real-equipment-commissioning.md).

## 13. Entrega final de cliente

Este procedimiento desde source es el camino de ingeniería actual. La entrega productizada objetivo no debe exigir Git ni compilación:

```text
docker load < immutable-images.tar
docker compose -f compose.client.yml up -d --no-build --pull never
```

El bundle deberá incluir:

- imágenes por digest;
- `compose.client.yml` sin `build:`;
- plantilla de environment;
- manifiesto SHA/digests;
- guía install/upgrade/rollback;
- referencia de backup/restore;
- release SHA/version.

Hasta que ese bundle sea construido y ensayado, no afirmar que la distribución offline del cliente está certificada.

## 14. Evidencia de portabilidad

Registrar por cada ensayo:

| Campo               | Valor             |
| ------------------- | ----------------- |
| Release SHA         |                   |
| OS / arch           |                   |
| Docker version      |                   |
| Compose version     |                   |
| Installation mode   | source / bundle   |
| Fresh host          | yes/no            |
| Existing data       | yes/no            |
| Startup result      | PASS/FAIL         |
| Restart result      | PASS/FAIL         |
| Backup/restore      | PASS/FAIL/NOT_RUN |
| Field commissioning | PASS/FAIL/NOT_RUN |
| Evidence reference  |                   |
