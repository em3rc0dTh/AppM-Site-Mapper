# Field Commissioning Record · Template

Copiar este archivo a la ubicación controlada de evidencia por cada equipo o fuente comisionada. No almacenar secretos.

## Release / contexto

| Campo | Valor |
| --- | --- |
| Release SHA / image digest | |
| Environment | INTEGRATION / PRE-PRODUCTION / FIELD / PRODUCTION |
| Site | |
| Fecha/hora | |
| Operador | |
| Revisor | |

## Equipo físico

| Campo | Valor |
| --- | --- |
| Manufacturer | |
| Model | |
| Firmware | |
| Serial | |
| Asset tag | |
| Room / Rack / Position | |
| Device ID | |
| Equipment ID | |

## Fuente

| Campo | Valor |
| --- | --- |
| Protocol | MQTT / SNMP / other |
| sourceIdentity | |
| Management/broker reference | |
| Topic/OID/raw point | |
| Transport security | |
| Source documentation | |

## Interpretación

| Campo | Valor |
| --- | --- |
| RAW value | |
| RAW type/syntax | |
| Canonical metric | |
| Engineering unit | |
| Scale/conversion | |
| Evidence for meaning | |
| Binding/profile revision | |

## Verificación

- [ ] RAW visible;
- [ ] sourceIdentity correcto;
- [ ] binding/association aprobado;
- [ ] LIVE correcto;
- [ ] timestamp/freshness correcto;
- [ ] Timescale histórico verificado;
- [ ] restart verificado;
- [ ] stale/unavailable behavior verificado.

## Modbus / BMS (si aplica)

| Campo | Valor |
| --- | --- |
| Unit ID | |
| Register | |
| Function | FC03 |
| Encoding | |
| Word order | |
| Missing policy | |
| Metasys point | |
| SAT result | PASS / FAIL / BLOCKED / N/A |
| Evidence reference | |

## Cierre

**Disposition:** COMMISSIONED / PARTIAL / BLOCKED / REJECTED

**Observaciones:**

**As-Built reference:**
