# Commissioning de equipos reales

Este procedimiento conecta infraestructura física real a Site Mapper sin reemplazar el modelo canónico por detalles de protocolo.

## 1. Principio de identidad

Crear o validar primero la representación física:

```text
Network
 -> Site
 -> Structure / Level / Room
 -> Rack
 -> Device
 -> Equipment
```

Después conectar transporte y señales.

Un endpoint SNMP, un publisher MQTT o un serial de protocolo no crean por sí solos la relación física. Cuando un serial publicado coincide con un nodo, Site Mapper puede resolver la fuente a ese nodo cuando el contrato lo permite, pero las métricas de breakers/equipment siguen requiriendo commissioning explícito.

## 2. MQTT real

### 2.1 Datos requeridos

Obtener del propietario del broker:

- `MQTT_BROKER_URL` — usar `mqtts://` en staging/production;
- `MQTT_CLIENT_ID` estable y exclusivo por subscriber/replica;
- usuario/password por secret store;
- `MQTT_TOPIC_FILTER`;
- source serial / sourceIdentity esperado;
- QoS y frecuencia;
- payload sanitizado y definición de `messageId` si existe.

No reutilizar el mismo `MQTT_CLIENT_ID` en dos procesos activos.

### 2.2 Activación

Configurar mediante el mecanismo privado del deployment:

```dotenv
TELEMETRY_ENABLED=true
MQTT_CLIENT_ID=<unique-site-mapper-subscriber>
MQTT_BROKER_URL=mqtts://<approved-broker>:<port>
MQTT_USERNAME=<secret>
MQTT_PASSWORD=<secret>
MQTT_TOPIC_FILTER=<approved-filter>
```

No copiar direcciones de un entorno anterior. Los valores deben provenir del Site Survey.

### 2.3 Discovery y commissioning

1. confirmar que el subscriber autentica y recibe la fuente prevista;
2. observar sourceIdentity, topic, raw point, timestamp y valor;
3. rechazar o aislar una fuente no comisionada;
4. validar con documentación/evidencia qué representa cada raw point;
5. crear bindings exactos `source + raw point + metric -> Equipment`;
6. confirmar el plan antes de activarlo;
7. comprobar que el target físico, panel/posición y source ownership siguen siendo correctos.

Nunca mapear automáticamente un breaker por el orden del payload o por el nombre visual del panel.

## 3. SNMP real

### 3.1 Datos requeridos

Obtener:

- IP/hostname de gestión;
- versión SNMP;
- para v3: engine ID, username, auth protocol, priv protocol y secretos;
- MIB o documentación oficial;
- OIDs candidatos;
- frecuencia de polling o traps;
- identidad lógica del controller.

La configuración del collector debe vivir fuera del navegador y fuera de Git.

### 3.2 Configuración de polling

Variables relevantes:

```dotenv
SNMP_CONTROLLER_HOST=<approved-management-address>
SNMP_CONTROLLER_PORT=161
SNMP_CONTROLLER_ID=<stable-controller-identity>
SNMP_VERSION=3
SNMP_V3_USERNAME=<secret>
SNMP_V3_AUTH_KEY=<secret>
SNMP_V3_PRIV_KEY=<secret>
SNMP_FEED_POINTS_JSON=<approved-oid-metric-scale-array>
SNMP_POLL_INTERVAL_MS=30000
SNMP_INGEST_URL=<private-site-mapper-ingest>
```

En production/staging, cada collector autorizado debe tener identidad/token propio mediante `SNMP_INGEST_SOURCES_JSON`. Un token compartido entre sources no constituye el modelo de producción.

### 3.3 RAW antes que interpretación

El primer objetivo no es “obtener Voltage”, sino capturar evidencia:

```text
sourceIdentity
OID
SNMP syntax/type
raw value
observedAt
quality / error
```

Luego validar:

```text
OID
 -> significado del fabricante
 -> escala
 -> engineering unit
 -> canonical metric
 -> Equipment físico
```

