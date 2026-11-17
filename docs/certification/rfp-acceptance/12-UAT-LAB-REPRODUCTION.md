# UAT LAB — ejecución reproducible y corroboración del cliente

Fecha: 2026-11-17 · Campaña: `UAT-LAB-2026-11-17-R3` · PR #240.

Este procedimiento produce evidencia técnica de laboratorio. La aceptación contractual
sigue los 18 [ACC](03-TEST-PROCEDURES.md) y los 33 [UAT](10-UAT-MK1-V2-PLAN.md).
Un run exitoso no firma esos registros ni acredita instalación eléctrica, Metasys,
certificación OWASP completa o aceptación del cliente.

## 1. Release y entorno

La campaña parte de `c701a60b604756a8fc1ad112009d086141a0aaff`. El baseline documental
anterior era `7a43be8161ef938dbd2da7b1586fefcd329fbd79`; no son intercambiables.
Usar el SHA HEAD/merge probado por cada corrida, nunca asumir que es el último `main`.
El PR añade pruebas de recuperación y habilita las pruebas TSX previamente excluidas;
además corrige el Origin de los seeders de desarrollo, la leyenda W/kW de Equipment,
la sincronización de bootstrap y los selectores/fixtures del recorrido visual. R2 expone Rastreo de Ruta como acción visible en Equipment y exige un launcher realmente visible.
R3 alinea el redirect post-login de los recorridos visuales con `isWorkspaceHref` (incluye
`blueprint`, `rack`, `device` y `power`), preservando la reanudación de contexto. Se aplica
el parche Next.js 16.4.6 por el aviso GHSA-mfr8-8qww-v76h; package-lock fija dependencias.
Por tanto, el candidato del PR requiere su propia evidencia y revisión de impacto.

- Node 22 (>=22.13 y <23), npm con lockfile, Linux y Docker Engine + Compose v2.
- Chromium se instala aislado en los workflows de navegador.
- MongoDB replica set, Mosquitto, TimescaleDB, telemetry-store, Site Mapper,
  Modbus TCP, tres colectores/agentes SNMP y emisor/receptor de traps.
- Perfil `seed-01-controlled`; fuentes sintéticas. Ninguna conexión a TFARM04.
- El frontend del stack integrado corre con `next start` dentro de su imagen.
  Los viajes HTTP/navegador separados usan `next dev`; no confundir ambos contextos.
- `container-images.txt` registra IDs inmutables de imágenes locales. No son digests
  de una release publicada. Las imágenes base con tags flotantes pueden variar:
  conservar el inventario de cada run y fijar los digests antes de FIELD.

## 2. Ejecutar toda la campaña en GitHub Actions

El archivo `.github/uat-verification.json` contiene la lista exhaustiva de 18 workflows
activos. Un PR que cambia ese archivo dispara las 18 suites, sin depender de qué rutas
de producto hayan cambiado. `operational-console.yml` está excluido porque es legado
retirado, con comprobaciones manuales de código archivado.

Para repetir exactamente un run existente, con GitHub CLI autenticado:

```bash
REPO=em3rc0dTh/AppM-Site-Mapper
# Sustituir RUN_ID por el ID numérico del informe de la corrida seleccionada.
gh run view RUN_ID --repo "$REPO"
gh run rerun RUN_ID --repo "$REPO"
gh run watch RUN_ID --repo "$REPO" --exit-status
gh run view RUN_ID --repo "$REPO" --log > RUN_ID.log
gh run download RUN_ID --repo "$REPO" --dir evidence/RUN_ID
```

`rerun` reutiliza el SHA original. No verifica un `main` posterior. Repetir para cada
ID del informe; no usar `--failed` para afirmar que se hizo una campaña completa nueva.
Algunas suites producen logs y otras también artefactos; `run download` sólo aplica
cuando el run publica artefactos.

Para una nueva release, crear una rama corta desde el SHA objetivo, actualizar el
identificador de campaña y baseline en `.github/uat-verification.json`, abrir PR y
esperar sus 18 workflows. Registrar el HEAD y el merge SHA real de checkout.

