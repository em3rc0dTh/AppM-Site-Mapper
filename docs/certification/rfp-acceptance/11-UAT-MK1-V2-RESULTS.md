# Site Mapper MK1 — UAT v2.0 · Registro de resultados

**Tipo:** plantilla inicial de ejecución; **no es evidencia de pruebas ejecutadas**.  
**Fecha de creación:** 2026-11-16.  
**Baseline de código objetivo (no deployment):** `7a43be8161ef938dbd2da7b1586fefcd329fbd79`.  
**Matriz y procedimientos:** [10-UAT-MK1-V2-PLAN.md](10-UAT-MK1-V2-PLAN.md).

## Identificación de corrida (completar antes de comenzar)

| Campo                                                | Valor                                              |
| ---------------------------------------------------- | -------------------------------------------------- |
| Run ID                                               | PENDIENTE                                          |
| Release SHA ejecutado                                | PENDIENTE — debe reconciliarse con el SHA objetivo |
| Imagen/digest instalado                              | PENDIENTE                                          |
| Entorno / host controlado                            | PENDIENTE                                          |
| Fecha/zona horaria                                   | PENDIENTE                                          |
| Evidencia CI asociada al mismo SHA                   | PENDIENTE                                          |
| Responsable de aceptación / operador / ingeniería OT | PENDIENTE                                          |
| Protocolo de pruebas seguras aprobado                | PENDIENTE                                          |
| Datos LAB/FIELD y ubicación privada de evidencias    | PENDIENTE                                          |

## Resumen (sin ejecuciones registradas)

| Estado  | Número |
| ------- | -----: |
| PASS    | 0      |
| FAIL    | 0      |
| BLOCKED | 0      |
| N/A     | 0      |
| NOT_RUN | 33     |

**Disposición:** `NOT_EXECUTED` · NO UAT PASS · NO FIELD ACCEPTED. Los ACC-001..018 permanecen en su [registro histórico separado](04-TEST-RESULTS.md).

## Matriz de evidencia por caso

| Caso    | Módulo               | Resultado | Evidencia privada (referencia sin secretos) | Hallazgo / ticket / propietario |
| ------- | -------------------- | --------- | ------------------------------------------- | ------------------------------- |
| UAT-001 | Control              | NOT_RUN   | —                                           | —                               |
| UAT-002 | Control              | NOT_RUN   | —                                           | —                               |
| UAT-101 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-102 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-103 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-104 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-105 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-106 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-107 | PR223 Seguridad      | NOT_RUN   | —                                           | —                               |
| UAT-201 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-202 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-203 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-204 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-205 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-206 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-207 | PR224 Alarmas        | NOT_RUN   | —                                           | —                               |
| UAT-301 | PR225 Retiro consola | NOT_RUN   | —                                           | —                               |
| UAT-302 | PR225 Retiro consola | NOT_RUN   | —                                           | —                               |
| UAT-303 | PR225 Retiro consola | NOT_RUN   | —                                           | —                               |
| UAT-401 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-402 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-403 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-404 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-405 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-406 | PR226 Rastreo        | NOT_RUN   | —                                           | —                               |
| UAT-501 | Regresión            | NOT_RUN   | —                                           | —                               |
| UAT-502 | Regresión            | NOT_RUN   | —                                           | —                               |
| UAT-503 | Regresión            | NOT_RUN   | —                                           | —                               |
| UAT-504 | Regresión            | NOT_RUN   | —                                           | —                               |
| UAT-505 | Regresión            | NOT_RUN   | —                                           | —                               |
| UAT-601 | FIELD / SAT          | NOT_RUN   | —                                           | —                               |
| UAT-602 | FIELD / SAT          | NOT_RUN   | —                                           | —                               |
| UAT-603 | FIELD / SAT          | NOT_RUN   | —                                           | —                               |

## Registro unitario por corrida (duplicar, sin sobrescribir resultados previos)

```text
UAT Case:
Run ID:
Código SHA real / image digest:
Ambiente y procedencia: LAB | PRE-PROD | FIELD
Responsable de la ejecución:
Inicio / fin ISO-8601:
Prerrequisitos y autorización:
Acciones ejecutadas (o ausencia de ejecución):
Resultado observado verificable:
Resultado esperado (plan v2.0):
Evidencia privada — URI/ID controlado, sin secretos:
Resultado: PASS | FAIL | BLOCKED | N/A | NOT_RUN
Motivo BLOCKED/N/A si aplica:
Incidencia y retest asociados:
Revisó y fecha:
```

## Firmas y disposición

| Rol                  | Responsable | Fecha | Resultado | Referencia firmada |
| -------------------- | ----------- | ----- | --------- | ------------------ |
| Software owner / QA  | PENDIENTE   | —     | NOT_RUN   | —                  |
| Seguridad/OT         | PENDIENTE   | —     | NOT_RUN   | —                  |
| Ingeniería eléctrica | PENDIENTE   | —     | NOT_RUN   | —                  |
| Cliente/aceptación   | PENDIENTE   | —     | NOT_RUN   | —                  |

**Norma de integridad:** una Actions verde no modifica estos valores. Cada PASS exige ejecutar el procedimiento sobre la misma release, adjuntar evidencia y aprobación. El SAT/cliente tiene una puerta distinta. No editar datos ni estado del cliente para completar este documento.
