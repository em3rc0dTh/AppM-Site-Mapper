# OFFICE / FIELD runbook — MQTT real + SNMP configurable

Fecha base: 2026-11-03.

Este perfil existe para que la misma instalación de Site Mapper reciba hoy MQTT desde una laptop de desarrollo y mañana desde un device físico, sin cambiar arquitectura ni mezclar el publisher MQTT sintético del laboratorio.

## Arquitectura

### Hoy — prueba en casa

```text
Windows laptop + WSL
MQTT publisher / MQTT Explorer
        |
        | MQTT TCP/1883
        v
Ubuntu Site Mapper
Mosquitto autenticado
        |
        v
Site Mapper -> RAW -> LIVE -> Timescale -> Modbus

SNMP: synthetic (profile snmp-sim)
```

### Mañana — oficina

```text
Device real
        |
        | MQTT TCP/1883
        v
Ubuntu Site Mapper
Mosquitto autenticado
        |
        v
Site Mapper

SNMP: synthetic, real, or disabled according to field availability
```

The MQTT publisher changes. Site Mapper does not.

---

## Files

- `docker-compose.telemetry.yml`: base stack.
- `docker-compose.office-test.yml`: OFFICE/FIELD overlay.
- `infra/field/mosquitto.conf`: authenticated MQTT listener.
- `infra/field/office-test.env.example`: runtime template.
- `infra/field/init-office-env.sh`: creates local runtime credentials.
- `infra/field/office-up.sh`: starts OFFICE mode.
- `.runtime/office-test.env`: generated local secrets. Never commit it.

Do not combine `docker-compose.office-test.yml` with `docker-compose.integration.yml`. The integration overlay contains the synthetic MQTT publisher and would contaminate a real MQTT test.

---

# TODAY — HOME TEST

## 1. Get the branch on the development machine

```bash
git fetch origin
git checkout feat/office-field-profile-2026-11-03
git pull
```

Move the repository to the clean Ubuntu machine using the normal USB procedure.

On the Ubuntu machine confirm the branch:

```bash
git branch --show-current
git log -1 --oneline
```

Expected branch:

```text
feat/office-field-profile-2026-11-03
```

## 2. Generate OFFICE runtime credentials

From the repository root on Ubuntu:

```bash
chmod +x infra/field/init-office-env.sh infra/field/office-up.sh
sh infra/field/init-office-env.sh
```

This creates:

```text
.runtime/office-test.env
```

and generates private values for:

- TimescaleDB password
- bootstrap token
- telemetry-store token
- Modbus bridge token
- SNMP ingest token
- Site Mapper industrial credential encryption key
- MQTT password

The industrial credential encryption key is generated locally, remains in `.runtime/office-test.env`, and is passed only to the Site Mapper service. It must never be copied from the C&P workbook or committed to Git.

The MQTT username is:

```text
site-mapper-office
```

Read the generated MQTT password locally:

```bash
grep '^MQTT_PASSWORD=' .runtime/office-test.env
```

Do not commit or copy this file into Git.

## 3. Set today's MQTT topic

Default:

```env
MQTT_TOPIC_PREFIX=office/dev/
MQTT_TOPIC_FILTER=office/dev/#
```

If the Windows/WSL publisher uses a different topic, edit only the OFFICE runtime file:

```bash
nano .runtime/office-test.env
```

Example:

```env
MQTT_TOPIC_PREFIX=home/site-mapper/
MQTT_TOPIC_FILTER=home/site-mapper/#
```

The publisher topic must begin with the configured prefix because the Mosquitto ACL is generated from `MQTT_TOPIC_PREFIX`.

Changing only these runtime values does not require application code changes.

## 4. Find the Ubuntu LAN address

```bash
hostname -I
```

or:

```bash
ip addr
```

Example only:

```text
192.168.1.80
```

Use the actual address shown by the machine.

## 5. Allow MQTT through Ubuntu firewall

Check UFW:

```bash
sudo ufw status
```

If UFW is active, allow TCP/1883 from the trusted LAN only.

