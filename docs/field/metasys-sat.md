# Metasys SAT · Modbus TCP

Prueba de aceptación para la salida Site Mapper -> Modbus TCP -> Metasys/BMS. Ejecutar con el integrador y la red OT autorizada.

## 1. Precondiciones

- [ ] Equipment físico identificado y comisionado;
- [ ] fuente real MQTT/SNMP aceptada;
- [ ] valor RAW visible;
- [ ] métrica/escala/unidad aprobadas;
- [ ] LIVE correcto;
- [ ] histórico verificado;
- [ ] Unit ID aprobado;
- [ ] register map revision congelada;
- [ ] ruta OT y firewall aprobados;
- [ ] política de stale/missing acordada;
- [ ] relojes sincronizados suficientemente para comparar evidencia.

## 2. Contrato

La salida base de circuitos usa:

- Modbus TCP;
- FC03 Holding Registers;
- FLOAT32 para V/A/W/kWh en el contrato eléctrico vigente;
- dos registros de 16 bits por FLOAT32;
- Unit IDs y addresses explícitamente comisionados.

No utilizar el CSV de integración controlada como As-Built de cliente sin sustituir identities y mappings por los aprobados en campo.

## 3. Handshake con el integrador

Registrar:

| Parámetro                  | Valor aprobado   |
| -------------------------- | ---------------- |
| Site Mapper/sidecar IP     |                  |
| TCP port                   |                  |
| Metasys IP                 |                  |
| Unit ID                    |                  |
| Address base               | 0 / 1            |
| Word order                 |                  |
| Poll interval              |                  |
| Timeout/retries            |                  |
| Missing/stale behavior     | zero / exception |
| Register map revision/hash |                  |

## 4. Prueba punto a punto

Seleccionar al menos un punto representativo por tipo y por mapping relevante.

| Etapa           | Evidencia                                            |
| --------------- | ---------------------------------------------------- |
| Fuente física   | valor/display/API del equipo, cuando esté disponible |
| Site Mapper RAW | OID/raw point/topic + valor                          |
| Canonical       | metric + unit + Equipment                            |
| LIVE            | valor + timestamp + freshness                        |
| TimescaleDB     | observation compatible                               |
| Modbus          | Unit ID + register + decoded FLOAT32                 |
| Metasys         | punto BMS + valor + unit                             |

Resultado esperado: identidad, semántica y valor son coherentes dentro de la tolerancia acordada.

## 5. Stale / unavailable

Probar de forma controlada una interrupción de fuente o un punto no disponible.

Confirmar que el comportamiento observado coincide con `MODBUS_MISSING_POLICY` y con lo aceptado por el integrador.

La política `zero` puede ser indistinguible de un cero real en el BMS. La política `exception` cambia la respuesta Modbus. La decisión es contractual y debe figurar en el As-Built.

## 6. Restart

1. observar un punto estable;
2. reiniciar el sidecar o componente acordado;
3. verificar reconexión de Metasys;
4. comprobar que Site Mapper recibe una muestra nueva;
5. confirmar que el BMS vuelve a leer el valor correcto;
6. registrar duración y cualquier intervalo sin dato.

No certificar estado fresco utilizando únicamente un valor anterior al reinicio.

## 7. Resultado

| Campo                 | Valor                 |
| --------------------- | --------------------- |
| Release SHA/image     |                       |
| Site                  |                       |
| Equipment             |                       |
| Source identity       |                       |
| Register map revision |                       |
| Fecha/hora            |                       |
| Integrador            |                       |
| Resultado             | PASS / FAIL / BLOCKED |
| Evidencia             |                       |
| Observaciones         |                       |

Un PASS de software sin acceso al Metasys real no es un PASS de este SAT; debe registrarse como BLOCKED o fuera de alcance.
