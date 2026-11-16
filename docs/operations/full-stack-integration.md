# Full Stack Integration · seed-01

Este es el camino oficial para levantar **todo el stack controlado** desde una máquina limpia, sin depender del repositorio BFDB externo y sin ejecutar scripts de reparación posteriores.

## Un solo comando

Desde la raíz del repositorio:

```bash
docker compose \
  --env-file infra/integration/integration.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.integration.yml \
  up -d --build
```

El arranque debe dejar disponibles:

```text
MongoDB + replica set
seed-01 v8
Site Mapper
primer SUPERADMIN de integración
TimescaleDB
Telemetry Store
Mosquitto
publisher MQTT continuo
3 agentes SNMP controlados
3 collectors SNMP polling
SNMP trap/inform receiver + spool durable
SNMP trap sender controlado
Modbus TCP
Operational Console
```

## Credenciales de integración

Estas credenciales son deliberadamente conocidas y **solo existen para el perfil controlado local/CI**:

```text
URL:      http://127.0.0.1:3000/login
Email:    integration@site-mapper.local
Password: Seed01-Integration-Only!2026
```

Nunca reutilizar estos valores en FIELD o PRODUCTION.

## Qué hace seed-01-controlled

El Compose establece:

```dotenv
MONGODB_DB_NAME=seed-01
SITE_MAPPER_SEED_PROFILE=seed-01
SITE_MAPPER_INTEGRATION_PROFILE=seed-01-controlled
```

Con Mongo vacía, Site Mapper crea automáticamente el baseline seed-01. El perfil de integración agrega únicamente fixtures sintéticos marcados:

- bindings MQTT para los 74 breakers confirmados en QDF-2/QDF-4/QDF-5;
- feeds SNMP Config2 A/B controlados por QDF; A sirve A3+A2 y B sirve B3+B2;
- hardware profile Config4 para el entorno sintético;
- Unit IDs Modbus de integración.

No convierte datos sintéticos en evidencia de campo.

## MQTT controlado

El broker local es Mosquitto y el publisher emite cada cinco segundos:

```text
26092403950003 -> QDF-2
26092403950004 -> QDF-4
26092403950002 -> QDF-5
```

sobre:

```text
data/dev/<serial>
```

con cuatro grupos de 24 puntos:

```text
0_1_1..24
0_2_1..24
0_3_1..24
0_4_1..24
```

QDF-2 usa las posiciones post-migración aceptadas A3/B3 1..13. Las posiciones legacy A1/A2/B1/B2 permanecen como evidencia y no son posiciones físicas actuales.

## SNMP controlado

Tres agentes locales exponen el contrato sintético Config4:

```text
INT-SNMP-QDF-2
INT-SNMP-QDF-4
INT-SNMP-QDF-5
```

Cada uno publica 4 CURRENT + 4 VOLTAGE mediante SNMPv2c en la red Docker aislada. Tres collectors independientes consultan esos OIDs y entregan las observaciones al endpoint autenticado de Site Mapper.

Los feeds deben aparecer como `LAB_LIVE`, nunca como `LIVE` de campo, porque `independentInputConfirmed=false` y el commissioning está marcado `SYNTHETIC_LAB_ONLY`.

## SNMP traps/informs

El perfil controlado también levanta un receptor industrial SNMP independiente del polling:

```text
snmp-trap-sender
  -> UDP/1162
  -> snmp-traps
  -> durable spool
  -> /api/telemetry/industrial/ingest
  -> Mongo industrial_events
  -> Timescale industrial_observations
```

La fuente `INT-TRAP-QDF-2` usa una IP fija únicamente dentro de la red Docker de integración para que el receiver pueda autenticar origen + community de forma determinista. Esto es evidencia de transporte/orquestación, no evidencia de un controller físico.

## Histórico

MQTT, SNMP polling y SNMP trap/inform deben persistir en sus stores correspondientes.

El clean-stack CI exige:

- filas de breakers MQTT en `telemetry_samples`;
- filas SNMP ACCESS_PORT en `telemetry_entity_samples`;
- eventos trap/inform en Mongo `industrial_events`;
- observaciones trap/inform entregadas a Timescale `industrial_observations`.

## Modbus

La integración controlada reserva:

```text
26092403950003 -> Unit 1
26092403950004 -> Unit 2
26092403950002 -> Unit 3
```

con layout `panels-4x24`. QDF-4/QDF-5 deben recibir proyecciones desde muestras MQTT aceptadas.

## Operational Console

Disponible en:

```text
http://127.0.0.1:3100
```

## Estado

```bash
docker compose \
  --env-file infra/integration/integration.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.integration.yml \
  ps
```

Logs relevantes:

```bash
docker compose \
  --env-file infra/integration/integration.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.integration.yml \
  logs -f site-mapper mqtt-publisher snmp-collector-qdf2 snmp-collector-qdf4 snmp-collector-qdf5
```

## Parada

Sin borrar datos:

```bash
docker compose \
  --env-file infra/integration/integration.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.integration.yml \
  stop
```

Para la prueba de máquina completamente virgen se parte de volúmenes inexistentes. No usar `down -v` sobre una instalación que se quiera conservar.

## FIELD

FIELD no usa `docker-compose.integration.yml`.

El mismo Site Mapper base se conecta a:

```text
broker MQTT real
controllers SNMP reales
TimescaleDB
Modbus/Metasys real
```

mediante [Field Commissioning](../field/README.md). Cambiar de integración a FIELD significa cambiar endpoints, credenciales y commissioning aprobado; no modificar código ni ejecutar scripts de reparación.
