# Retiro seguro de Operational Console — Site Mapper MK1

**Estado:** cambio de configuración versionado. No se ha ejecutado en el servidor del cliente.
**Alcance:** quitar el servicio independiente `operational-console` del Compose base, manteniendo intactos Site Mapper :3000 y su plano industrial.
**Motivo:** reducir superficie de ataque eliminando un proceso con lecturas directas de MongoDB/TimescaleDB y caché de sesión independiente.

## Qué cambia

- `docker-compose.telemetry.yml` deja de declarar `operational-console`. `docker compose up` ya no lo construye ni arranca desde el archivo actual.
- La integración CI deja de esperar una respuesta HTTP en `127.0.0.1:3100` y comprueba que el servicio no aparezca en `docker compose config --services`.
- El workflow del componente legado puede ejecutar tests manuales, pero ya no construye una imagen operativa.
- El código `infra/operational-console/**` queda archivado y fuera del runtime. No se borran repositorios, volúmenes ni colecciones.

## Impacto esperado

**Sin impacto arquitectónico sobre** la UI Next.js, login/RBAC principal, Blueprint, CAS, inventario, PowerPath, BDFB, alarmas, colecciones MongoDB, muestras TimescaleDB, MQTT, SNMP ni Modbus: ninguno depende del servicio retirado.

**Capacidades que desaparecen**: interfaz alternativa y exportaciones de la consola; su propia suscripción MQTT; consultas directas de inventario/histórico con Next.js apagado. Quien necesite continuidad operacional deberá usar las funciones nativas de Site Mapper y los mecanismos de recuperación previamente aprobados.

**Riesgo transitorio:** retirar una definición Compose **no detiene por sí solo** un contenedor existente que ya está ejecutándose. Los contenedores huérfanos de instalaciones anteriores requieren retirada específica.

## Comprobación previa no destructiva

En el host correcto, con la configuración real del proyecto:

```sh
docker ps --filter "label=com.docker.compose.service=operational-console" \
  --format '{{.ID}} {{.Names}} {{.Label "com.docker.compose.project"}}'
```

Identificar el ID y el nombre del proyecto **correctos**. No parar ninguna instancia ajena a ese proyecto y no asumir que todos los procesos que escuchan en :3100 son la consola (algunas pruebas arrancan Next.js en ese puerto).

Tras verificar el contenedor exacto, efectuar un cambio controlado:

```sh
docker stop <ID_VERIFICADO>
docker rm <ID_VERIFICADO>
```

**Nunca usar `docker compose down -v`, `docker volume prune` ni limpieza global de orphans** para esta retirada. Conservar los volúmenes MongoDB, TimescaleDB, spool y Caddy, y la configuración privada.

## Aceptación / UAT de retirada

- [ ] El servicio no figura en el Compose efectivo: `docker compose -f docker-compose.telemetry.yml config --services`.
- [ ] No queda contenedor con etiqueta Compose `operational-console` dentro del proyecto aprobado.
- [ ] La consola histórica ya no acepta conexiones en su puerto asignado; comprobar proceso dueño del puerto antes de atribuirlo.
- [ ] Site Mapper :3000 / HTTPS :443 permite login, sesiones y permisos normales.
- [ ] Se mantienen datos y conexiones MongoDB y TimescaleDB existentes; no se regeneran ni sustituyen.
- [ ] Se mantienen lectura/escritura de topología autorizada, Blueprint/CAS, BDFB, alarmas y exportaciones del **producto principal**.
- [ ] MQTT, SNMP, historial y salida Modbus continúan en sus rutas aprobadas.
- [ ] Reinicios aislados conservan datos, credenciales, CA, telemetría y estado de alarmas.
- [ ] Operación de LAN completamente offline sin nuevo puerto público ni dependencia de Internet.

## Reversión

Un rollback **no debe volver a arrancar la consola vulnerable de manera automática**. Si la retirada provoca una regresión inesperada, restaurar únicamente los archivos/versiones de integración necesarios y corregir la dependencia. Cualquier reintroducción futura de la consola requeriría una revisión de seguridad separada, revocación inmediata de sesiones y un contrato de acceso a datos aprobado. No usar recuperación destructiva de bases de datos.
