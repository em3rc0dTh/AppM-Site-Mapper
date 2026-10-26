# Site Mapper MK1 — Catálogo maestro de flujos v2

**Fecha:** 26/10/2026 · **Rama revisada:** `feat/mk1-in-app-help-manual-2026-10-26` · **Estado:** diseño y trazabilidad, no certificación en el navegador ni habilitación de funciones. 

**Respuesta de alcance:** reemplaza la visión parcial de los 16 flujos de `help-workflow-contract-v1.md`. Cubre topología, planos, Rack/CAS, Warehouse, Device/Equipment, breakers, puertos, PowerPath, commissioning MQTT y SNMP, ingesta de datos, series, señales, alarmas, Modbus, consola, usuarios y operación. Es un **inventario de candidatos**, no 100% de procesos aprobados. La revisión de cada botón y variante aún es necesaria.

## Reglas para convertir workflows en Help Center

1. **UI:** el usuario dispone de un control identificable dentro de Site Mapper; documentar la pantalla, el clic, el resultado y la recuperación después de validar en el navegador.
2. **API:** existe endpoint, pero no debe suponerse que el usuario dispone de un botón.
3. **OPS:** trabajo de integrador/admin técnico en archivo de entorno, script, gateway o contenedor; no convertirlo en tutorial para usuario Standard.
4. **MIXTO:** el usuario consulta el estado; un técnico configura o corrige la fuente.
5. **DISEÑO:** no es función lista; no publicarla como si estuviera disponible.
6. Los cambios peligrosos deben registrar rol, prerrequisitos, dependencies, confirmación, concurrencia, auditoría, reversibilidad y ejemplos de fallo.
7. **Eliminar** no es sinónimo de archivar. La topología conserva ACTIVE/ARCHIVED; hard delete no es acción de uso normal. Solo retirar una entidad sin dependencias suficientes, sin cascadas automáticas.

**Matriz de cobertura:**

| Grupo | Área | Ubicación de fuente | Flujos |
| --- | --- | --- | ---: |
| ACC | Acceso y cuentas | `src/app/api/auth, src/app/settings, src/components/settings` | 11 |
| NAV | Workspace y búsqueda | `src/app/workspace, src/components/workspace, src/shared/ui/command-palette` | 9 |
| TOP | Jerarquía y ciclo de vida | `src/app/api/topology, src/modules/topology, src/components/topology` | 16 |
| MAP | Editor de límites y Blueprint | `src/components/spatial, src/components/blueprint, src/modules/spatial` | 16 |
| RACK | Rack y CAS | `src/app/rack, src/components/rack, src/modules/rack` | 8 |
| WH | Warehouse y plantillas | `src/app/warehouse, src/components/warehouse, src/modules/warehouse` | 9 |
| EQ | BDFB, Device, Equipment y breakers | `src/app/device, src/components/equipment, src/modules/topology` | 14 |
| PORT | Access Ports e input físico | `src/components/equipment/access-port-editor.tsx, src/app/api/equipment` | 8 |
| PWR | PowerPath y alimentación | `src/app/power, src/components/power, src/modules/power` | 10 |
| MQTT | Broker, mapping y breaker MQTT | `src/components/telemetry/panel-commissioning.tsx, src/app/api/telemetry/panel-commissioning, src/modules/telemetry` | 13 |
| SNMP | SNMP BDFB y OIDs DC | `src/components/equipment/access-port-editor.tsx, src/components/power/snmp-feed-commissioning.tsx, src/app/api/telemetry/snmp, infra/snmp-collector` | 17 |
| HIST | Lecturas, tendencias e históricos | `src/components/telemetry, src/app/api/telemetry, infra/telemetry-store` | 11 |
| IND | Integración industrial, alarmas y señales | `src/app/api/telemetry/industrial, src/modules/telemetry/infrastructure/industrial, docs/telemetry/industrial-integration.md` | 14 |
| MOD | Modbus, registros y BMS | `infra/modbus-tcp, docs/telemetry/modbus-tcp-output.md, docs/telemetry/industrial-integration.md` | 9 |
| OPS | Consola y mantenimiento | `infra/operational-console, docker-compose.telemetry.yml, docs/operations` | 12 |

**Total:** 177 flujos candidatos en 15 áreas. Los candidatos OPS, API o diseño no son botones operativos.

## Inventario funcional por área

### ACC — Acceso y cuentas

