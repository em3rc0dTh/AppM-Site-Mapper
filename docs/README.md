# Documentación · AppM Site Mapper MK1

**Punto de partida para operadores, desarrolladores, evaluadores del MVP y responsables de despliegue.** El README raíz resume el producto y muestra los diagramas principales. Este índice distingue la arquitectura implementada de la documentación histórica de reconstrucción.

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
