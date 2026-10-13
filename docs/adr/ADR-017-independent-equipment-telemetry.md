# ADR-017 — Telemetría independiente por Equipment

**Estado:** Aceptado por decisión de producto del 2026-10-12.

## Decisión

> Todo Equipment puede actuar como entidad telemétrica independiente, identificable mediante su SN y asociable automáticamente a una fuente autenticada. Sus mediciones son propias y pueden participar en agregaciones jerárquicas explícitas sin perder trazabilidad ni mezclar lecturas de equipos distintos.

El SN único de un Equipment activo resuelve al mismo Equipment, cualquiera que sea su tipo o profundidad. El Device y los Equipment ancestros aportan contexto físico; no sustituyen al propietario de la medición. No es necesario crear un Device adicional.

## Invariantes

- `TelemetryIdentityResolver` comprueba propietario activo, cadena de ancestros sin ciclos, referencias bidireccionales y pertenencia al mismo Device.
- Un SN duplicado, archivado, cambiado o una jerarquía inconsistente bloquean la asociación automática. Un binding manual inválido no se reasigna silenciosamente.
- `TelemetryBinding` conserva `sourceIdentity`, `targetType`, `targetId`, identificador del binding y evidencia de descubrimiento. El binding SOURCE se persiste y se revalida al ingerir.
- Las lecturas directas se consultan por identidad exacta. Los puntos de un gateway requieren bindings de punto y métrica; reconocer su SN no mapea sus circuitos.
- Los breakers con bindings explícitos también reciben una vista propia, con `sourcePointId` y `metricBindingIds`. Si tienen una fuente SOURCE propia, esa fuente prevalece sobre la vista derivada.
- Latest State no combina payloads de publicadores o bindings distintos. El histórico conserva la identidad original aun si posteriormente cambia el SN.

## Autenticación

El resolvedor identifica inventario, no autentica hardware. El límite de confianza de producción es el broker configurado con TLS, credenciales y ACL que restrinjan cada publicador a su topic. La aplicación valida topic/payload y exige permisos para lectura e ingestión de desarrollo. MQTT no entrega al consumidor la identidad autenticada del publicador; verificar esas ACL sigue siendo una tarea de infraestructura. El emulador local sigue admitiendo transporte de desarrollo.

## LIVE e histórico

Todos los Equipment y Device no BDFB usan el inspector reutilizable: LIVE, 24H, 7D, 15D, 1M. LIVE diferencia UNMAPPED, NO DATA, LIVE (hasta 30 s), STALE (hasta 5 min) y OFFLINE. Un conflicto se muestra como error, sin conservar valores de otro contexto.

`GET /api/telemetry/entity?targetId=<id>&window=<window>` exige `telemetry:read`, verifica la entidad activa y devuelve datos propios. No consulta por SN aislado. El histórico genérico muestra el último paquete por fuente/binding y bucket, hasta 1000 paquetes: 5 min, 30 min, 1 h y 2 h respectivamente. No presenta un promedio eléctrico para métricas incompatibles. Conserva los nombres y unidades recibidos; la vista compacta muestra hasta 24 campos por paquete.

La tabla adicional `telemetry_entity_samples` guarda los patches aceptados con identidad, binding, fuente, timestamps y payload. Los patches no se rellenan con valores antiguos. `telemetry_samples` conserva el histórico eléctrico BDFB existente.

## Agregación explícita

La proyección BDFB es una política de agregación existente: reúne solo lecturas con IDs de Device y breaker comprobados, bindings de métrica explícitos y unidades eléctricas compatibles. Fuentes duplicadas para un breaker se excluyen del agregado. La vista propia del Equipment no recibe el payload de su padre o sus hermanos. El promedio BDFB es descriptivo, no potencia total ni consumo acumulado.

No se agrega arbitrariamente una UPS, un Switch y un medidor por compartir padre. Otras políticas necesitan definir alcance, métrica, unidad, operación, frescura y prevención del doble conteo antes de implementarse.

## Transición

Un binding automático antiguo que demuestra `UNIQUE_INVENTORY_SN` + `matchedNodeId` de un Chassis raíz activo se convierte del Device a ese mismo Chassis al llegar el siguiente paquete. Se conserva el ID y se registra `previousTargetId` e `identityVersion=2`. Los bindings manuales y los datos históricos existentes no se reescriben.

Actualizar la rama de trabajo y reiniciar Next.js. Reconstruir el adaptador de histórico:

```bash
git pull --ff-only
docker compose -f docker-compose.telemetry.yml up -d --build
npm run local:mongo-mqtt
```

El adaptador aplica la migración SQL aditiva 002 al iniciar, incluso en un volumen existente. No borra tablas ni datos. Si el histórico es administrado externamente, aplicar `infra/telemetry-store/init/002-entity-telemetry.sql` antes de iniciar el adaptador actualizado. Las lecturas genéricas anteriores a esta versión no existen retrospectivamente.

## Evidencia y límite

Pruebas dirigidas cubren Equipment descendiente no BDFB, aislamiento de padre/hermano, archivo del ancestro, SN duplicado, transición del binding anterior, estado por frescura y escritura/consulta de histórico con identidad exacta. No equivalen a certificación contra el broker, MongoDB y TimescaleDB del usuario.
