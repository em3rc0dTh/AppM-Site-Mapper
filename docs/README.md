# Documentación · AppM Site Mapper MK1

**Punto de partida para operadores, desarrolladores, evaluadores del MVP y responsables de despliegue.** El README raíz resume el producto y muestra los diagramas principales. Este índice distingue la arquitectura implementada de la documentación histórica de reconstrucción.

## Camino recomendado para una persona nueva (octubre 2026)

**[1. Recorrido ilustrado desde Login hasta MQTT, SNMP, TimescaleDB y Modbus](user-guide/recorrido-completo-login-mqtt-snmp-modbus.md)**: usar la interfaz sin conocer código, IDs ni base de datos.

**[2. Encender y reanudar el laboratorio existente en WSL/Docker](operations/laboratorio-industrial-para-principiantes.md)**: estado seguro, acceso inicial, cuándo iniciar el publicador MQTT, validación visual y procedimiento SNMP Config2 BDFB-02/03 con respaldo automático.

**[3. Evidencia real de SNMP BDFB-01 A/B](telemetry/bdfb01-snmp-ui-acceptance-2026-10-24.md)**: laboratorio probado (no lecturas físicas).

La nueva guía reemplaza como **punto de entrada** a los procedimientos técnicos largos; estos últimos continúan vigentes como referencia. **No** utilices un Compose nuevo para sustituir la base original de la computadora de laboratorio.

## Primer día en Site Mapper: Manual del operador

Para formación integral, utiliza el **[Manual maestro de operación y modelo de datos](user-guide/manual-maestro.md)**. Sus capítulos enlazan a los tutoriales existentes y su [matriz de evidencia visual](user-guide/evidencia-visual.md) distingue capturas reales, errores observados y material aún pendiente. La [explicación del modelo persistido](user-guide/modelo-de-datos.md) refleja `topology_nodes` sin migrar colecciones.

**[Manual del Operador MK1](user-guide/README.md)** — para personas que nunca usaron el sistema. Explica cómo crear la jerarquía física, usar Blueprint, colocar Rack, distinguir Device/Equipment, identificar puertos **CONNECTED**, registrar PowerPaths uno-a-uno, comisionar MQTT y verificar LIVE/histórico. Incluye ejercicios seguros, errores frecuentes y criterios de aprendizaje.

El [guion de presentación](product/MVP-DEMO-ES.md) sirve para mostrar capacidades a un cliente; el **manual del operador** enseña a realizar tareas por cuenta propia. La secuencia de capturas reales pendientes está registrada en [material visual y capacitación](user-guide/capturas-y-capacitacion.md).

## Ruta de lectura por perfil

| Perfil / objetivo               | Empieza aquí                                      | Continúa con                                                                                               |
| ------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Persona que evalúa el producto  | [Guion del MVP (español)](product/MVP-DEMO-ES.md) | [Alcance y evidencia](release/MVP-READINESS.md)                                                            |
| Persona que necesita levantarlo | [Quickstart](operations/quickstart.md)            | [Variables](operations/environment-reference.md)                                                           |
| Ingeniería / onboarding         | [Mapa del sistema](architecture/system-map.md)    | [Dominio](domain/topology-hierarchy.md) y [módulos](../src/modules/README.md)                              |
| Operación y diagnóstico         | [Runbook](operations/runbook.md)                  | [Incidente de histórico](operations/history-connectivity.md), [laboratorio](operations/mqtt-modbus-lab.md) |
| Release / seguridad             | [MVP Readiness](release/MVP-READINESS.md)         | [Checklist de release](release/release-checklist.md) y [limitaciones](release/known-limitations.md)        |
| Migración y datos               | [Guía de migración](migrations/legacy-to-mk1.md)  | [Backup/restore](operations/backup-restore.md)                                                             |

## ¿Qué documentación es normativa?

