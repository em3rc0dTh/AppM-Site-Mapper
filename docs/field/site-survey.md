# Site Survey · Pre-commissioning

Completar este relevamiento antes de conectar Site Mapper a infraestructura real. No registrar contraseñas, claves SNMP, tokens MQTT ni secretos en este documento; registrar únicamente su propietario o referencia al secret store aprobado.

## 1. Identificación del sitio

| Campo | Valor |
| --- | --- |
| Cliente / proyecto | |
| Site | |
| Sala / Room | |
| Responsable de infraestructura | |
| Responsable OT / BMS | |
| Integrador Metasys | |
| Ventana de intervención | |
| Zona horaria / NTP autorizado | |

## 2. Host de Site Mapper

| Campo | Valor |
| --- | --- |
| Sistema operativo | |
| Arquitectura | linux/amd64 / otra |
| Docker Engine | |
| Docker Compose plugin | |
| Hostname | |
| IP de administración | |
| DNS | |
| NTP | |
| Storage persistente | |
| Política de backup | |

## 3. Red

Registrar las rutas aprobadas, no credenciales.

| Flujo | Origen | Destino | Puerto / protocolo | Estado |
| --- | --- | --- | --- | --- |
| Usuario -> Site Mapper | | | HTTPS | |
| Site Mapper -> MongoDB | | | | |
| Site Mapper -> broker MQTT | | | 8883/TLS u otro aprobado | |
| Collector -> equipo SNMP | | | UDP/161 o aprobado | |
| Collector -> Site Mapper | | | HTTPS privado | |
| Site Mapper -> Telemetry Store | | | HTTP(S) privado | |
| Telemetry Store -> TimescaleDB | | | PostgreSQL | |
| Metasys -> Modbus sidecar | | | TCP/502 o puerto aprobado | |

Confirmar VLAN, ACL/firewall, routing, DNS y si existe NAT. La existencia de conectividad IP no equivale a commissioning.

## 4. Equipo físico

| Campo | Valor |
| --- | --- |
| Fabricante | |
| Modelo exacto | |
| Serial | |
| Firmware | |
| Asset tag | |
| Site / Room | |
| Rack / posición | |
| Tipo Site Mapper | Device / Equipment |
| Dirección de gestión | |
| Protocolo | MQTT / SNMP / ambos / otro |
| Documento del fabricante | |
| MIB / protocolo oficial | |

## 5. MQTT

Completar solo si aplica.

| Campo | Valor |
| --- | --- |
| Broker owner | |
| Broker host | |
| Puerto | |
| TLS requerido | |
| CA/cert reference | |
| Username owner/reference | |
| Topic namespace | |
| Topic filter aprobado | |
| QoS de publicación | |
| Frecuencia esperada | |
| messageId estable | sí / no / desconocido |
| Payload de muestra sanitizado | referencia |

El broker y el publicador son dependencias externas. Site Mapper no debe crear identidades físicas a partir de un tópico no aprobado.

## 6. SNMP

Completar solo si aplica.

| Campo | Valor |
| --- | --- |
| Controller IP/hostname | |
| Puerto | |
| Versión | v3 / v2c excepcional |
| Engine ID | |
| Username owner/reference | |
| Auth protocol | |
| Priv protocol | |
| MIB/version | |
| Poll interval aprobado | |
| Trap source(s) | |
| OIDs candidatos | referencia |

Para SNMPv3, los secretos pertenecen exclusivamente al mecanismo privado de configuración del collector.

## 7. Modbus / Metasys

| Campo | Valor |
| --- | --- |
| Consumidor BMS | |
| Host Metasys | |
| Ruta OT aprobada | |
| Puerto Modbus | |
| Unit IDs aprobados | |
| Base de direccionamiento | 0 / 1 |
| Tipo de dato | FLOAT32 |
| Word order | |
| Poll interval | |
| Missing/stale policy | zero / exception / pendiente |
| Register map revision | |
| Responsable de SAT | |

## 8. Precondiciones antes de conectar

- [ ] inventario físico verificado;
- [ ] topología Site Mapper definida;
- [ ] backup/restore del entorno aprobado;
- [ ] rutas de red autorizadas;
- [ ] secretos entregados por canal privado;
- [ ] MIB/protocolo o evidencia de señal disponible;
- [ ] identidad del equipo no depende de nombres inferidos;
- [ ] criterios de LIVE, histórico y stale acordados;
- [ ] Unit IDs y registers no se asignaron por suposición;
- [ ] ventana de intervención y rollback acordados.

Si alguno de estos puntos es desconocido, registrarlo como pendiente. No completar el commissioning inventando defaults de campo.
