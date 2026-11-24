# Site Mapper — One Kick Lab para una PC nueva

**Runbook operativo v1.0**  
**Fecha de certificación:** 2026-11-24  
**Release certificada:** `a21586f61c01da3082b74ad74c335d032a973679`  
**Modo:** LAB limpio / integración completa  
**Objetivo:** levantar y certificar Site Mapper en una PC nueva sin parches manuales ni comandos correctivos posteriores.

---

## 1. Contrato del One Kick Lab

El procedimiento está diseñado para una PC limpia que no conoce Site Mapper.

Después de instalar Ubuntu y disponer de Internet, el operador debe:

1. obtener el repositorio;
2. fijar exactamente el commit certificado;
3. ejecutar **un solo comando** de Site Mapper:

```bash
sudo ./deployment/one-kick.sh lab
```

Ese comando es el único entrypoint operativo del LAB.

No se debe editar código, Compose, variables, OID, bases de datos ni contenedores en la PC nueva para conseguir que funcione.

Si el comando falla, **la instalación no se acepta**. No se corrige manualmente en esa PC: la corrección debe realizarse en el repositorio, volver a pasar CI/certificación y luego repetirse desde una instalación limpia.

---

## 2. Alcance certificado

El One Kick Lab certifica el software y el stack de integración de Site Mapper con fuentes controladas de laboratorio.

Incluye:

- bootstrap de dependencias del host;
- Docker CE y Docker Compose;
- construcción del stack;
- Site Mapper;
- MongoDB;
- TimescaleDB;
- Mosquitto / MQTT;
- SNMP polling;
- SNMP traps;
- persistencia de traps en MongoDB;
- persistencia de traps en TimescaleDB;
- Modbus TCP;
- reinicio de la aplicación;
- backup lógico aislado;
- restore lógico aislado;
- verificación de continuidad posterior al restore.

El LAB **no certifica**:

- cableado físico;
- NIC industriales específicas de la nueva PC;
- dispositivos ELTEK/BDFB reales;
- direccionamiento final de campo;
- Metasys real;
- túneles externos;
- recuperación del estado productivo actual de TFARM04.

La sustitución de una TFARM real se realiza con el modo `recover` y un Recovery Bundle cifrado. Ese procedimiento es distinto del LAB.

---

## 3. Requisitos de la PC

La PC debe cumplir:

- arquitectura `x86_64`;
- Ubuntu **24.04 LTS**;
- Internet operativo;
- DNS operativo;
- acceso HTTPS a GitHub y a los repositorios APT utilizados por Ubuntu y Docker;
- usuario con permiso `sudo`;
- espacio suficiente para descargar imágenes, construir contenedores y crear los datos temporales del LAB.

El tamaño mínimo de CPU, RAM y disco **no forma parte todavía del contrato certificado**. No asumir un mínimo no documentado.

La conexión WAN/Internet debe estar configurada antes de iniciar el procedimiento.

---

## 4. Preparación inicial

Una instalación Ubuntu completamente nueva puede no incluir Git. Git es necesario únicamente para obtener el repositorio.

Ejecutar:

```bash
sudo apt-get update && sudo apt-get install -y git
```

Esto no configura Site Mapper ni constituye un parche de la aplicación; es el requisito para poder clonar el repositorio.

---

## 5. Obtener exactamente la release certificada

Ejecutar:

```bash
git clone https://github.com/em3rc0dTh/AppM-Site-Mapper.git
cd AppM-Site-Mapper
git checkout --detach a21586f61c01da3082b74ad74c335d032a973679
```

Si GitHub exige autenticación, utilizar únicamente el mecanismo de acceso autorizado para el repositorio.

No utilizar `main`, `latest` ni otra rama para esta certificación.

El objeto que se está validando es exactamente:

```text
a21586f61c01da3082b74ad74c335d032a973679
```

---

## 6. One Kick

Desde la raíz del repositorio:

```bash
sudo ./deployment/one-kick.sh lab
```

No ejecutar comandos adicionales para ayudar al proceso.

No lanzar servicios manualmente.

No ejecutar `docker compose up` por separado.

No crear bases de datos manualmente.

No editar archivos `.env`.

No cambiar OID.

No modificar puertos.

No aplicar migraciones manuales.

No instalar dependencias de Node manualmente.

No realizar correcciones en caliente.

El script debe ser capaz de completar todo el LAB por sí mismo.

---

## 7. Qué hace el comando

### 7.1 Bootstrap del host

`deployment/one-kick.sh` invoca:

```text
deployment/bootstrap-host.sh
```

El bootstrap verifica:

- ejecución como root;
- arquitectura `x86_64`;
- Ubuntu 24.04.

Luego instala las dependencias declaradas por el repositorio y configura Docker CE desde el repositorio oficial de Docker.

Entre los paquetes administrados se encuentran:

- ca-certificates;
- curl;
- gnupg;
- git;
- python3;
- gpg;
- iproute2;
- network-manager;
- kea-dhcp4-server;
- snmp;
- docker-ce;
- docker-ce-cli;
- containerd.io;
- docker-buildx-plugin;
- docker-compose-plugin.

Finalmente habilita Docker y comprueba que Docker y Compose responden.