Solo después se comisiona. Un OID conocido por catálogo ayuda a interpretarlo, pero el catálogo no certifica que ese punto corresponda al equipo/circuito físico observado.

## 4. Industrial profiles

Para fuentes industriales extensas puede usarse un archivo montado:

```dotenv
INDUSTRIAL_PROFILES_FILE=/run/site-mapper/industrial-profiles.json
```

La ruta debe ser absoluta y el archivo pertenece al deployment controlado. `INDUSTRIAL_PROFILES_JSON` continúa disponible para configuraciones pequeñas.

El profile define qué fuente y qué puntos se aceptan; no crea topología ni TelemetryBindings automáticamente.

## 5. LIVE y calidad

Un punto comisionado debe verificarse en LIVE:

- target correcto;
- valor plausible;
- timestamp actual;
- freshness;
- calidad;
- origen;
- RAW observable cuando aplique.

`LIVE` prueba estado actual aceptado. No prueba por sí solo que el histórico se haya persistido.

## 6. Histórico

Con histórico habilitado:

```dotenv
TELEMETRY_HISTORY_ENABLED=true
TELEMETRY_STORE_URL=<private-store-url>
TELEMETRY_STORE_TOKEN=<secret>
TIMESCALE_DB_PASSWORD=<secret>
```

Comprobar separadamente que la misma identidad/métrica aparece en TimescaleDB con timestamp y valor compatibles.

La cadena mínima es:

```text
RAW accepted
 -> canonical sample
 -> historyCapture=PERSISTED (cuando aplique)
 -> Timescale query returns the same observation
```

No asumir consistencia distribuida entre MongoDB, TimescaleDB, broker y spools; los runbooks de recuperación continúan siendo obligatorios.

## 7. Modbus real

La publicación Modbus es opcional y explícita.

Configurar únicamente después de acordar con el integrador:

```dotenv
MODBUS_SOURCE_UNITS_JSON={"<approved-source>":<unit-id>}
MODBUS_POINT_LAYOUT=<approved-layout>
MODBUS_MISSING_POLICY=<zero-or-exception>
MODBUS_BRIDGE_URL=<private-bridge-url>
MODBUS_BRIDGE_TOKEN=<secret>
```

No derivar Unit ID desde el número del BFDB, serial, rack o nombre del equipo.

Por cada punto publicado registrar:

| Campo                | Valor                                       |
| -------------------- | ------------------------------------------- |
| Equipment            |                                             |
| Source identity      |                                             |
| Metric               | V / A / W / kWh / approved industrial point |
| Unit ID              |                                             |
| Register             |                                             |
| Function             | FC03                                        |
| Encoding             | IEEE-754 FLOAT32 cuando corresponda         |
| Word order           |                                             |
| Engineering unit     |                                             |
| Missing/stale policy |                                             |

## 8. Cadena de aceptación por señal

Para una señal de campo, demostrar:

```text
physical source value
 -> protocol RAW
 -> Site Mapper RAW
 -> canonical interpretation
 -> LIVE
 -> Timescale history
 -> Modbus register (if commissioned)
 -> Metasys/BMS value (if in scope)
```

Comparar el mismo instante o una ventana controlada. Registrar tolerancias cuando el dispositivo y el BMS no muestreen exactamente al mismo tiempo.

## 9. Restart

Después del commissioning:

1. registrar el último valor/timestamp conocido;
2. reiniciar los servicios aprobados;
3. comprobar que topología, usuarios y bindings persisten;
4. comprobar que el collector/subscriber recupera conexión;
5. observar una muestra nueva;
6. verificar que Modbus no presenta un valor histórico como si fuera estado fresco;
7. verificar histórico posterior al reinicio.

## 10. Cierre

Un equipo queda **FIELD-COMMISSIONED** solo cuando existe evidencia de identidad física, transporte, RAW, interpretación y binding aprobados. Si además existe Modbus/Metasys, el SAT correspondiente debe pasar antes de incluir esa integración en el alcance aceptado.
