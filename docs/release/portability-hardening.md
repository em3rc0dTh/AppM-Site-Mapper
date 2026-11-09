# Release Gate · Portability & Real Equipment Commissioning

## Objetivo

Demostrar que Site Mapper puede instalarse, configurarse, diagnosticarse, actualizarse y recuperarse en una máquina limpia sin depender del estado del equipo del desarrollador, y que un ingeniero puede incorporar equipos físicos reales siguiendo procedimientos controlados.

Este gate no agrega nuevas funcionalidades de producto. Convierte la implementación actual en una entrega reproducible y comisionable.

## Alcance

```mermaid
flowchart LR
  A[Clean machine] --> B[Release artifacts]
  B --> C[Install]
  C --> D[Bootstrap]
  D --> E[Topology]
  E --> F[Real Equipment]
  F --> G[MQTT / SNMP]
  G --> H[RAW]
  H --> I[Commission]
  I --> J[LIVE]
  J --> K[Timescale]
  K --> L[Modbus]
  L --> M[Metasys SAT]
  M --> N[Restart]
  N --> O[Backup / Restore]
  O --> P[Acceptance]
```

Procedimiento ejecutable: [Clean Host Installation](clean-host-installation.md). Baseline de infraestructura: [Client VM / Appliance](client-vm-appliance.md).

## P0 · Portabilidad

- [ ] la VM/host objetivo cumple el baseline documentado de **4 vCPU / 16 GB RAM / 200 GB SSD virtual expandible** o existe una excepción de sizing aprobada;
- [ ] `scripts/release/client-vm-preflight.sh` pasa antes del commissioning y registra capacidad/umbrales sin modificar el host;
- [ ] `.env.example` contiene todas las variables necesarias para los Compose soportados o las marca explícitamente como externas/opcionales.
- [ ] instalación limpia documentada;
- [ ] Mongo vacía + `MONGODB_DB_NAME=seed-01` + `SITE_MAPPER_SEED_PROFILE=seed-01` materializa el seed canónico sin scripts correctivos;
- [ ] reiniciar el mismo release sobre el seed aplicado es idempotente y no duplica inventario;
- [ ] conflictos del seed fallan de forma explícita; no existen auto-reparaciones silenciosas;
- [ ] versiones de runtime e imágenes registradas;
- [ ] no se requiere ningún archivo fuera del release salvo configuración/secretos del deployment;
- [ ] healthchecks permiten identificar qué dependencia falla;
- [ ] persistencia se conserva al recrear contenedores;
- [ ] upgrade y rollback no destruyen volúmenes;
- [ ] backup y restore se ensayan en un destino aislado.

## P0 · Field commissioning

- [ ] Site Survey;
- [ ] procedimiento MQTT real;
- [ ] procedimiento SNMP real;
- [ ] discovery RAW;
- [ ] validación de OID/raw point -> meaning -> scale -> unit;
- [ ] binding explícito a Equipment;
- [ ] LIVE;
- [ ] histórico;
- [ ] Modbus mapping;
- [ ] Metasys SAT;
- [ ] restart/recovery;
- [ ] As-Built/evidence reference.

## P0 · Determinismo de distribución

La entrega objetivo para cliente continúa siendo:

```text
immutable application images
+ compose.client.yml without build:
+ environment template
+ release manifest
+ image digests / hashes
+ install/upgrade/rollback guide
```

El Compose de ingeniería puede seguir construyendo desde source, pero no debe confundirse con el paquete de cliente.

## Terminología de evidencia

Usar:

- **DEV** para memoria/datos sintéticos;
- **INTEGRATION / PRE-PRODUCTION** para el stack persistente que reproduce el camino operacional;
- **FIELD** para hardware/red OT reales;
- **PRODUCTION** solo después de aceptación del alcance real.

La evidencia de integración controlada es valiosa y cercana a operación real, pero no sustituye la prueba de identidad/cableado/red/BMS del sitio.

## Criterio de salida

El gate pasa cuando una persona que no preparó el entorno original puede, usando exclusivamente los artefactos y documentos aprobados:

1. desplegar Site Mapper en un host limpio;
2. inicializar o restaurar persistencia;
3. registrar un equipo real;
4. conectar su fuente MQTT o SNMP;
5. observar RAW y comisionar la semántica;
6. verificar LIVE e histórico;
7. publicar Modbus cuando aplique;
8. completar un SAT con Metasys cuando aplique;
9. reiniciar y comprobar recuperación;
10. ejecutar backup/restore y dejar evidencia reproducible.

Hasta entonces el estado debe expresarse como RC / integration-preproduction según el alcance validado, no como producción genérica.