```bash
git switch -c verification/uat-NUEVA-CAMPANA SHA_OBJETIVO
# Editar .github/uat-verification.json; no modificar resultados anteriores.
git add .github/uat-verification.json
git commit -m 'ci: request isolated UAT laboratory campaign'
git push -u origin HEAD
gh pr create --repo em3rc0dTh/AppM-Site-Mapper --base main --draft \
  --title 'UAT LAB verification' --body 'Controlled synthetic laboratory campaign.'
gh pr checks --watch
```

Revisar la lista del marcador contra los runs observados. Ausente, cancelado, skipped,
queued o in_progress no equivale a PASS. Pasos `if: failure()` omitidos en una corrida
exitosa son diagnósticos condicionales, no verificaciones faltantes. Las suites de
infraestructura usan variables CI para activar pruebas que `npm test` puede omitir.

## 3. Comandos locales de código y dominio

En un checkout limpio del SHA exacto:

```bash
node --version
npm ci --no-audit --no-fund
npm run verify
npm run test:unit
npm run test:certification
npm run test:industrial
npm run test:audit-mongo
node --test infra/modbus-tcp/server.test.mjs
python3 -m unittest discover -s infra/telemetry-store -p 'test_*.py'
npm audit --omit=dev --audit-level=high
```

`npm run verify` valida tipos, lint, formato, tests y build. No sustituye Mongo real,
MQTT real, browser, stack integrado ni restore. Revisar los skipped explícitamente.
Vitest debe incluir `tests/**/*.test.{ts,tsx}`; los componentes se renderizan con el
proveedor real `NextIntlClientProvider` y el catálogo inglés, sin simular traducciones.

Comandos focalizados (identificadores para la matriz de trazabilidad):

| Código   | Comando / workflow                                                                                                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-AUTH   | `npx vitest run tests/integration/auth-service.test.ts tests/integration/mfa-enrollment.test.ts tests/unit/password.test.ts tests/unit/request-security.test.ts tests/unit/content-security-policy.test.ts tests/unit/industrial-credential-security.test.ts`                           |
| T-ALARM  | `npx vitest run tests/unit/alarm-rule-manager.test.ts tests/unit/telemetry-alarm-evaluator.test.ts tests/unit/automatic-telemetry-watch-alarm.test.ts tests/unit/breaker-protection.test.ts`                                                                                            |
| T-TRACE  | `npx vitest run tests/integration/full-power-trace-service.test.ts tests/unit/power-canvas-route.test.tsx`                                                                                                                                                                              |
| T-QDF    | `npx vitest run tests/unit/qdf-total-current.test.ts tests/unit/qdf-total-voltage.test.ts tests/unit/qdf-total-power.test.ts tests/unit/qdf-total-energy.test.ts tests/unit/qdf-load-report.test.ts tests/unit/qdf-modbus-projection.test.ts tests/unit/equipment-contract-ui.test.tsx` |
| T-GOLD   | `npm run test:certification` más workflow `operational-http-e2e.yml` para persistencia Mongo/HTTP/browser real                                                                                                                                                                          |
| W-STACK  | `clean-full-stack-integration.yml`, con script de recuperación de la sección 4                                                                                                                                                                                                          |
| W-HTTP   | `operational-http-e2e.yml`: viaje HTTP, browser, Modbus, reinicio, borrado auditado e integridad Mongo                                                                                                                                                                                  |
| W-ALARM  | `alarm-rule-manager-acceptance.yml`: contratos, Mongo real, HTTP/RBAC y Chromium                                                                                                                                                                                                        |
| W-CHAOS  | `mk1-infrastructure-chaos.yml`, `snmp-chaos-stress.yml`, `snmp-atomic-durability.yml`                                                                                                                                                                                                   |
| W-VISUAL | `visual-parity.yml`: capturas y aserciones de las vistas seleccionadas; no acredita toda la UI                                                                                                                                                                                          |
| W-SEC    | `security-owasp-3000.yml`, `snmp-adversarial-security.yml`, `mk1-adversarial-wheel.yml`                                                                                                                                                                                                 |
| W-LAN    | `s06-static-contract.yml`: sintaxis y contratos solamente; no ejecuta TLS ni air-gap                                                                                                                                                                                                    |

## 4. Levantar el sistema completo en laboratorio aislado

