# Site Mapper MK1 — Flujos industriales y dependencias v2

**Estado:** contrato de análisis para aprobación de producto. Basado en componentes y rutas de la rama de Help Center revisada el 26/10/2026. No se han comisionado dispositivos reales, alterado mappings, ejecutado servicios ni verificado los flujos en navegador.

**Advertencia sobre alcance:** estos flujos no deben entrar literalmente al Help Center. El Help Center describe tareas de usuario con frases simples; este documento contiene prerrequisitos de ingeniería, integridad, permisos, interfaces técnicas y controles de aceptación.

## 1. El orden importa: primero inventario físico, luego conectividad y datos

| Capa              | Qué se configura                                           | Qué habilita                                 | Qué NO hace                       |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------- | --------------------------------- |
| 1 · Ubicación     | Network, Site, Structure, Level, Room, Bay, Position, Rack | Localizar el Device                          | No crea circuitos ni lecturas     |
| 2 · Equipo        | Device BDFB → Chassis → Shelf → Frame → Panel → Breaker    | Identidad del componente y slot ocupado      | No verifica cableado              |
| 3 · Energía       | Access Ports POWER y PowerPaths                            | Rutas Feed A/B registradas                   | No certifica corriente real       |
| 4 · MQTT          | Serial/fuente del Panel, prefijo y posición de breaker     | Candidato a raw point y 4 bindings V/A/W/kWh | Mapping no implica LIVE           |
| 5 · SNMP          | Perfil BDFB, inputs externos, shunt, paneles, fuente/OIDs  | Bindings CURRENT/VOLTAGE por input físico    | No conecta automáticamente SNMPv3 |
| 6 · Ingesta       | Broker MQTT / colector SNMP / traps-informs, credenciales  | Paquetes autorizados y normalizados          | No inventa Equipment ni binding   |
| 7 · Presentación  | Latest state, quality, charts, Timescale                   | LIVE, STALE, historial y diagnóstico         | Histórico no significa LIVE       |
| 8 · Publicación   | Identidad lógica, manifest, Unit ID/offset/quality Modbus  | Registros de salida para tercero             | No certifica conexión Metasys     |
| 9 · Mantenimiento | Archive/restore, retire binding, ports y paths             | Estado gestionable con trazabilidad          | No cascada ni hard delete         |

**Regla transversal:** que un equipo exista, un punto esté comisionado y un valor llegue en vivo son **tres resultados independientes**.

## 2. WF-EQ-05/06 — Crear Panel y colocar breaker