Evidencia inicial: `src/app/api/auth, src/app/settings, src/components/settings`.

- **WF-ACC-01** · Entrar con cuenta autorizada.
- **WF-ACC-02** · Cambiar contraseña temporal y reingresar.
- **WF-ACC-03** · Cerrar sesión.
- **WF-ACC-04** · Actualizar contraseña propia.
- **WF-ACC-05** · Cambiar nombre de perfil.
- **WF-ACC-06** · Cambiar idioma ES/EN.
- **WF-ACC-07** · Ver información de sistema permitida.
- **WF-ACC-08** · Crear usuario (SUPERADMIN).
- **WF-ACC-09** · Modificar rol de usuario (SUPERADMIN).
- **WF-ACC-10** · Archivar o reactivar usuario (SUPERADMIN).
- **WF-ACC-11** · Recuperación de cuenta bloqueada (diseñar procedimiento).

### NAV — Workspace y búsqueda

Evidencia inicial: `src/app/workspace, src/components/workspace, src/shared/ui/command-palette`.

- **WF-NAV-01** · Abrir Workspace y reconocer áreas.
- **WF-NAV-02** · Recorrer árbol Network→Equipment.
- **WF-NAV-03** · Buscar entidad por nombre/serial.
- **WF-NAV-04** · Abrir ficha desde contexto.
- **WF-NAV-05** · Fijar o quitar favorito de Device/Equipment.
- **WF-NAV-06** · Interpretar BDFB Power Overview.
- **WF-NAV-07** · Revisar avisos de configuración.
- **WF-NAV-08** · Abrir ayuda contextual.
- **WF-NAV-09** · Alternar modo consulta/edición.

### TOP — Jerarquía y ciclo de vida

Evidencia inicial: `src/app/api/topology, src/modules/topology, src/components/topology`.

- **WF-TOP-01** · Crear Network.
- **WF-TOP-02** · Crear Site bajo Network.
- **WF-TOP-03** · Crear Structure bajo Site.
- **WF-TOP-04** · Crear Level bajo Structure.
- **WF-TOP-05** · Crear Room/Substructure.
- **WF-TOP-06** · Crear Bay/Cluster.
- **WF-TOP-07** · Crear Position.
- **WF-TOP-08** · Crear Rack/Container.
- **WF-TOP-09** · Consultar identidad y jerarquía.
- **WF-TOP-10** · Editar datos permitidos de entidad.
- **WF-TOP-11** · Mover Rack/Device/Equipment (parcial).
- **WF-TOP-12** · Archivar entidad sin hijos (API; UI general pendiente).
- **WF-TOP-13** · Restaurar entidad archivada (API; UI general pendiente).
- **WF-TOP-14** · Bloqueo con hijos o referencias (revisar dependencias).
- **WF-TOP-15** · Lista Archivadas con búsqueda y restauración (diseñar).
- **WF-TOP-16** · Hard delete físico (FUERA del flujo normal).

### MAP — Editor de límites y Blueprint

Evidencia inicial: `src/components/spatial, src/components/blueprint, src/modules/spatial`.

- **WF-MAP-01** · Dibujar polígono válido de 3 a 256 vértices.
- **WF-MAP-02** · Cerrar polígono o cancelar.
- **WF-MAP-03** · Añadir vértice en segmento.
- **WF-MAP-04** · Mover vértice del contorno.
- **WF-MAP-05** · Quitar vértice manteniendo 3 como mínimo.
- **WF-MAP-06** · Deshacer, limpiar, encajar en cuadrícula, zoom y pan.
- **WF-MAP-07** · Editar límite de Site con versión.
- **WF-MAP-08** · Editar Structure dentro del Site.
- **WF-MAP-09** · Abrir Blueprint → EDIT ROOM.
- **WF-MAP-10** · Dibujar Bay/Cluster.
- **WF-MAP-11** · Colocar Position.
- **WF-MAP-12** · Colocar Rack con dimensiones.
- **WF-MAP-13** · Mover Rack en borrador.
- **WF-MAP-14** · Remove selected de Bay/Position/Rack (restricciones).
- **WF-MAP-15** · SAVE LAYOUT / conflictos de concurrencia.
- **WF-MAP-16** · Importar/exportar Layout con permisos.

### RACK — Rack y CAS

Evidencia inicial: `src/app/rack, src/components/rack, src/modules/rack`.