Usar una máquina de laboratorio dedicada, sin volúmenes de cliente y con los puertos
3000, 1883 y los puertos del Compose disponibles. El perfil incluye credenciales
sintéticas públicas; jamás desplegarlo como FIELD. `up` crea un entorno nuevo.

```bash
export COMPOSE_PROJECT_NAME="uat-$(date -u +%Y%m%d%H%M%S)"
dc() {
  docker compose --env-file infra/integration/integration.env \
    -f docker-compose.telemetry.yml -f docker-compose.integration.yml "$@"
}
dc config --quiet
dc config --services
dc up -d --build
dc ps
dc logs --tail=80 integration-bootstrap
curl --fail http://127.0.0.1:3000/login >/dev/null
curl --fail http://127.0.0.1:3000/api/health
```

Esperar bootstrap terminado con exit 0; Site Mapper y dependencias saludables;
`mqtt.subscribed`, `snmp.poll.accepted` en los tres colectores y
`trap.delivery.committed`. El workflow W-STACK contiene las aserciones exactas de
seed v12, 74 breakers, ratings A/B, geometría, MQTT, SNMP y traps en Mongo/Timescale.
No aceptar sólo un HTTP 200 como prueba de todo el stack.

```bash
dc exec -T mongodb mongosh --quiet seed-01 --eval \
  'print(db.runtime_seed_state.findOne({_id:"seed-01"}).version); print(db.topology_nodes.countDocuments({kind:"EQUIPMENT",equipmentType:"CIRCUIT_BREAKER",lifecycle:"ACTIVE"}));'
dc exec -T timescaledb psql -U site_mapper -d site_mapper_telemetry -c \
  'SELECT count(*) FROM telemetry_samples; SELECT count(*) FROM telemetry_entity_samples; SELECT count(*) FROM industrial_observations;'
bash scripts/ci/uat-full-stack-evidence.sh --isolated-lab
```

El script reinicia exclusivamente la aplicación del proyecto `uat-*`, verifica cambio
de StartedAt, conservación de topología y de histórico; pausa escritores sintéticos,
crea dumps temporales, verifica checksums y restaura a contenedores nuevos. Exige
paridad exacta de conteos de topología y `telemetry_samples`. Finalmente reanuda el
stack. No acredita por sí solo igualdad de cada fila, recuperación de claves MFA,
CA, NTP ni reinicio del host. Los dumps no se publican.

Conservar `artifacts/uat-lab/`: SHA real, servicios, IDs de imágenes, health y log de
recuperación. En laboratorio local, detener con `dc stop`; los volúmenes permanecen.
El cleanup con borrado de volúmenes del workflow sólo corresponde al runner nuevo y
efímero, nunca a TFARM04 ni al procedimiento del cliente.

## 5. Reproducir HTTP de alarmas y navegador

En un terminal de laboratorio dedicado:

```bash
export LOCAL_ADMIN_EMAIL=alarm-ci@local.test
export LOCAL_ADMIN_PASSWORD='Alarm-CI-Local-Only!2026'
export LOCAL_ADMIN_NAME='UAT Laboratory Operator'
npm run local:dev -- --no-open
```

Esperar **Site Mapper local demo is ready.**, no sólo `/api/health`: health puede
responder antes de que el usuario y los datos existan. En otro terminal, con las
mismas variables de prueba:

```bash
node scripts/ci/alarm-rule-manager-http-smoke.mjs
npm install --prefix /tmp/uat-playwright --no-save --no-audit --no-fund playwright@1.55.0
/tmp/uat-playwright/node_modules/.bin/playwright install --with-deps chromium
NODE_PATH=/tmp/uat-playwright/node_modules node scripts/ci/alarm-rule-manager-browser.cjs
NODE_PATH=/tmp/uat-playwright/node_modules node scripts/visual-capture.mjs
NODE_PATH=/tmp/uat-playwright/node_modules node scripts/ci/uat-power-trace-browser.mjs
```

HTTP exige 14 checks: no autenticado, login, UI/API, catálogo, targets, DRAFT,
CSRF, confirmación, PUBLISH, conservación de publicado, revisión obsoleta,
DISABLE con audit y breaker inválido. Capturas solas no prueban comportamiento.

## 6. Matriz completa de los 33 UAT