### 7.2 Creación del LAB limpio

El script usa un proyecto Compose independiente:

```text
uat-onekick-<identificador>
```

Antes de empezar elimina únicamente el proyecto LAB homónimo y sus volúmenes asociados:

```text
down -v --remove-orphans
```

No utiliza este procedimiento para una TFARM productiva.

### 7.3 Construcción y arranque

Se resuelve el stack a partir de:

```text
docker-compose.telemetry.yml
docker-compose.integration.yml
infra/integration/integration.env
```

Después ejecuta la construcción y arranque del stack completo.

### 7.4 Gates automáticos

El One Kick no considera suficiente que los contenedores estén `running`.

Debe comprobar automáticamente:

- finalización correcta de `integration-bootstrap`;
- health de Site Mapper;
- existencia de historia MQTT durable;
- polling SNMP aceptado para los colectores controlados;
- persistencia de observaciones SNMP en TimescaleDB;
- recepción de SNMP traps;
- commit durable de traps;
- presencia de traps en MongoDB;
- presencia de traps en TimescaleDB;
- mapa Modbus esperado;
- ausencia del `operational-console` retirado.

### 7.5 Restart + backup/restore

Después del primer bloque de aceptación ejecuta:

```text
scripts/ci/uat-full-stack-evidence.sh --isolated-lab
```

Este gate ejercita el restart y un backup/restore lógico aislado.

Al terminar, el One Kick vuelve a comprobar:

- health final de Site Mapper;
- MQTT final;
- SNMP polling final;
- SNMP traps finales;
- Modbus final.

---

## 8. Criterio único de éxito

La ejecución solo se acepta si termina con:

```text
ONE_KICK_LAB_CERTIFIED gitSha=a21586f61c01da3082b74ad74c335d032a973679
```

Además debe generarse:

```text
artifacts/one-kick/receipt.txt
```

El recibo contiene como mínimo:

```text
status=ONE_KICK_LAB_CERTIFIED
gitSha=a21586f61c01da3082b74ad74c335d032a973679
ubuntuTarget=24.04
architecture=x86_64
mqtt=PASS
snmpPolling=PASS
snmpTrapsMongo=PASS
snmpTrapsTimescale=PASS
mongodb=PASS
timescaledb=PASS
modbus=PASS
applicationRestart=PASS
isolatedBackupRestore=PASS
```

Cuando el modo LAB se ejecuta fuera de CI, el stack validado queda levantado.

---

## 9. Contrato de falla

Cualquier salida distinta de la certificación anterior bloquea la aceptación.

En caso de falla, el script intenta conservar evidencia en:

```text
artifacts/one-kick/ps-failure.txt
artifacts/one-kick/logs-failure.txt
```

La política es:

**Falla en la PC nueva → no parchear la PC → corregir repositorio → ejecutar Actions → recertificar → repetir One Kick limpio.**

No se aceptan como parte del procedimiento:

- comandos correctivos ad hoc;
- cambios manuales dentro de contenedores;
- modificaciones de datos para hacer pasar el gate;
- deshabilitar verificaciones;
- comentar servicios;
- cambiar el código únicamente en la PC de prueba.

---

## 10. Evidencia de certificación de la release

El commit `a21586f61c01da3082b74ad74c335d032a973679` fue sometido a los gates de release y obtuvo SUCCESS en:

| Gate | Estado |
|---|---|
| TFARM one-kick clean-machine certification | PASS |
| CI | PASS |
| Clean full-stack integration | PASS |
| MK1 HTTP & MongoDB operational acceptance | PASS |
| SNMP adversarial security certification | PASS |
| SNMP Configuration 4 bounded chaos certification | PASS |
| S05 commissioning observability | PASS |
| Industrial integration operator safety | PASS |

El workflow One Kick también ejecutó el bootstrap dentro de un userspace `ubuntu:24.04` vacío antes de ejecutar el stack completo.

Workflow:

```text
.github/workflows/tfarm-one-kick-certification.yml
```

Run de certificación PR:

```text
45427296493
```

Run de certificación push:

```text
45427278734
```

El artifact de la corrida push fue:

```text
tfarm-one-kick-certification-a21586f61c01da3082b74ad74c335d032a973679
```

---

## 11. Resumen para el operador

En una PC nueva:

```bash
sudo apt-get update && sudo apt-get install -y git

git clone https://github.com/em3rc0dTh/AppM-Site-Mapper.git
cd AppM-Site-Mapper
git checkout --detach a21586f61c01da3082b74ad74c335d032a973679

sudo ./deployment/one-kick.sh lab
```

Después de lanzar el último comando, **no intervenir**.

El único resultado aceptable es:

```text
ONE_KICK_LAB_CERTIFIED gitSha=a21586f61c01da3082b74ad74c335d032a973679
```

---

## 12. Regla de release

Una nueva versión de Site Mapper no hereda automáticamente esta certificación.

Si cambia cualquiera de los componentes que participan en el One Kick —aplicación, Docker Compose, infraestructura, scripts, bootstrap, telemetría o contratos de integración— debe generarse un nuevo SHA y volver a ejecutar la certificación completa antes de utilizarlo en una nueva PC.

**One Kick significa reproducción desde repositorio, no reparación en destino.**