- **WF-RACK-01** · Consultar Rack Elevation y total U.
- **WF-RACK-02** · Leer espacios AVAILABLE/RESERVED/EQUIPPED.
- **WF-RACK-03** · Reservar U.
- **WF-RACK-04** · Montar objeto compatible en U.
- **WF-RACK-05** · Liberar reserva o desmontaje autorizado.
- **WF-RACK-06** · Corregir intervalo ocupado o inválido.
- **WF-RACK-07** · Distinguir rack U y slot breaker.
- **WF-RACK-08** · Bloquear retiro de Rack ocupado.

### WH — Warehouse y plantillas

Evidencia inicial: `src/app/warehouse, src/components/warehouse, src/modules/warehouse`.

- **WF-WH-01** · Consultar catálogo de templates.
- **WF-WH-02** · Crear template por formulario.
- **WF-WH-03** · Importar JSON válido.
- **WF-WH-04** · Definir tipo/atributos/capacidad.
- **WF-WH-05** · Definir tipos hijos compatibles.
- **WF-WH-06** · Instanciar plantilla en Rack.
- **WF-WH-07** · Instanciar Equipment en composición.
- **WF-WH-08** · Crear componente ONE-OFF.
- **WF-WH-09** · Archivar/versionar template (por verificar).

### EQ — BDFB, Device, Equipment y breakers

Evidencia inicial: `src/app/device, src/components/equipment, src/modules/topology`.

- **WF-EQ-01** · Crear Device dentro de Rack.
- **WF-EQ-02** · Abrir BDFB PHYSICAL VIEW.
- **WF-EQ-03** · Crear Chassis/Shelf/Frame/Panel.
- **WF-EQ-04** · Configurar DYNAMIC o POSITIONAL.
- **WF-EQ-05** · Crear Panel de 24 posiciones.
- **WF-EQ-06** · Instalar CIRCUIT_BREAKER en slot libre.
- **WF-EQ-07** · Consultar slots AVAILABLE y OCCUPIED.
- **WF-EQ-08** · Mover breaker entre posiciones permitidas.
- **WF-EQ-09** · Separar Equipment de su padre.
- **WF-EQ-10** · Cambiar presentación/prefix y parámetros de Equipment.
- **WF-EQ-11** · Archivar Equipment hoja desde UI.
- **WF-EQ-12** · Restaurar Equipment compatible desde UI.
- **WF-EQ-13** · Evitar cambio de serial/mapping sin revisión.
- **WF-EQ-14** · Bloquear retiro de breaker con conexiones/lecturas (diseñar).

### PORT — Access Ports e input físico

Evidencia inicial: `src/components/equipment/access-port-editor.tsx, src/app/api/equipment`.

- **WF-PORT-01** · Consultar terminales y direcciones.
- **WF-PORT-02** · Crear terminal POWER/NETWORK/CONTROL/DATA.
- **WF-PORT-03** · Editar terminal permitido.
- **WF-PORT-04** · Archivar terminal, preservando referencias.
- **WF-PORT-05** · Crear DC input POWER INPUT EXTERNAL.
- **WF-PORT-06** · Asignar Feed, posición y paneles servidos.
- **WF-PORT-07** · Confirmar independencia y ratings shunt.
- **WF-PORT-08** · Detectar y bloquear vínculo duplicado.

### PWR — PowerPath y alimentación

Evidencia inicial: `src/app/power, src/components/power, src/modules/power`.

- **WF-PWR-01** · Ver puertos CONNECTED/libres.
- **WF-PWR-02** · Seleccionar POWER OUTPUT→POWER INPUT.
- **WF-PWR-03** · Confirmar Feed A/B y conexión.
- **WF-PWR-04** · Ver VIEW POWERPATH desde ambos extremos.
- **WF-PWR-05** · Consultar FULL POWER TRACE.
- **WF-PWR-06** · Interpretar A/B y redundancia.
- **WF-PWR-07** · Editar Power Contract de Device.
- **WF-PWR-08** · Archivar PowerPath (DELETE lógico en API; botón por verificar).
- **WF-PWR-09** · Bloquear SOURCE/TARGET_ALREADY_CONNECTED.
- **WF-PWR-10** · Tratar dependencias eléctricas antes de retirar Equipment.

### MQTT — Broker, mapping y breaker MQTT

Evidencia inicial: `src/components/telemetry/panel-commissioning.tsx, src/app/api/telemetry/panel-commissioning, src/modules/telemetry`.

