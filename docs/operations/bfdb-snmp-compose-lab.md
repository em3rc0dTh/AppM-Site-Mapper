# Docker lab · Site Mapper + BFDB MQTT + SNMPv3 Configuration 4

**Scope: local WSL2/Linux laboratory, not production or Delta field certification.**

Two independent repositories are orchestrated without merging databases:

- [Site Mapper](https://github.com/em3rc0dTh/AppM-Site-Mapper): web/RBAC, MongoDB, historical TimescaleDB, Modbus, 3 SNMP collectors.
- `thradexIT/bfdb-telemetry-gateway`: 3 BFDB MQTT publishers, separate gateway/TSDB/Modbus, 3 SNMPv3 `authPriv` agents.

The BFDB SNMP **Config4** profile uses four independent incoming DC shunts
`A1/A2/B1/B2` and eight synthetic OIDs (4 CURRENT, 4 VOLTAGE) per device.
Its `...2026.49` OID tree is not an authentic Delta/Eltek MIB.
Incoming SNMP current is **not** the sum of 96 MQTT circuit currents.

## Requirements and first start

Docker Compose v2, Git, Bash (WSL2) and OpenSSL. Free localhost TCP
ports 3000, 3100, 27017, 55432, 18081, 18082, 1503, 1883, 5432,
1502 and localhost UDP 11611–11613. Access to the private BFDB GitHub
repository is required. Put both checkouts in the same parent directory
or adjust the BFDB path.

```bash
# If you do not have these clones yet:
git clone https://github.com/em3rc0dTh/AppM-Site-Mapper.git
git clone https://github.com/thradexIT/bfdb-telemetry-gateway.git

cd AppM-Site-Mapper
git pull --ff-only origin main
git -C ../bfdb-telemetry-gateway pull --ff-only origin main

bash scripts/lab/bfdb-snmp-config4.sh init ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh up ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh status ../bfdb-telemetry-gateway
```

`init` generates random **lab-only** tokens and passwords in ignored
`.env` and BFDB `.env.snmp` **only when absent**. Existing files and
secrets are never overwritten. If an existing BFDB `.env.snmp` selects
`GENERIC_2_FEED`, manually change its
`SNMP_EMULATOR_PROFILE=ELTEK_BDCBB_CONFIG_4` without changing secrets.
Site Mapper `.env` must use `APP_ENV=development` and contain the
mandatory Compose values. The `up` command validates Compose before
starting services, creates an isolated external Docker network, and uses
existing Compose project names `appm-site-mapper` and
`bfdb-telemetry-gateway`, reusing their persisted volumes. If your local
project names differ, set `SITE_MAPPER_COMPOSE_PROJECT` and
`BFDB_COMPOSE_PROJECT` before invoking the launcher.

The shared network connects only BFDB Mosquitto + SNMP agents to Site Mapper

- collectors. Neither project's TimescaleDB/Modbus joins the shared network.
  Host ports are loopback-only in the underlying Compose files.

## Recovery from port collisions after the earlier launcher

The first launcher created duplicate projects `bfdb_snmp_lab` and
`site_mapper_snmp_lab`. If those containers exist, do not stop them
one by one or delete the original databases. After pulling the fix, run:

```bash
bash scripts/lab/bfdb-snmp-config4.sh cleanup-duplicate ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh up ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh status ../bfdb-telemetry-gateway
```

Cleanup targets only the two accidentally duplicated projects and does
**not** delete volumes. The regular `up` reuses the original
`appm-site-mapper` and `bfdb-telemetry-gateway` project names. It
may recreate application containers as it applies the updated Compose
configuration, but preserves their named database volumes.

**Existing TimescaleDB warning:** An existing TimescaleDB data directory
retains the role password set when it was first initialized. Adding a new
`TIMESCALE_DB_PASSWORD` to a local `.env` does not rotate the stored
Postgres password. If the Site Mapper historical store reports an
authentication error after restart, investigate the existing role and
original credentials; do not reset or recreate the database to mask it.

## First Superadmin and RBAC

For a **new, empty** Site Mapper MongoDB, create the first account using the
protected endpoint through the interactive helper:

```bash
bash scripts/lab/bfdb-snmp-config4.sh bootstrap ../bfdb-telemetry-gateway
```

The helper prompts for email, display name and hidden password (12+ chars).
If an account already exists, do not bootstrap again; log in normally at
**http://127.0.0.1:3000/login**. Superadmin may create ADMIN and STANDARD
accounts through Settings → Users.

## Before starting the three collectors

Each synthetic BFDB requires an independently inventoried Site Mapper Device
of type BDFB with CHASSIS, PANEL A1/A2/B1/B2, and **four distinct external
POWER INPUT AccessPorts**, properly labeled `feedPosition`, approved lab
`servedPanelIds` and independent shunt attributes. In BDFB inspector choose
the **ELTEK_BDCBB_CONFIG_4** hardware profile explicitly; in **SNMP FEED
COMMISSIONING** bind each OID to its actual synthetic AccessPort with
explicit confirmation. Never auto-bind by panel index.

| Agent   | Source identity     | Internal SNMP DNS             |
| ------- | ------------------- | ----------------------------- |
| BFDB-01 | `EMU-DELTA-BFDB-01` | `snmp-agent-bfdb-01:1161/udp` |
| BFDB-02 | `EMU-DELTA-BFDB-02` | `snmp-agent-bfdb-02:1161/udp` |
| BFDB-03 | `EMU-DELTA-BFDB-03` | `snmp-agent-bfdb-03:1161/udp` |

| Feed | CURRENT synthetic OID                 | VOLTAGE synthetic OID                 |
| ---- | ------------------------------------- | ------------------------------------- |
| A1   | `1.3.6.1.4.1.8072.9999.2026.49.1.1.0` | `1.3.6.1.4.1.8072.9999.2026.49.2.1.0` |
| A2   | `1.3.6.1.4.1.8072.9999.2026.49.1.2.0` | `1.3.6.1.4.1.8072.9999.2026.49.2.2.0` |
| B1   | `1.3.6.1.4.1.8072.9999.2026.49.1.3.0` | `1.3.6.1.4.1.8072.9999.2026.49.2.3.0` |
| B2   | `1.3.6.1.4.1.8072.9999.2026.49.1.4.0` | `1.3.6.1.4.1.8072.9999.2026.49.2.4.0` |

All eight OIDs use engineering scale **0.1**, already set by the Docker
collector overlay. Laboratory rating examples: 800 A per input and shunt
1000 A / 60 mV. The rating is **not** an additional scaling factor.

Start collectors after commissioning:

```bash
bash scripts/lab/bfdb-snmp-config4.sh collectors ../bfdb-telemetry-gateway
bash scripts/lab/bfdb-snmp-config4.sh status ../bfdb-telemetry-gateway
```

There are three independent collectors, one per source, posting to the
Site Mapper private HTTP endpoint with the local collector bearer. Before
commissioning, HTTP 422 / `UNKNOWN_SNMP_POINT` is expected; SNMP agent
startup alone **does not** create physical inventory or mark BDFB `LIVE`.

On the inspector verify `A1/A2/B1/B2`, freshness and `4/4` only when
all mappings and readings are valid. Verify the authenticated SNMP feed
history in Site Mapper TimescaleDB separately from BFDB MQTT/TSDB/Modbus.
The local HTTP health endpoint does not certify this end-to-end path.

Stop without deleting volumes:

```bash
bash scripts/lab/bfdb-snmp-config4.sh down ../bfdb-telemetry-gateway
```

**Do not** execute `docker compose down -v`, commit ignored `.env`
credentials, expose UDP agents publicly or reuse these credentials with
physical Delta controllers. This lab is intentionally not a production
authentication/TLS/OT firewall deployment.

## Hardware layout vs. SNMP version: two independent choices

The field installation described here has **Configuration 2**, meaning two
shunts (side A feeding linked breaker panels A1 + A2, side B feeding B1 + B2).
Do not map an independent current per panel unless the shunts actually exist.
Site Mapper also supports Configuration 4 (A1/A2/B1/B2, four independent shunts).

| Hardware | SNMP | Number of CURRENT OIDs | Lab OID root |
| --- | --- | ---: | --- |
| Config 2 | v2c or v3 | 2 | `1.3.6.1.4.1.8072.9999.2026.48` |
| Config 4 | v2c or v3 | 4 | `1.3.6.1.4.1.8072.9999.2026.49` |

The simulator publishes the same count of optional VOLTAGE OIDs in either
profile. These OIDs are **synthetic**; real Delta indexing and measurement
semantics require a read-only site-specific walk and wiring verification.

For Config 2, set in BFDB's ignored `.env.snmp`:

```dotenv
SNMP_EMULATOR_PROFILE=ELTEK_BDCBB_CONFIG_2
SNMP_VERSION=2c
SNMP_COMMUNITY=<choose-an-OT-lab-readonly-community>
```

For a v3 session set `SNMP_VERSION=3` and configure the private
`SNMP_V3_USERNAME`, `SNMP_V3_AUTH_KEY` and `SNMP_V3_PRIV_KEY`. The
launcher's `up` and `collectors` commands select the correct two- or
four-shunt OID overlay based on `SNMP_EMULATOR_PROFILE`.

The BDFB inspector has explicit **Configuration 2** and **Configuration 4**
selectors, independent from the agent's SNMP version. The current inventory
contract for Config 2 requires four distinct PANEL objects plus two
external POWER INPUT AccessPorts: A, whose `servedPanelIds` are A1 and A2,
and B, whose `servedPanelIds` are B1 and B2. For Config 4 there are four
independent AccessPorts, each linked to one PANEL. An active SNMP OID binding
blocks changing the physical profile until explicitly retired; historical
samples remain intact.

**Do not** switch the existing TELXIUS cabinet's profile, create duplicate
shunts, or commission OIDs by guessing that their count matches hardware.
The configuration of SNMPv2c is not an anonymous push feed: the controller
accepts an authorized read-only community and responds to periodic SNMP GET.
A passive resistive shunt senses current continuously, but that does not
imply continuous unsolicited UDP transmission. SNMPv2c transmits in cleartext;
use segregated management networks and ACLs. Production collector requires
`SNMP_V2C_ACKNOWLEDGE_PLAINTEXT=true` to explicitly accept that risk.

**Existing lab note:** a previously created BFDB `.env.snmp` is never
overwritten by `init`, so switching protocol or profile requires a
deliberate edit followed by a fresh `up`. Credentials must never be
committed or printed in logs.