1. **Contrato de dominio aceptado:** [Jerarquía física](domain/topology-hierarchy.md), [dominio](domain/domain-contract.md), [invariantes](domain/invariants.md) y ADR pertinentes.
2. **Comportamiento implementado:** código en `src/modules/`, APIs en `src/app/api/`, Compose y pruebas.
3. **Operación actual:** guías en `operations/` y estado de release en `release/`.
4. **Historia y referencias:** `CONTRACT.md`, `product/MK1-RECONSTRUCTION-CONTRACT.md`, materiales de `legacy/` y receipts de G0–G15. Son trazabilidad de decisiones, **no instrucciones de desplegar automáticamente**.

Las referencias `CONTRACT.md` en el directorio raíz del repositorio y en `docs/product/` retratan el momento de reconstrucción inicial. No se deben borrar, pero frases históricas como "repositorio vacío" o jerarquías propuestas no prevalecen sobre las decisiones aceptadas.

## Mapa por área

| Área                       | Documento de entrada                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Visión de arquitectura     | [Diagrama y fronteras de datos](architecture/system-map.md)                                                             |
| Persistencia               | [Persistence](architecture/persistence.md)                                                                              |
| Plano y rack               | [Blueprint](domain/blueprint-engine.md), [CAS](domain/cas-specification.md), [Rack Elevation](domain/rack-elevation.md) |
| BDFB y energía             | [Power domain](domain/bdfb-power.md)                                                                                    |
| MQTT, LIVE e histórico     | [Contrato de telemetría](telemetry/contract.md)                                                                         |
| Modbus                     | [Modbus TCP output](telemetry/modbus-tcp-output.md)                                                                     |
| Operational Console        | [Uso y límites](product/operational-console.md)                                                                         |
| Usuario, sesión y permisos | [Seguridad](security/authentication.md), [RBAC](security/rbac-matrix.md)                                                |
| CI y calidad               | [Estrategia de pruebas](testing/strategy.md)                                                                            |
| Avance histórico           | [Gates de reconstrucción](release/gates/)                                                                               |

## Reglas editoriales del repositorio

- Cada capacidad se describe como **implementada**, **verificada en laboratorio**, **pendiente de comprobar en cliente** o **planificada**, nunca como todo ello a la vez.
- Las direcciones, seriales y UUID de laboratorio son **ejemplos de un inventario específico**, no defaults de producto.
- No incluir claves, contraseñas, túneles temporales activos, volúmenes ni datos reales de clientes en documentos.
- Nunca afirmar que un panel está cableado a una fuente solo por el nombre de un slot o un prefijo MQTT. Los cuatro TelemetryBindings activos y confirmados definen la atribución.
- Un estado "7D disponible" no garantiza que durante una caída se persistieran todas las muestras.
- Los diagramas Mermaid son esquemas de arquitectura; no sustituyen el modelo canónico ni el plano físico del cliente.

## Mantenimiento de la documentación

Antes de cerrar una nueva iteración: actualizar README, el documento de área, `release/MVP-READINESS.md` si cambia evidencia y `release/known-limitations.md` si una limitación se resuelve. CI ejecuta Prettier, pruebas, build y auditoría; una página escrita no equivale a una certificación operativa.

## Entregable Metasys — Mapa Modbus TCP

El formato de tablas suministrado por Vertiv es una **referencia de presentación**, no un contrato de direcciones ni una solicitud de nuevos parámetros. La integración Site Mapper ofrece solo **voltaje, corriente, potencia y energía** en Modbus TCP FC03, IEEE-754 FLOAT32, sin comandos de escritura.

- [Especificación de registros y checklist de entrega Metasys](telemetry/metasys-register-map.md).
- [CSV del mapa de 3 BFDB del laboratorio (1,152 mediciones)](telemetry/metasys-register-map.csv).
- [Contrato y límites operacionales del sidecar](telemetry/modbus-tcp-output.md).

Las tablas del CSV son direccionamiento potencial con identidades del emulador; no suponen que los 288 circuitos estén comisionados. Los Unit IDs reales, offsets, orden de palabras, conectividad OT y semántica ante dato vencido requieren verificación de campo con Johnson Controls.