- **WF-MQTT-01** · Configurar broker MQTT/secretos/topics (OPS).
- **WF-MQTT-02** · Identificar source/serial real del Panel.
- **WF-MQTT-03** · Configurar MQTT point prefix.
- **WF-MQTT-04** · Elegir breaker instalado de Panel.
- **WF-MQTT-05** · Previsualizar raw point por slot.
- **WF-MQTT-06** · Confirmar correspondencia física point→breaker.
- **WF-MQTT-07** · Comisionar VOLTAGE/CURRENT/POWER/ENERGY (4/4).
- **WF-MQTT-08** · Revisar mapping y conflictos.
- **WF-MQTT-09** · Retirar SOURCE binding antiguo mediante acción especializada.
- **WF-MQTT-10** · Recibir/normalizar publicaciones (OPS).
- **WF-MQTT-11** · Ver LIVE con source/point/timestamp.
- **WF-MQTT-12** · Resolver STALE/OFFLINE/bindings (mixto).
- **WF-MQTT-13** · Migrar publisher sin perder referencia histórica (diseñar).

### SNMP — SNMP BDFB y OIDs DC

Evidencia inicial: `src/components/equipment/access-port-editor.tsx, src/components/power/snmp-feed-commissioning.tsx, src/app/api/telemetry/snmp, infra/snmp-collector`.

- **WF-SNMP-01** · Elegir perfil físico real Config2/Config4.
- **WF-SNMP-02** · Cambiar perfil solo si no hay mappings SNMP activos.
- **WF-SNMP-03** · Crear entradas A/B o A1/A2/B1/B2.
- **WF-SNMP-04** · Asignar paneles servidos por entrada.
- **WF-SNMP-05** · Confirmar independencia y características del shunt.
- **WF-SNMP-06** · Indicar sourceIdentity/controlador.
- **WF-SNMP-07** · Asignar OID de CURRENT.
- **WF-SNMP-08** · Asignar OID de VOLTAGE.
- **WF-SNMP-09** · Guardar puerto y bindings separados.
- **WF-SNMP-10** · Recuperar guardado parcial sin crear puerto duplicado.
- **WF-SNMP-11** · Revisar bindings de input.
- **WF-SNMP-12** · Retirar mapping OID con confirmación.
- **WF-SNMP-13** · Configurar SNMPv3/IP/credenciales privadas (OPS).
- **WF-SNMP-14** · Activar colector GET, OIDs e intervalos (OPS).
- **WF-SNMP-15** · Consultar Inputs y estados de lectura.
- **WF-SNMP-16** · Ver tendencia SNMP en Charts 24h/7d/15d/1M.
- **WF-SNMP-17** · Distinguir SIMULATED LAB de FIELD.

### HIST — Lecturas, tendencias e históricos

Evidencia inicial: `src/components/telemetry, src/app/api/telemetry, infra/telemetry-store`.

- **WF-HIST-01** · Consultar lectura LIVE propia de breaker.
- **WF-HIST-02** · Consultar LIVE agregado BDFB.
- **WF-HIST-03** · Cambiar PHYSICAL/TELEMETRY Lens.
- **WF-HIST-04** · Consultar historial de Equipment.
- **WF-HIST-05** · Consultar historia de componentes.
- **WF-HIST-06** · Consultar histórico SNMP por input.
- **WF-HIST-07** · Explicar LIVE/STALE/NO DATA/UNMAPPED/OFFLINE.
- **WF-HIST-08** · Separar almacenaje no disponible de falta de muestra.
- **WF-HIST-09** · Distinguir potencia/energía calculada de sensor.
- **WF-HIST-10** · Diagnosticar ingest/historia (OPS).
- **WF-HIST-11** · Ver fuente, unidad, timestamp y calidad.

### IND — Integración industrial, alarmas y señales

Evidencia inicial: `src/app/api/telemetry/industrial, src/modules/telemetry/infrastructure/industrial, docs/telemetry/industrial-integration.md`.

