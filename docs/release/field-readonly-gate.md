# Site Mapper MK1 — FIELD Read-Only Gate

**Status:** additive release/commissioning guard. It does not replace FIELD commissioning or Metasys SAT.

## Safety contract

The FIELD gate is read-only against the running system and external equipment.

It does not install/remove packages, run Compose up/down/restart, create/delete volumes, apply migrations or seeds, change firewall/networking, change mappings, execute SNMP SET, or delete telemetry/history.

By default it also writes no files. The optional receipt is the only intentional write and contains no secrets.

## Usage

Full gate:

~~~bash
bash scripts/release/field-check.sh all --env-file /path/to/field.env
~~~

Individual modules:

~~~bash
bash scripts/release/field-check.sh vm --env-file /path/to/field.env
bash scripts/release/field-check.sh config --env-file /path/to/field.env
bash scripts/release/field-check.sh services --env-file /path/to/field.env
bash scripts/release/field-check.sh mqtt --env-file /path/to/field.env
bash scripts/release/field-check.sh snmp --env-file /path/to/field.env
bash scripts/release/field-check.sh data --env-file /path/to/field.env
bash scripts/release/field-check.sh modbus --env-file /path/to/field.env
~~~

Sanitized receipt:

~~~bash
sudo bash scripts/release/field-check.sh all \
  --env-file /opt/site-mapper/config/field.env \
  --receipt
~~~

## What it validates

- VM/host through the existing client VM preflight.
- FIELD intent: production mode, Mongo persistence, MQTT contract, SNMP requirements, Modbus map, secret presence without printing values, and absence of known LAB markers.
- Running service state through read-only Docker inspection.
- MQTT TCP/1883 and expected QDF source identities in TimescaleDB.
- SNMP target configuration and, when snmpget is available, one read-only GET against the first approved profile OID.
- MongoDB and TimescaleDB read queries.
- Modbus source-to-Unit-ID JSON, uniqueness/range, container and listener presence.

The MQTT baseline uses the current known serials when MQTT_EXPECTED_SOURCES is not set:

~~~text
26092403950003
26092403950004
26092403950002
~~~

The gate does not start publishers, synthetic agents or emulators.

## Result semantics

~~~text
NOT_READY
  at least one hard prerequisite failed

READY_WITH_WARNINGS
  hard prerequisites passed but one or more FIELD dependencies
  are not yet observable or an optional probe tool is unavailable

READY_FOR_COMMISSIONING
  all checks visible to this gate passed
~~~

None of these states means PRODUCTION_ACCEPTED. Acceptance still requires real commissioning evidence, LIVE/history coherence, the frozen Modbus contract, Metasys SAT, reboot/recovery evidence, backup/restore evidence and As-Built.

## Receipt

Receipt writing is opt-in:

~~~bash
bash scripts/release/field-check.sh all --receipt
~~~

Default:

~~~text
/var/lib/site-mapper/receipts/<UTC>-field-check.txt
~~~

Override with SITE_MAPPER_FIELD_RECEIPT_DIR. The receipt never includes communities, passwords, tokens or private keys.

## Release boundary

This gate is deliberately additive and is not wired into application startup or current engineering Compose files. Adding it cannot stop or restart an existing deployment.

The final Golden Appliance still needs the productized compose.client.yml, immutable image bundle and installer. Once those exist, this gate should run after FIELD configuration and before commissioning/SAT.
