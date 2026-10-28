# Acceptance industrial — tráfico SNMP emulado, almacenamiento y Modbus reales

**Estatus:** procedimiento de laboratorio aislado, no recepción de hardware Eltek ni aceptación oficial Metasys.

Este laboratorio usa los servicios reales de Site Mapper (receptor UDP SNMPv3,
autenticación por origen, MongoDB replica set, outbox duradero, TimescaleDB,
Modbus TCP FC03) con emulador BFDB. Nunca importa el Excel del proveedor
ni descarga datos de clientes. Hay **5.407 instancias SNMP sintéticas** por
controlador, de las cuales un subconjunto utiliza OID genuinos rev54
con valores de ejemplo; las restantes llevan un prefijo LAB claramente separado.

Las notificaciones Eltek de alarmas, despeje y heartbeat se ejecutan en
secuencia al terminar el barrido inicial. El barrido no representa el patrón
normal de traps de un controlador real: es una prueba intensiva para asegurar
cobertura de un inventario SNMP grande. En campo, las señales que el equipo
no envíe por trap necesitan GET/GETBULK con autorización y una cadencia pactada.

## Lanzamiento en un entorno desechable

Se requieren dos checkouts y Docker Compose. No utilizar este procedimiento
sobre un Site Mapper de cliente; el lanzador crea un proyecto Docker aislado.

```bash
cd /path/AppM-Site-Mapper
python3 scripts/telemetry/industrial-lab.py \
--bfdb-dir /path/bfdb-telemetry-gateway \
--snmp-sweep-count 5407 --action up

python3 scripts/telemetry/accept-eltek-rich-lab.py --expected 5407 --timeout 600
```

El marcador `--snmp-sweep-count 5407` es explícito: sin él se conserva el
emisor liviano existente. Se genera `.runtime/industrial-lab/profiles-rich.json`
independiente del perfil previo y se aplican **solo escalas sintéticas**
5389×0,01=53,89 V y 91×1=91 A. Nunca reutilizarlas para hardware físico sin evidencia.

## Pruebas y prueba documental

El comprobador ejecuta exclusivamente consultas:

- Mongo: conteo de señales SNMP por source, existencia de 5.407 OIDs y RAW
  de tensión, estado disabled(4) y comando observado pushbutton(0);
- Timescale: al menos 5.407 señales distintas con `sample.rawValue`, ceros,
  muestras UNKNOWN y el valor 5389 original;
- Modbus: cliente externo TCP lee FC03 Unit 1/offset 1030,
  IEEE754 FLOAT32 ≈53,89 y quality=1 (offset 1032);
- receptor: sin contadores `trap.queue.full`, `trap.spool.failed`
  o `trap.payload.too_large`; notificaciones a la aplicación.

El resultado `LAB_PASS` prueba el flujo del laboratorio en ese momento.
`LAB_FAIL`, incertidumbre o tiempos agotados no son aprobación. Probar también
alarma ON/OFF, desconexión/reinicio, trazabilidad histórica y consistencia
de registros según el procedimiento operativo antes de aceptar producción.

La certificación con Eltek físico y cliente Metasys físico queda pendiente:
firmware y MIB exactos, protocolo/v3, escalas, wiring, OIDs/traps reales,
identidades por fuente, retención, fallos de transporte y el mapa firmado de
registros con operador BMS.

No modificar ni borrar volúmenes de clientes. Para finalizar el laboratorio,
detener únicamente el proyecto aislado mediante el launcher.