Example for a `192.168.1.0/24` LAN:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 1883 proto tcp
```

Use the real LAN subnet. Do not blindly reuse the example subnet.

If the LAN subnet cannot be identified yet, a temporary controlled-home-test rule is:

```bash
sudo ufw allow 1883/tcp
```

Remove or tighten that rule after the test.

## 6. Start OFFICE with synthetic SNMP

```bash
sh infra/field/office-up.sh sim
```

This starts:

- MongoDB
- TimescaleDB
- Site Mapper
- Telemetry Store
- Modbus bridge
- Operational Console
- authenticated Mosquitto on LAN TCP/1883
- synthetic SNMP agents/collectors

It does not start the integration MQTT publisher.

## 7. Check the services

```bash
docker compose \
  --env-file .runtime/office-test.env \
  -f docker-compose.telemetry.yml \
  -f docker-compose.office-test.yml \
  --profile snmp-sim \
  ps
```

Check that 1883 is listening:

```bash
ss -lnt | grep ':1883'
```

Expected concept:

```text
0.0.0.0:1883
```

or the specific configured LAN bind address.

## 8. Test connectivity from Windows before MQTT

On Windows PowerShell:

```powershell
ping <UBUNTU_LAN_IP>
Test-NetConnection <UBUNTU_LAN_IP> -Port 1883
```

Required result:

```text
TcpTestSucceeded : True
```

If it is false, do not change Site Mapper code. Check LAN, Ubuntu IP, UFW, Docker port publication and Mosquitto first.

## 9. Connect MQTT Explorer from Windows

Use:

```text
Protocol: MQTT
Host: <UBUNTU_LAN_IP>
Port: 1883
TLS: OFF
Username: site-mapper-office
Password: value from .runtime/office-test.env
```

Publish only under the configured prefix.

Example:

```text
home/site-mapper/device01
```

if:

```env
MQTT_TOPIC_PREFIX=home/site-mapper/
MQTT_TOPIC_FILTER=home/site-mapper/#
```

## 10. Use WSL/emulator as the real test publisher

Configure the Windows/WSL emulator with exactly the same broker coordinates:

```text
HOST=<UBUNTU_LAN_IP>
PORT=1883
TLS=OFF
USERNAME=site-mapper-office
PASSWORD=<generated runtime password>
TOPIC=<configured OFFICE topic>
```

The WSL machine is a publisher only. The broker remains on Ubuntu.

## 11. Verify the data path

Validate in this order:

```text
Windows/WSL publisher
 -> Ubuntu:1883
 -> Mosquitto accepts authenticated publish
 -> Site Mapper subscription
 -> RAW observation
 -> sourceIdentity/rawPointId
 -> commissioning/binding
 -> LIVE
 -> Timescale
 -> Modbus
```

Do not troubleshoot Modbus before RAW exists.

---

# MQTT DIAGNOSTIC MATRIX

## MQTT cannot connect

Check:

1. same LAN
2. Ubuntu IP
3. TCP/1883
4. UFW
5. Mosquitto container
6. username/password
7. TLS disabled
8. topic allowed by ACL

## MQTT connects but Site Mapper shows no RAW

Check:

1. `MQTT_TOPIC_FILTER`
2. `MQTT_TOPIC_PREFIX`
3. actual published topic
4. payload
5. parser compatibility

## RAW exists but LIVE does not

Check:

1. `sourceIdentity`
2. `rawPointId`
3. commissioning
4. binding

Do not change Mosquitto in this state.

## LIVE exists but Modbus does not

Check:

1. `MODBUS_SOURCE_UNITS_JSON`
2. source identity
3. Unit ID
4. point layout

---

# TOMORROW — REAL DEVICE

There are two possible MQTT field architectures.

## Case A — device can publish to our broker

Give the device owner:

```text
Broker host: <UBUNTU_LAN_IP>
Port: 1883
TLS: OFF
Username: site-mapper-office
Password: OFFICE runtime password
Topic: agreed field topic under MQTT_TOPIC_PREFIX
```

Then the device replaces today's laptop publisher:

```text
TODAY:
Windows/WSL -> MQTT -> Ubuntu Site Mapper