- **WF-IND-01** · Autorizar fuente MQTT/SNMP industrial (OPS).
- **WF-IND-02** · Capturar original con procedencia (OPS).
- **WF-IND-03** · Normalizar valor/clave/unidad/escala (OPS).
- **WF-IND-04** · Comisionar source transport y target lógico (OPS).
- **WF-IND-05** · Versionar aliases e identidad lógica (OPS).
- **WF-IND-06** · Consultar señales por Equipment/target.
- **WF-IND-07** · Consultar originales de eventos (API).
- **WF-IND-08** · Consultar series por signalId/logicalPointId.
- **WF-IND-09** · Gestionar Traps/Informs/GET/GETNEXT/GETBULK (OPS).
- **WF-IND-10** · Interpretar alarma ACTIVE/RESOLVED.
- **WF-IND-11** · Correlacionar señales sin atribuir causalidad (API).
- **WF-IND-12** · Ver estado de outbox, lag y fallos de entrega (OPS).
- **WF-IND-13** · Migrar fuente manteniendo identidad lógica (OPS).
- **WF-IND-14** · Interpretar UNKNOWN/INVALID/STALE/OFFLINE.

### MOD — Modbus, registros y BMS

Evidencia inicial: `infra/modbus-tcp, docs/telemetry/modbus-tcp-output.md, docs/telemetry/industrial-integration.md`.

- **WF-MOD-01** · Comisionar source→Unit ID (OPS).
- **WF-MOD-02** · Comisionar dirección de registro y quality (OPS).
- **WF-MOD-03** · Leer FC03 Modbus TCP (OPS).
- **WF-MOD-04** · Validar FLOAT32/endian y offsets (OPS).
- **WF-MOD-05** · Diferenciar calidad VALID/STALE/UNKNOWN y cero (OPS).
- **WF-MOD-06** · Mantener offsets al ampliar registry (OPS).
- **WF-MOD-07** · Exportar mapa CSV a integrador Metasys (OPS).
- **WF-MOD-08** · Verificar firewall/red OT y contrato de tercero (OPS).
- **WF-MOD-09** · Consultar estado de publicación industrial (API).

### OPS — Consola y mantenimiento

Evidencia inicial: `infra/operational-console, docker-compose.telemetry.yml, docs/operations`.

- **WF-OPS-01** · Entrar a Operational Console.
- **WF-OPS-02** · Consultar inventario/Power/bindings/telemetry en tablas.
- **WF-OPS-03** · Filtrar y exportar CSV.
- **WF-OPS-04** · Crear entidades admitidas desde consola (no polígonos).
- **WF-OPS-05** · Inspeccionar datos con Next.js sin servicio (limitado).
- **WF-OPS-06** · Encender/parar laboratorio sintético (OPS).
- **WF-OPS-07** · Ver salud broker/Mongo/Timescale/collector/Modbus (OPS).
- **WF-OPS-08** · Auditar datos de laboratorio y fuentes (OPS).
- **WF-OPS-09** · Backup/restore autorizado (OPS).
- **WF-OPS-10** · Investigar fallos sin destruir volúmenes (OPS).
- **WF-OPS-11** · Certificar extremo a extremo antes de producción (pendiente).
- **WF-OPS-12** · Mantener contraseñas/permisos sin reset público.

## Gate de cada workflow

La ficha definitiva debe incluir **nombre de usuario**, rol, pantalla/ruta, entidad padre, precondiciones, campos obligatorios, recorrido de botones, validación de datos, confirmación, respuesta esperada, bloqueos, mensajes entendibles, recuperación, efectos en otros subsistemas, evidencia UI/API y el idioma EN/ES. Nada se enseña al usuario sin haber cotejado esas condiciones con una sesión real.

## Orden prioritario de especificación detallada

1. Crear/editar/archivar/restaurar Site, Structure, Room, Rack, Device, Equipment y breaker, validando hijos y vínculos.
2. Modelar BDFB/Panel/breaker y la asignación física de slots.
3. Crear Access Port e input DC; aplicar Config2/Config4; commissioning OIDs SNMP y recuperación parcial.
4. Verificar serial, MQTT point prefix y punto real; commission V/A/W/kWh por breaker.
5. Crear/archivar conexiones PowerPath y seguir Feed A/B.
6. Consultar LIVE e históricos, estados, calidad y procedencia; separar MQTT de SNMP.
7. Documentar configuración de broker/colector/traps, fuentes lógicas, señales y Modbus solo para responsables técnicos.
8. Cubrir Warehouse, permisos, Workspace, consola, importación/exportación y resolución de incidencias.

**Siguiente documento:** `help-workflows-industrial-detail-v2.md` desarrolla pasos, dependencias y recuperación de las tareas críticas de breakers, SNMP, MQTT, datos, PowerPath, señales y Modbus.
