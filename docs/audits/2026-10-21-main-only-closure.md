# Site Mapper MK1 — consolidación y disposición de ramas (2026-10-21)

**Base inicial de referencia:** `main` @ `4b91b1dec11c530aca6132ce19a9ea3b5df5fe46`. **Estado final:** `main` como única rama remota, sin pérdida de los nueve commits históricos, ahora fijados por etiquetas Git.  
**Intención:** mantener `main` como única rama de desarrollo activa, sin introducir regresiones de implementaciones antiguas.

## Regla de seguridad

Cerrar una PR, borrar una rama o tener su código en el historial **no equivale** a integrar automáticamente su funcionalidad. La decisión que sigue distingue tres categorías:

- **Ya absorbido/sustituido:** la versión actual en `main` contiene el comportamiento vigente; no se sobreescribe con implementaciones más antiguas.
- **Histórico no incorporado íntegramente:** se preserva referencia inmutable al commit y PR; para recuperar una capacidad se reimplementará/cherry-pickeará de forma selectiva en PR futuro.
- **Pruebas históricas:** la certificación de `main` es el criterio vigente; se compararon los scripts anteriores con las verificaciones actuales.

## Inventario y disposición de las nueve ramas restantes

| Rama | Commit histórico | Situación respecto a main | Decisión |
| --- | --- | --- | --- |
| `docs/operator-manual-mk1-20261019` | `12ce9fad1ac51f8d21375a71775340bb1ca442d7` | Los cinco documentos ya existen en `main`, con contenido posterior más amplio | Sustituida por el manual vigente; no copiar versión vieja |
| `feat/mk1-security-closure` | `cb2c5f51d487010f4568a8c5ff806bc2d80204de` | `main` ya implementa `assertMqttProductionSecurity`, incluyendo TLS y credenciales, y tiene pruebas en `tests/unit/telemetry-security.test.ts` | Sustituida; no restaurar el antiguo runtime |
| `fix/mk1-serial-identity-and-powerpath-e2e` | `bc81bfdcb9233e202aef32e373a6eaec1f14aa9d` | `src/app/api/topology/route.ts`, `topology-service.ts` y los scripts HTTP de aceptación son iguales byte a byte a la rama; el bootstrap vigente tiene actualizaciones posteriores | Ya absorbida en el recorrido actual |
| `test/adversarial-g10-cross-target-20261013` | `9759832344eb23275af0ec06bdcae2fb568f58ca` | `main` verifica origen y punto erróneos, breaker de otro Site, idempotencia y concurrencia en `scripts/ci/http-operational-journey.mjs` | Cubierta por la certificación actual |
| `test/adversarial-main-20261013` | `5b727e30af5aa4a9be53e9e7b8e709986a4d0f05` | La ruta de commissioning y sus pruebas evolucionaron desde esta variante | Histórica, no revertir la ruta actual |
| `feat/mk1-g8-inventory-rack-elevation` | `07f73c3fd3cc940c1d1fe818ec4b2184ba7b276a` | PR #10 cerrada sin merge; modelo/contratos de elevación anteriores al MK1 actual | Retirar rama de trabajo, conservar PR como referencia histórica; no fusionar su código |
| `feat/zip-faithful-room-bdfb` | `3fcd47a10ef0141d43803924d5d634dd9b8f05f0` | PR #36 anterior al rediseño Home BDFB v2; diferencias de UI, layouts y BDFB que podrían revertir la experiencia vigente | Cerrar como supersedida, **no incorporada íntegramente** |
| `docs/v1-telxius-product-telemetry-contract` | `fd3b5ac7d3f80e8842bf7273371196ce5eaa41bd` | PR #30 con 170 commits exclusivos respecto a `main`, numerosos cambios de telemetría, identidad y durabilidad; paradigma anterior y contratos incompatibles potencialmente | Cerrar como propuesta histórica, **no incorporada íntegramente**; conservar ADR, seguridad/outbox/DLQ como material de investigación futuro |
| `feat/spatial-authoring-engine-v0.1` | `7752a90f3444ea6a862d2842099107f9d520079e` | PR #29 con 327 commits exclusivos, editor espacial y migraciones anteriores a arquitectura y UI actuales | Cerrar como propuesta histórica, **no incorporada íntegramente**; reevaluar herramientas espaciales antes de portar capacidades |

**Importante:** Para las PR #29, #30 y #36 se reconoce explícitamente que hay implementación exclusiva **no presente en el árbol de `main`**. Un cierre de PR evita la integración ciega; no es certificación de paridad funcional. Si posteriormente se requieren esas capacidades, recuperar sus commits mediante el SHA/PR correspondiente y someterlas a pruebas nuevas.

## Fuente de verdad operacional

- `main` contiene Home BDFB v2 + colector SNMP opcional + ingestión por alimentador, así como las correcciones HTTP/MongoDB/Modbus ya fusionadas.
- El pipeline general y el E2E operativos de `main` fueron verificados como satisfactorios en el ciclo de consolidación anterior.
- La conexión física Delta, su firmware/OID y credenciales siguen siendo una dependencia externa. No se afirma certificación con hardware.
- **Limpieza ejecutada y verificada:** un workflow temporal con permiso `contents: write` creó y verificó nueve etiquetas Git `refs/tags/archive/site-mapper-2026-10-21/<rama>` (cada una apunta exactamente al SHA histórico de esta tabla) y posteriormente eliminó las nueve referencias `refs/heads/<rama>`. GitHub Actions run `39630794397`: **success**. La API de ramas devolvió exclusivamente `main`. Los respaldos etiquetados permanecen en el repositorio y se pueden recuperar mediante `git fetch --tags`.

## Política futura

Nuevos cambios se originan desde `main`, pasan CI/aceptación, se integran y su rama se elimina automáticamente después del merge. Evitar múltiples ramas de integración paralelas sin responsable y sin fecha de cierre.