Esta tabla especifica cobertura y cierre pendiente; no sustituye resultados ni firmas.
Ejecutar además el procedimiento completo del plan enlazado. En el acta registrar
observado, esperado, SHA/imagen, timestamp, operador y evidencia por cada fila.

| Caso    | Evidencia técnica reproducible                          | Corroboración adicional para PASS formal                                       |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| UAT-001 | W-STACK: SHA checkout e IDs de imágenes                 | Inventario de release instalada y acta; mismo SHA que el cliente               |
| UAT-002 | Perfil integration sintético, proyecto uat-*            | Propietario, alcance autorizado y destino privado de evidencia                 |
| UAT-101 | T-AUTH: reloj controlado, idle/absoluta/revocación      | Observar 30 min y 8 h y rechazo servidor en la release instalada               |
| UAT-102 | T-AUTH: enrolamiento, OTP/recovery de un uso            | Viaje completo de operador offline y recuperación administrativa               |
| UAT-103 | T-AUTH: política/denylist/throttle                      | Captura de egress aprobada, modo local y no dependencia WAN                    |
| UAT-104 | W-SEC, W-HTTP, W-ALARM                                  | Matriz de perfiles y objetos instalada; resultados HTTP y auditoría            |
| UAT-105 | T-AUTH y W-LAN sólo evidencia parcial                   | Navegador LAN, CA/TLS/HSTS/cookie y activos sin WAN                            |
| UAT-106 | T-AUTH: credenciales OT y reautenticación               | Revelado de credencial sintética con/sin reauth y throttle; redactar secretos  |
| UAT-107 | T-AUTH prueba cifrado, no custodia de clave             | Clon con MFA key/CA persistentes, NTP LAN y reinicio aprobado                  |
| UAT-201 | W-ALARM: DRAFT/PUBLISH/409 Mongo y HTTP                 | Revisión de impacto y acta del operador                                        |
| UAT-202 | T-ALARM y W-ALARM: precedencia/especificidad/legado     | Tabla de política efectiva de scopes aceptados                                 |
| UAT-203 | T-ALARM: referencia DC-48V sin activación implícita     | Ficha eléctrica de umbrales aprobada por ingeniería                            |
| UAT-204 | T-ALARM: V/A/P/E y correlación                          | Inyección temporal controlada, capturas Alarm Center y eventos                 |
| UAT-205 | T-ALARM, W-CHAOS: stale/replay/outage                   | Secuencia completa LOAD_LOSS/expectedLoad y comportamiento tras reinicio       |
| UAT-206 | W-ALARM: DISABLE y auditoría                            | Corroborar preservación de incidencias y rollback de política                  |
| UAT-207 | W-ALARM: confirmación, permisos y concurrencia          | Matriz final de perfiles del cliente                                           |
| UAT-301 | W-STACK: servicio ausente de Compose                    | Revisar manifiesto instalado aprobado                                          |
| UAT-302 | Sin ejecución FIELD en esta campaña                     | Inspección de contenedores existentes/puerto 3100; no detenerlos               |
| UAT-303 | W-STACK y W-HTTP: servicios y conservación              | Comparación antes/después en clon del appliance con sus datos autorizados      |
| UAT-401 | T-TRACE y W-VISUAL: Device/Equipment, ventana real      | Abrir desde Device/Equipment/Power, ventana independiente y matriz permisos    |
| UAT-402 | T-TRACE usa fixtures A/B                                | Conciliar A3 y puertos con As-Built eléctrico; no inferir independencia física |
| UAT-403 | T-TRACE: rutas ausentes/múltiples y fuentes             | Corroborar avisos visibles y no invención de enlaces en UI                     |
| UAT-404 | T-TRACE y tests de frescura                             | Capturas por breaker LIVE/STALE/OFFLINE/CLOCK SKEW                             |
| UAT-405 | W-VISUAL: viewports y handlers Print/PDF de Rastreo     | Viewports 1440/1366/1024, zoom, Print/PDF legible y descarga                   |
| UAT-406 | W-VISUAL: referencias Excel no vinculadas y advertencia | Excel aprobado: sólo declarativo hasta conciliación; captura de advertencia    |
| UAT-501 | T-GOLD y W-HTTP: topología/CAS/power/browser/restart    | Golden path completo con deep links, logout/login y recarga del cliente        |
| UAT-502 | W-STACK, W-HTTP, MQTT/Modbus/SNMP suites                | Comparar contra fuentes comisionadas; registrar parámetros de protocolo        |
| UAT-503 | T-QDF, W-HTTP y W-STACK                                 | Aislamiento QDF con valores distinguibles y procedencia LAB/FIELD              |
| UAT-504 | W-STACK reinicio app; W-CHAOS fallos de procesos        | Reboot del host clonado, auto-start y recuperación integral                    |
| UAT-505 | W-STACK restore aislado con paridad de conteos          | Restore del backup autorizado, revisión de datos/keys/roles/RPO/RTO            |
| UAT-601 | No ejecutado, FIELD/SAT                                 | Ingeniería eléctrica verifica A/B y señal/medición física                      |
| UAT-602 | Modbus LAB cubierto; Metasys FIELD no ejecutado         | Cliente integra Metasys, offset/word order, ACL y firewall OT                  |
| UAT-603 | W-LAN sólo sintaxis                                     | Operación real sin WAN, CA/NTP, reinicio y claves bajo custodia                |