**Evidencia:** \`src/components/equipment/equipment-composition-editor.tsx\`, \`src/app/api/topology/route.ts\`, \`src/modules/topology/application/topology-service.ts\`.

**Persona:** ADMIN/SUPERADMIN para cambiar el inventario; STANDARD puede observar.

**Precondiciones:** Rack y Device correctos; Equipment padre activo y apto; capacidad compatible; serial propio no duplicado si se proporciona.

**Secuencia de trabajo:**

1. EXPLORE → Network → Site → Structure → Level → Room → Rack → Device.
2. Abrir PHYSICAL COMPOSITION de Device/Equipment.
3. Elegir **+ ADD EQUIPMENT**, con FROM WAREHOUSE o ONE-OFF, según compatibilidad.
4. Definir PANEL, POSITIONAL y capacidad (ejemplo: 24); guardar y reabrir.
5. Abrir INTERNAL COMPOSITION / MANAGE POSITIONS del Panel.
6. Elegir **POSITION 01 · AVAILABLE** y crear **CIRCUIT_BREAKER** en ese slot concreto.
7. Verificar POSITION 01 OCCUPIED y las demás posiciones disponibles. No crear breakers ficticios para llenar el panel.
8. Revisar sus terminales físicos si el modelo los crea; no asumir conexión eléctrica.

**Bloqueos:** tipo hijo no permitido, slot ocupado, capacidad, serial duplicado, padre archivado.

**Criterio de éxito:** el breaker instalado tiene ID propio, padre Panel correcto y slot inequívoco tras actualizar la página.

**Cambios futuros/retirada:** retirar breaker debe comprobar si mantiene Access Ports conectados, vínculos MQTT/industriales, vínculos eléctricos e historial que se deba preservar. La API de archive actual no demuestra ese preflight completo. No automatizar una cascada.

## 3. WF-MQTT-02..09 — Asignar datos MQTT al breaker

**Evidencia:** \`src/components/telemetry/panel-commissioning.tsx\` y \`src/app/api/telemetry/panel-commissioning/route.ts\`.

**Dos actores:** operador autorizado que verifica origen físico y realiza el commissioning en el Panel; integrador que configura la conexión al broker fuera del UI.

### Prerrequisitos

- Existe Panel activo de tipo PANEL, modo POSITIONAL, con interruptor Equipment en la posición real.
- El serial del Panel corresponde a la fuente MQTT verificada, no a un identificador supuesto.
- El Panel tiene \`telemetryPointPrefix\` válido.
- Se conoce la regla del publisher y se corroboró que el punto raw de esa posición mide ese circuito.
- La acción de commissioning exige \`topology:write\`. Consultar preview exige \`telemetry:read\`.

### Flujo de usuario

1. Abrir el Equipment del Panel, no el Device general ni otro breaker.
2. Entrar en **MQTT POINT COMMISSIONING**.
3. Leer Source, Prefix, capacidad y la fila de la posición instalada.
4. Verificar que la fila representa el breaker correcto y el raw point que le corresponde; por ejemplo \`0_1_1\` es solo un _ejemplo_ y no prueba ninguna instalación.
5. Comprobar las cuatro métricas: VOLTAGE, CURRENT, POWER, ENERGY.
6. Verificar físicamente la correspondencia; usar la casilla de confirmación explícita.
7. Seleccionar **Confirm and commission point**.
8. Revisar que pase de 0/4 (o parcialmente mapeado) a **4/4 verified mapping**; refrescar commissioning si corresponde.
9. Abrir el breaker y consultar LIVE TELEMETRY. Anotar source, point, hora, unidades y estado.
10. Si no hay LIVE pero 4/4 persiste, investigar recepción MQTT por separado; **no volver a comisionar a ciegas**.

### Estados y bloqueos

- \`PANEL_NOT_COMMISSIONABLE\`: revisar serial, prefijo y composición.
- \`EXISTING_BINDING_CONFLICT\`: otra fuente o breaker reclama el point/metric; no sobrescribir.
- \`CONCURRENT_BINDING_CONFLICT\`: cambios simultáneos; refrescar y cotejar.
- **Retire SOURCE**: la UI ofrece una operación específica para un binding de fuente antiguo, con confirmación. No equivale a eliminar todas las lecturas históricas ni autoriza reasignación masiva.

### Límite

**La configuración del broker MQTT no es un formulario general de "conectar broker" en Site Mapper.** Direcciones, contraseñas, topics, TLS y permisos de la fuente son tareas de instalación/gateway documentadas internamente; no enseñar comandos de producción al usuario estándar.

## 4. WF-SNMP-01..12 — Entradas DC, perfil y OIDs

**Evidencia:** \`src/components/equipment/access-port-editor.tsx\`, \`src/components/power/snmp-feed-commissioning.tsx\`, \`src/app/api/telemetry/snmp/commission/route.ts\`, \`src/app/api/telemetry/snmp/hardware-profile/route.ts\`.

### 4.1 Distinguir perfiles físicos

- **Config2:** entradas A/B independientes, con distribución física específica hacia dos paneles por entrada según el contrato vigente.
- **Config4:** entradas A1/A2/B1/B2; cada entrada sirve al panel confirmado correspondiente. La API valida para Config4 valores específicos del contrato (corriente nominal 800 A, shunt 1000 A, 60 mV), además de Feed y ubicación.
- No cambiar de perfil para arreglar un dato extraño. La API **bloquea cambiar** si aún existen bindings SNMP activos. Primero inspeccionar, autorizar y retirar esos bindings por un flujo controlado.
- Seleccionar Config2 o Config4 exige \`topology:write\` **y** \`power:write\`.

### 4.2 Crear una entrada SNMP con mapeo en la UI

1. Abrir el BDFB Device adecuado y su Equipment con terminales de entrada.
2. Abrir el editor de **ACCESS PORTS**.
3. Crear o editar un terminal **POWER**, dirección **INPUT**, exposición **EXTERNAL**.
4. Marcarlo como entrada SNMP/DC y elegir el Feed/posición física que corresponda al perfil; seleccionar los Panel(es) que alimenta.
5. Indicar corriente nominal, shunt y sobrecarga, siguiendo ficha del equipo instalado. No copiar valores del laboratorio a un controlador real.
6. Marcar **independent input confirmed** únicamente tras comprobar la instalación.
7. Si se dispone de tabla verificada, seleccionar la opción de configurar los OIDs, proporcionar sourceIdentity (controlador), **CURRENT OID** y opcionalmente **VOLTAGE OID**.
8. Confirmar que esos OIDs corresponden a la entrada y a la escala adecuada.
9. Guardar (la acción de UI contempla **save with SNMP**): primero se persiste **Access Port**, después se envían una o dos operaciones de commissioning SNMP.
10. Volver al puerto y consultar sus bindings CURRENT/VOLTAGE, identidad de fuente y OID exacto.
11. Abrir inspector del Device → **Inputs** para comprobar estado. Verificar **Charts** para el histórico después de recibir muestras.
12. Si otro input reclama el OID o falta el hardware mapping, la API debe bloquear sin reasignar automáticamente.

**Control de permisos:** la creación del puerto depende del tipo y de los permisos operativos. Para commissioning SNMP se requieren simultáneamente \`topology:write\` y \`power:write\`. La lectura usa \`telemetry:read\`.

### 4.3 Recuperación de un guardado parcialmente correcto — imprescindible

El editor guarda la definición física del puerto **antes** de comisionar cada OID. Si una de las solicitudes de bindings falla:

1. Mostrar "Se guardó la entrada, pero no se completó la vinculación de sus lecturas", sin llamarlo error total de alta.
2. Conservar el ID del puerto persistido y seguir en modo **editar esa entrada**.
3. Inspeccionar cuáles de CURRENT/VOLTAGE ya quedaron vinculados.
4. Resolver la causa y repetir **solo el binding faltante**, evitando crear otra entrada o duplicar la señal.
5. Confirmar que la vista Inputs refleja la medición correcta.

**No prometer atomicidad de 'puerto + dos OIDs'**: son escrituras distintas.

### 4.4 Mantenimiento

El panel SNMP muestra perfil activo, bindings actuales, identidad y OID; permite cambiar perfil si procede o **retirar binding** con confirmación explícita. Se conserva el historial lógico del registro retirado.

La función de prueba \`/api/dev/snmp-lab/commission\` solo corresponde al laboratorio sintético y no debe incorporarse al Help Center como flujo de clientes.

## 5. WF-SNMP-13..17 — Conexión real al controlador SNMP

**Evidencia:** \`infra/snmp-collector\`, \`docs/telemetry/snmp-feed-ingestion.md\` y \`docs/telemetry/industrial-integration.md\`.

1. El integrador valida dirección de red, versión SNMP, credenciales, firmware/MIB, tabla de OIDs, unidades y escala contra el controlador físico.
2. Configura perfiles privados de colector y credenciales SNMPv3 donde corresponda; no publica secretos en UI ni GitHub.
3. Determina GET/read polling, intervalos y, si aplica, traps/informs con autenticación y origen autorizado. No se ejecuta SNMP SET.
4. Asegura que identidad de source y OIDs sean **exactamente** los aceptados por los inputs comisionados.
5. Arranca/verifica el colector en red autorizada (runbook técnico). Observa ingress/status/quality sin crear activos automáticamente.
6. En Site Mapper el usuario revisa **Inputs** y **Charts**; las fuentes de laboratorio deben permanecer claramente marcadas SIMULATED.
7. Si el input muestra PENDING o no hay datos, comprobar por separado conectividad, escala, hardware profile, commissioning, ingest y store.

**No existe prueba en la rama de un asistente general de UI para configurar la conexión SNMPv3 completa, secretos/IP y colector.** Ese flujo corresponde hoy a operación de integración, no al usuario general.

## 6. WF-HIST — Seteo de datos, lecturas e históricos

**Distinción para el término “seteo de data”:**

| Petición habitual                                | Subsistema                       | Operación real                                                              |
| ------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| "Quiero ver un nuevo breaker"                    | Inventario/Equipment             | Crear e instalar Equipment en slot                                          |
| "Quiero decir a qué breaker pertenece este dato" | MQTT Panel commissioning         | Vincular source+raw point+V/A/W/kWh a breaker                               |
| "Quiero leer el consumo de un input"             | SNMP DC Access Port              | Comisionar OID CURRENT/VOLTAGE al input correcto                            |
| "Quiero recibir valores nuevos"                  | Broker/collector/ingest          | Configurar origen, credenciales, topics/OIDs y transporte en operación      |
| "Quiero pasar de raw a voltios/amperios"         | Perfil industrial                | Regla explícita de interpretación, unidad y escala                          |
| "Quiero conservar y consultar históricos"        | History Store/TimescaleDB        | Persistencia de observaciones aceptadas y consulta de ventanas              |
| "Quiero que se vea en Modbus"                    | Registry + publicación           | Manifest aprobado, identidad lógica, Unit ID, offset y calidad              |
| "Quiero registrar una lectura a mano"            | No consta un flujo general de UI | **No inventarlo.** No confundir datos introducidos a mano con medición real |

### Lecturas en Site Mapper

1. Abrir el Equipment o Device correcto.
2. Elegir **LIVE TELEMETRY / Own readings** o sección equivalente.
3. Leer fuente, valor, unidad, hora observada/recibida y calidad.
4. Seleccionar historial **24H / 7D** y otras ventanas disponibles por módulo. No todas las ventanas aparecen en todas las pantallas.
5. Para BDFB distinguir lecturas **MQTT de breakers** y **SNMP de shunts/entradas**. Sus corrientes/potencias no son intercambiables.
6. Distinguir \`LIVE\`, \`STALE\`, \`NO DATA\`, \`UNMAPPED\`, \`OFFLINE\`, \`UNOBSERVED\`, \`UNKNOWN\`, \`INVALID\`. No reducir todos los casos a "equipo apagado".
7. Si hay historial, pero no LIVE, comprobar freshness/ingest. Si LIVE existe sin Charts, comprobar disponibilidad y envío al store; no borrar ni regenerar datos como reparación.

**Histórico industrial:** existe endpoint \`/api/telemetry/industrial/series\` por \`signalId\` o \`logicalPointId\`, con ventana acotada y cursor. El inspector muestra una vista limitada; consultas extensas están en API, no en un formulario universal de "administración de datos".

## 7. WF-IND — Señales, perfiles, eventos y alarmas

**Evidencia:** \`src/app/api/telemetry/industrial/_\`, \`src/modules/telemetry/infrastructure/industrial/_\`, \`docs/telemetry/industrial-integration.md\`.

1. Registrar una **fuente autorizada** con identidad, token y perfil privado aprobados.
2. Definir reglas exactas por clave/OID, tipo, unidad, escala, offset y destino (cuando verificado). No inferir valores desde nombres de Panel o OID no mapeado.
3. Ingerir la observación MQTT o SNMP, preservar el original y proyectar al catálogo industrial.
4. Distinguir \`targetId\` de inventario, \`logicalPointId\` estable y \`transportSignalId\`; su asociación requiere evidencia aprobada.
5. Mantener un registro de aliases versionado; nueva fuente no debe reasignar identidad histórica.
6. Interpretar traps, informs, GET/GETNEXT/GETBULK bajo perfiles explícitos. Las alarmas confirmadas \`ACTIVE\` no se resuelven por silencio: requieren señal explícita de \`RESOLVED\`.
7. Ver catálogo y calidad, series y eventos originales desde interfaces soportadas. Distinguir correlación por ventana temporal de una relación eléctrica comprobada.
8. Monitorear outbox y retraso/fallo de entrega. Los avisos de persistencia no deben convertirse en ceros falsos.

**Estado de producto:** gran parte de este flujo es backend/API/operación de integración, no un panel completo de edición para Standard. La sección industrial del inspector ofrece consulta limitada y requiere fuente explícitamente vinculada a Equipment.

## 8. WF-MOD — Publicación Modbus TCP y Metasys

**Evidencia:** \`infra/modbus-tcp\`, \`docs/telemetry/modbus-tcp-output.md\`, \`docs/telemetry/industrial-integration.md\`.

1. Aprobar relación de fuente MQTT/SNMP → señal lógica → punto de publicación.
2. Asignar \`Unit ID\` de fuente y dirección de holding register sin reutilizar offsets existentes.
3. Declarar tipo FLOAT32, orden de palabras, calidad y política de dato ausente.
4. Preparar manifest/CSV aprobado y fijarlo en registro persistente. Los cambios pueden añadir direcciones, no reasignar arbitrariamente las existentes.
5. Validar por **FC03 read-only**, Unit ID/offset, calidad, valor y última recepción; distinguir un valor 0 real del valor de sustitución por ausencia.
6. Entregar el mapeo al integrador de Metasys o BMS y validar red/firewall OT, direccionamiento y puertos autorizados.
7. Confirmar aceptación en el controlador externo; que un registro responda en localhost **no certifica** conexión física de terceros.

**No ofrecer "Agregar un Modbus" como botón general del Help Center**: el commissioning del registry es config/CLI/operación técnica, con consulta por API del estado de publicación.

## 9. WF-PWR — PowerPath y dependencias de eliminación

1. Confirmar Equipment de origen, POWER OUTPUT y destino POWER INPUT.
2. Verificar terminales libres, dirección compatible y Feed A/B auténtico.
3. Confirmar conexión física y registrar PowerPath, identificarlo desde ambas puntas.
4. Verificar VIEW POWERPATH y FULL POWER TRACE; no inferir redundancia por la mera presencia de Feed A.
5. Para archivar PowerPath, la ruta \`DELETE /api/power-paths/[id]\` realiza **archivo lógico**, no hard delete; validar acción UI según la pantalla.
6. Para archivar Equipment/Port/Breaker, comprobar paths activos y bindings previamente. El contrato actual de archivado de topología es **insuficiente para afirmar que todas las dependencias externas quedan bloqueadas**.

## 10. Regla de eliminación: dependencias por objeto

| Retirar                   | Condiciones mínimas propuestas                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Site/Structure/Level/Room | Sin descendientes activos, sin geometría dependiente, sin vínculos operativos; actor con permiso específico         |
| Bay/Position              | Sin posiciones/racks correspondientes; Blueprint debe confirmar archivo lógico                                      |
| Rack                      | Sin Device activo, ni CAS reservado/equipado, ni referencias protegidas                                             |
| Device BDFB               | Sin Equipment activo y sin conexiones, bindings, inputs, fuentes o dependencias que requieran resolución            |
| Panel                     | Sin breaker activo ni mapping MQTT; no desmontar en cascada                                                         |
| Breaker                   | Sin conexión eléctrica activa, sin mapping que deba retirarse y sin obligaciones de historial/identidad sin atender |
| Access Port               | Sin PowerPath ni binding SNMP activo; validar que se preserve su rastro histórico                                   |
| PowerPath                 | Autorizar archive y conservar información de trazabilidad                                                           |
| MQTT binding              | Retirar/reasignar identidad con autorización, preservando histórico y evitando duplicidad                           |
| SNMP binding/OID          | Retiro explícito; cambiar Config2/4 requiere ausencia de bindings SNMP activos                                      |
| Historial                 | **No se borra por archivar un equipo**, salvo política separada de retención, privacidad o mantenimiento autorizada |

Todas las condiciones no demostradas en código son **reglas propuestas**, no protección actual garantizada. Deben aplicarse en backend con validación concurrente, permisos y auditoría, no solo deshabilitando botones en React.

## 11. Qué se publica en Help Center y qué no

| Para usuario final             | Para administrador funcional                 | Para integrador técnico                   |
| ------------------------------ | -------------------------------------------- | ----------------------------------------- |
| Encontrar equipo, sala y rack  | Crear/editar espacios                        | Instalar broker/collector SNMP            |
| Ver Panel y breaker            | Crear Panel e instalar breaker               | Configurar serial/topics/IP/credenciales  |
| Consultar conexión A/B         | Comprobar y registrar PowerPath              | Validar OIDs/MIB/escala de campo          |
| Ver lecturas y últimos estados | Verificar y confirmar commissioning aprobado | Ingest, perfil industrial, reconciliación |
| Consultar historial de equipo  | Retirar bindings autorizados                 | Timescale, outbox, Modbus map             |
| Saber por qué falta un dato    | Administrar usuarios y perfiles              | Diagnóstico, backup/restore, certificados |

**No publicar los dos últimos niveles íntegros a Standard.** La ayuda contextual debe ofrecer guías acordes al rol y al contexto, sin revelar secretos técnicos.

## 12. Plan de aceptación por workflow

Cada workflow candidato requiere:

- **Escenario normal** con acción, parámetros e identidad reales, botones y resultado.
- **Escenario con permisos insuficientes**: ni botón peligroso ni API permiten saltarse autorización.
- **Escenario bloqueado por hijos/dependencias**, con mensaje comprensible.
- **Concurrencia y reintentos**: no duplicar Entity, puerto, binding u OID cuando se repite el flujo.
- **Rollback/recuperación**: distinguir borrador sin guardar, archivado recuperable y operación parcialmente persistida.
- **Historia y calidad**: comprobar que lo que llega a LIVE/histórico/Modbus es la señal correcta con fuente y timestamp.
- **Evidencia**: imágenes reales y pasos capturados, sin contraseñas, seriales privados ni datos de cliente.
- **Edición EN/ES**: traducción completa del mismo flujo y gráficos ya renderizados.

**Gate prioritario sugerido:** 1) eliminación segura; 2) Device/Panel/Breaker; 3) Access Port/DC Config2-4/SNMP; 4) MQTT commissioning; 5) PowerPath; 6) LIVE/historia; 7) Industrial/Modbus; 8) resto del producto. La certificación requiere navegador y laboratorio autorizado; esta entrega se limita al contrato de diseño.