TOMORROW:
Device      -> MQTT -> Ubuntu Site Mapper
```

## Case B — device already publishes to somebody else's broker

Do not force our Mosquitto into the path.

Collect:

- broker host
- port
- TLS yes/no
- username
- password
- topic/filter
- payload sample
- source/device identity

Then change the OFFICE runtime values so Site Mapper subscribes to that broker.

If the external broker is used, the local Mosquitto service should not be treated as the source of truth.

---

# PAYLOAD RULE

Topic changes are configuration.

Payload contract changes may require parser work.

Always obtain:

```text
TOPIC
PAYLOAD SAMPLE
SOURCE IDENTITY / SERIAL
PUBLISH FREQUENCY
```

A new vendor topic does not automatically mean code changes. A fundamentally different payload shape may.

---

# SNMP

## Today: synthetic

Use:

```bash
sh infra/field/office-up.sh sim
```

Synthetic SNMP is isolated behind the Compose profile:

```text
snmp-sim
```

No synthetic MQTT publisher is started.

## OFFICE/FIELD: three real/external Config2 sources

The `snmp` profile now starts one collector per QDF. The 2026-11-04 OFFICE lab baseline is:

```text
QDF-2 -> EMU-DELTA-BFDB-01 -> host.docker.internal:11611
QDF-4 -> EMU-DELTA-BFDB-02 -> host.docker.internal:11612
QDF-5 -> EMU-DELTA-BFDB-03 -> host.docker.internal:11613
```

All three use the governed Config2 four-point contract:

```text
A CURRENT -> 1.3.6.1.4.1.8072.9999.2026.48.1.1.0
B CURRENT -> 1.3.6.1.4.1.8072.9999.2026.48.1.2.0
A VOLTAGE -> 1.3.6.1.4.1.8072.9999.2026.48.2.1.0
B VOLTAGE -> 1.3.6.1.4.1.8072.9999.2026.48.2.2.0
scale = 0.1
```

Configure only runtime values in `.runtime/office-test.env`. For the current v2c lab:

```env
SNMP_REAL_VERSION=2c
SNMP_REAL_COMMUNITY=<PRIVATE_COMMUNITY>
SNMP_REAL_V2C_ACKNOWLEDGE_PLAINTEXT=true

SNMP_QDF2_HOST=host.docker.internal
SNMP_QDF2_PORT=11611
SNMP_QDF2_ID=EMU-DELTA-BFDB-01

SNMP_QDF4_HOST=host.docker.internal
SNMP_QDF4_PORT=11612
SNMP_QDF4_ID=EMU-DELTA-BFDB-02

SNMP_QDF5_HOST=host.docker.internal
SNMP_QDF5_PORT=11613
SNMP_QDF5_ID=EMU-DELTA-BFDB-03
```

For field SNMPv3, keep the three host/port/source identities but replace authentication with `SNMP_REAL_VERSION=3`, `SNMP_REAL_V3_USERNAME`, `SNMP_REAL_V3_AUTH_KEY` and `SNMP_REAL_V3_PRIV_KEY`.

Validate each endpoint with `snmpget`/`snmpwalk` first, then:

```bash
sh infra/field/office-up.sh real
```

This starts all three collectors under the `snmp` profile. Secrets stay in the runtime env and are never committed.

If no SNMP should run:

```bash
sh infra/field/office-up.sh none
```

---

# MQTT BINDING RECONCILIATION RULE

MQTT never creates physical inventory. The breaker must already exist in Site Mapper.

For the governed BFDB profile, Site Mapper may create the durable telemetry binding automatically when serial, panel group and physical position resolve to exactly one existing active breaker:

```text
existing physical CB in Site Mapper
 + accepted MQTT serial
 + governed rawPointId 0_<group>_<position>
        |
        v
deterministic topology match
        |
        +--> match: explicit AUTO_RECONCILED binding -> LIVE
        |
        +--> no/ambiguous match: RAW remains UNMAPPED
```

Metric bindings are created only for values actually present in the packet. Missing Voltage/Current/Power/Energy are not invented or derived by commissioning.

---

# TODAY — SUCCESS CRITERIA

The home test is successful when all of these are true:

- Ubuntu obtains a stable LAN IP for the test.
- Mosquitto accepts authenticated TCP/1883 from Windows.
- MQTT Explorer can connect from Windows.
- WSL/emulator can publish to a topic different from `data/dev/#`.
- Site Mapper receives the message as RAW.
- The real MQTT publisher is not mixed with `mqtt-publisher` from the integration compose.
- Synthetic SNMP continues independently.
- The runtime password is not committed to Git.

At that point tomorrow's MQTT integration is a publisher substitution, not an architecture change.

---

# FIELD QUESTIONS

When somebody says "connect the device", ask exactly:

## MQTT

1. Can we configure the broker?
2. Broker host?
3. Port?
4. TLS?
5. Username/password?
6. Topic?
7. Payload sample?
8. Device serial/source identity?
9. Publish frequency?

## SNMP

1. Device IP?
2. SNMP version?
3. UDP port (normally 161)?
4. v2c community or v3 credentials?
5. Approved OIDs?
6. Polling interval?
7. Firewall/ACL restrictions?

With those answers the OFFICE profile is configurable without changing application architecture.