## 7. Matriz de los 18 ACC contractuales

| Caso    | Reproducción técnica                     | Evidencia adicional / frontera                                           |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| ACC-001 | W-STACK y sección 1                      | Completar identidad instalada y configuración revisada                   |
| ACC-002 | W-HTTP, W-VISUAL                         | Acceso desde estación del cliente e Inspector/Workbench                  |
| ACC-003 | T-QDF, W-HTTP                            | Breaker comisionado: V/A/kW/kWh UI/API/histórico por binding             |
| ACC-004 | T-QDF current                            | Entradas FIELD completas; prueba negativa sin suma parcial               |
| ACC-005 | T-QDF voltage                            | Tolerancia aprobada, ambos buses coherentes; nunca sumar voltajes        |
| ACC-006 | T-QDF power                              | Pares V/I completos, kW y misma serie en Load Report                     |
| ACC-007 | T-QDF energy                             | kWh WINDOW y cobertura; no contador lifetime ni relleno con cero         |
| ACC-008 | T-QDF load-report                        | Abrir Workbench, ventanas, CSV, impresión/PDF y comparación API          |
| ACC-009 | T-QDF, W-CHAOS                           | Capturas antes/después, calidad y recuperación sin inventar datos        |
| ACC-010 | W-HTTP y W-STACK                         | Histórico y timestamps de la muestra antes/después                       |
| ACC-011 | W-HTTP, T-QDF                            | Dos fuentes/QDF distinguibles, IDs/breakers/Modbus aislados              |
| ACC-012 | W-HTTP y W-SEC                           | Perfil autorizado y no autorizado, exportaciones sin secretos            |
| ACC-013 | W-HTTP y modbus-tcp.yml                  | FC03, FLOAT32, orden, límites, Unit ID y política stale; sólo LAB        |
| ACC-014 | No ejecutado, FIELD                      | Metasys nativo y representante OT                                        |
| ACC-015 | No ejecutado, hardware                   | Display físico y comparación de fuente/timestamp                         |
| ACC-016 | Fuera de software                        | Instalación/capacidad eléctrica por responsable SAT                      |
| ACC-017 | No ejecutado, cliente                    | As-Built y bindings/mapeo/planos aprobados                               |
| ACC-018 | Este expediente aporta evidencia técnica | Sin FAIL software; pendientes con dueño; firmas y certificado de alcance |

## 8. Disposición y siguiente puerta

Mantener sin falsos PASS los registros formales 04 y 11. Adjuntar el informe de runs
con SHA, URL, resultado, jobs y artefactos; conservar fallos iniciales y retests.
El cliente puede reproducir las suites, contrastar capturas y firmar cada procedimiento
sobre su release instalada. Seguridad/OT e ingeniería eléctrica cierran sus fronteras.

La campaña no elimina ramas ni despliega TFARM04. Tras revisar el GREEN técnico y los
pendientes UAT, inventariar ramas mergeadas/no mergeadas y PRs, conservar referencias de
release y recuperación, y preparar por separado housekeeping y actualización de TFARM04.
