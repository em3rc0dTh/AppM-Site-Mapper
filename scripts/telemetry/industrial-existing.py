#!/usr/bin/env python3
"""Opt-in additive industrial lab for the EXISTING Site Mapper Compose project.

Never creates a second Site Mapper database. Refuses to start when the existing
container identities, Mongo name, persistent mounts, secrets or backups differ.
No automatic volume deletion, restore, inventory seed or FIELD commissioning.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import re
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime" / "industrial-lab"
PROJECT = "appm-site-mapper"
MONGO = PROJECT + "-mongodb-1"
TIMESCALE = PROJECT + "-timescaledb-1"
APP = PROJECT + "-site-mapper-1"
LAB_SERVICES = ["lab-mosquitto", "lab-mqtt", "lab-snmp-01", "lab-snmp-02", "lab-snmp-03"]
UP_SERVICES = ["telemetry-store", "modbus-tcp", "site-mapper", "snmp-traps"] + LAB_SERVICES


class Refused(RuntimeError):
    pass


def compose_environment():
    # CLI --env-file alone cannot defeat higher-precedence inherited shell values.
    # Remove those values so the original on-disk .env remains authoritative.
    keys = set()
    for filename in (ROOT / ".env", RUNTIME / "existing.env"):
        for line in filename.read_text(encoding="utf-8").splitlines():
            line = line.strip().removeprefix("export ").strip()
            match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
            if match:
                keys.add(match.group(1))
    return {key: value for key, value in os.environ.items() if key not in keys}


def command(args, *, stdin=None, capture=False, check=True):
    safe_env = compose_environment() if args[:2] == ["docker", "compose"] else None
    result = subprocess.run(
        args, input=stdin, text=True, capture_output=capture,
        check=False, env=safe_env,
    )
    if check and result.returncode:
        # Do not expose the resolved Compose configuration: it includes secrets.
        raise Refused(f"Command failed (exit {result.returncode}): {args[0]} {args[1]}")
    return result


def save_private(path, value):
    path.write_text(value, encoding="utf-8")
    path.chmod(0o600)


def env_line(key, value):
    value = str(value)
    if "'" in value or "\n" in value or "\r" in value:
        raise Refused(f"Unsafe character in generated environment field {key}")
    return key + "='" + value + "'\n"


def inspect(name):
    result = command(["docker", "inspect", name], capture=True)
    objects = json.loads(result.stdout)
    if len(objects) != 1:
        raise Refused(f"Expected one Docker object: {name}")
    return objects[0]


def running_service(name):
    obj = inspect(name)
    if obj.get("Config", {}).get("Labels", {}).get("com.docker.compose.project") != PROJECT:
        raise Refused(f"Container does not belong to {PROJECT}: {name}")
    if not obj.get("State", {}).get("Running"):
        raise Refused(f"Original container must be running: {name}")
    return obj


def docker_env(obj):
    return dict(entry.split("=", 1) for entry in obj["Config"].get("Env", []) if "=" in entry)


def assert_mount(obj, destination, expected_volume):
    mounts = obj.get("Mounts", [])
    matching = [m for m in mounts if m.get("Destination") == destination]
    if len(matching) != 1 or matching[0].get("Type") != "volume" or matching[0].get("Name") != expected_volume:
        raise Refused(f"Existing persistent mount mismatch at {destination}; refusing migration")


def verify_backup(folder):
    if folder is None or not folder.is_dir():
        raise Refused("--backup-dir must point to the verified original backup directory")
    required = ["mongodb-original.archive.gz", "timescale-original.dump"]
    checksums = folder / "SHA256SUMS"
    if not checksums.is_file():
        raise Refused("Missing SHA256SUMS from original backup verification")
    expected = {}
    for line in checksums.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) == 2:
            expected[parts[1].lstrip("*")] = parts[0].lower()
    for filename in required:
        file = folder / filename
        if filename not in expected or not file.is_file() or file.stat().st_size <= 0:
            raise Refused(f"Missing recorded original backup: {filename}")
        digest = hashlib.sha256()
        with file.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected[filename]:
            raise Refused(f"Backup checksum mismatch: {filename}")
    print("Original MongoDB/Timescale backup files and SHA-256 checksums confirmed.")


def check_subnet(subnet):
    for network_id in command(["docker", "network", "ls", "-q"], capture=True).stdout.split():
        obj = inspect(network_id)
        for config in obj.get("IPAM", {}).get("Config") or []:
            cidr = config.get("Subnet")
            if not cidr:
                continue
            try:
                other = ipaddress.ip_network(cidr, strict=False)
            except ValueError:
                continue
            if subnet.overlaps(other):
                labels = obj.get("Labels") or {}
                owned = (
                    labels.get("com.docker.compose.project") == PROJECT
                    and labels.get("com.docker.compose.network") == "industrial-lab"
                    and other == subnet
                )
                if not owned:
                    raise Refused(f"Lab subnet overlaps Docker network {obj.get('Name')} ({cidr})")


def configure_emulator(bfdb, interval_seconds):
    """Mount a private slow-rate copy; never edit the BFDB checkout."""
    source = bfdb / "config" / "emulator.yaml"
    destination = RUNTIME / "emulator-throttled.yaml"
    if destination.is_file() and interval_seconds is None:
        return destination
    if not source.is_file():
        raise Refused("Missing BFDB config/emulator.yaml")
    original = destination.read_text(encoding="utf-8") if destination.is_file() else source.read_text(encoding="utf-8")
    desired = 10.0 if interval_seconds is None else interval_seconds
    if not 3.0 <= desired <= 120.0:
        raise Refused("--mqtt-interval-seconds must be from 3 to 120 seconds")
    updated, found = re.subn(
        r"(?m)^([ \t]*intervalSeconds:[ \t]*)(?:[0-9]+(?:\.[0-9]+)?)([ \t]*)$",
        lambda match: match.group(1) + str(desired) + match.group(2),
        original,
    )
    if found != 1:
        raise Refused("Could not identify a unique BFDB publish interval; refusing change")
    save_private(destination, updated)
    return destination


def safe_resume_mqtt(args):
    """Explicitly resume only the stopped synthetic sender after queues drain."""
    # diagnostics.json is a checkpoint, not an authoritative queue depth:
    # when a long drain is in progress, its pending counter may remain stale
    # even after every durable spool record has been acknowledged and deleted.
    # Count exactly the UUID-shaped *.json records consumed by MqttObservationOutbox.start().
    spool_count = command(
        [
            "docker", "exec", APP, "node", "-e",
            (
                "const fs=require('node:fs');"
                "const rows=fs.readdirSync('/data/industrial-mqtt',{withFileTypes:true});"
                "const pending=rows.filter((entry)=>entry.isFile() "
                "&& /^[a-f0-9-]{36}\\.json$/.test(entry.name)).length;"
                "console.log(pending);"
            ),
        ],
        capture=True,
    )
    try:
        pending = int(spool_count.stdout.strip())
        if pending < 0:
            raise ValueError("Invalid pending spool count")
    except ValueError as error:
        raise Refused("Durable MQTT spool depth unavailable; do not restart source") from error
    total = command(
        [
            "docker", "exec", MONGO, "mongosh", "--quiet", "--eval",
            "print(db.getSiblingDB('" + args.existing_db + "').industrial_timescale_outbox.countDocuments({}))",
        ],
        capture=True,
    )
    try:
        history_pending = int(total.stdout.strip())
    except ValueError as error:
        raise Refused("Historical outbox depth unavailable; do not restart source") from error
    if pending > 100 or history_pending > 100:
        raise Refused(
            f"Queues still draining (MQTT={pending}, Timescale={history_pending}); "
            "leave the synthetic publisher stopped"
        )
    emitter = inspect(PROJECT + "-lab-mqtt-1")
    if emitter.get("State", {}).get("Running"):
        raise Refused("Lab MQTT emitter is already running; stop it before rate adjustment")
    print(f"Queues drained (MQTT={pending}, Timescale={history_pending}); resuming lab-mqtt only.")
    command(compose_args() + ["up", "-d", "--no-deps", "--force-recreate", "lab-mqtt"])


def prepare(args):
    if not (ROOT / ".env").is_file():
        raise Refused("Missing local .env for the EXISTING stack. Do not substitute industrial lab secrets.")
    if not (args.bfdb_dir / "apps/snmp-emulator/eltek-lab-service.mjs").is_file():
        raise Refused("The BFDB checkout must contain the SNMPv3 lab emitter branch")
    command([
        sys.executable, str(ROOT / "scripts/telemetry/industrial-lab.py"),
        "--bfdb-dir", str(args.bfdb_dir), "--subnet", str(args.subnet),
        "--action", "prepare",
    ])
    emulator_yaml = configure_emulator(args.bfdb_dir, args.mqtt_interval_seconds)
    secret = json.loads((RUNTIME / "secrets.json").read_text(encoding="utf-8"))
    profiles = json.loads((RUNTIME / "profiles.json").read_text(encoding="utf-8"))
    sources = []
    services = {
        "site-mapper": {
            "networks": {"default": {}, "industrial-lab": {}},
            "environment": {
                "MQTT_BROKER_URL": "mqtt://lab-mosquitto:1883",
                "MQTT_EXPECTED_SOURCES": (
                    "EMU-BFDB-01,EMU-BFDB-02,EMU-BFDB-03"
                    + (",LAB-BDFB-02,LAB-BDFB-03"
                       if {p.get("sourceIdentity") for p in profiles}.issuperset(
                           {"LAB-BDFB-02", "LAB-BDFB-03"}) else "")
                ),
                "INDUSTRIAL_LOGICAL_POINTS_FILE": "/config/logical.json",
                "INDUSTRIAL_PROFILES_FILE": "/config/industrial-profiles.json",
            },
            "volumes": [
                str(RUNTIME / "logical.json") + ":/config/logical.json:ro",
                str(RUNTIME / "profiles.json") + ":/config/industrial-profiles.json:ro",
            ],
        },
        "snmp-traps": {"networks": {"default": {}, "industrial-lab": {}}},
        "lab-mosquitto": {
            "image": "eclipse-mosquitto:2.0",
            "networks": ["industrial-lab"],
            "volumes": [str(RUNTIME / "mosquitto.conf") + ":/mosquitto/config/mosquitto.conf:ro"],
            "restart": "unless-stopped",
        },
        "lab-mqtt": {
            "build": {"context": str(args.bfdb_dir)},
            "networks": ["industrial-lab"],
            "command": ["python", "apps/field-emulator/main.py"],
            "environment": {"MQTT_HOST": "lab-mosquitto", "MQTT_PORT": "1883"},
            "volumes": [str(emulator_yaml) + ":/app/config/emulator.yaml:ro"],
            "depends_on": ["lab-mosquitto"],
            "restart": "unless-stopped",
        },
    }
    for number in range(1, 4):
        credential = secret["snmp"][number - 1]
        identity = f"EMU-SNMP-QDF-{number:02}"
        address = str(args.subnet.network_address + 19 + number)
        user = {
            "name": f"synthetic-{number}", "level": "authPriv",
            "authProtocol": "sha", "authKey": credential["auth"],
            "privProtocol": "aes", "privKey": credential["priv"],
        }
        sources.append({
            "sourceIdentity": identity, "address": address, "version": "3",
            "token": credential["token"], "user": user,
            "poll": {
                "method": "get", "port": 1161, "intervalMs": 10000,
                "oids": [
                    "1.3.6.1.4.1.12148.10.10.5.5.0",
                    "1.3.6.1.4.1.12148.10.9.2.5.0",
                    "1.3.6.1.4.1.12148.10.10.7.5.0",
                    "1.3.6.1.4.1.12148.10.2.1.0",
                ],
            },
        })
        services[f"lab-snmp-{number:02}"] = {
            "build": {"context": str(args.bfdb_dir), "dockerfile": "apps/snmp-emulator/Dockerfile"},
            "networks": {"industrial-lab": {"ipv4_address": address}},
            "command": ["node", "eltek-lab-service.mjs"],
            "depends_on": ["snmp-traps"],
            "restart": "unless-stopped",
            "volumes": [
                str(args.bfdb_dir / "config/eltek-sequence.example.json") + ":/config/sequence.json:ro"
            ],
            "environment": {
                "SNMP_VERSION": "3",
                "SNMP_V3_USERNAME": user["name"],
                "SNMP_V3_AUTH_KEY": credential["auth"],
                "SNMP_V3_PRIV_KEY": credential["priv"],
                "SNMP_TRAP_TARGET_HOST": "snmp-traps",
                "SNMP_TRAP_TARGET_PORT": "1162",
                "SNMP_TRAP_INFORM": "true",
                "SNMP_SEQUENCE_FILE": "/config/sequence.json",
                "SNMP_AGENT_PORT": "1161",
            },
        }
    services["snmp-traps"]["environment"] = {
        "SNMP_TRAP_SOURCES_JSON": json.dumps(sources, separators=(",", ":"))
    }
    # If the active original overlay already has the explicitly staged LAB
    # Modbus Unit 4/5 override, a later lab preflight/prepare must not erase it.
    # Fail closed on any unrecognized source map or one-sided override.
    prior_overlay = RUNTIME / "existing-compose.json"
    if prior_overlay.is_file():
        prior = json.loads(prior_overlay.read_text(encoding="utf-8"))
        prior_services = prior.get("services", {}) if isinstance(prior, dict) else {}
        overrides = [
            (prior_services.get(name) or {}).get("environment", {}).get(
                "MODBUS_SOURCE_UNITS_JSON"
            )
            for name in ("site-mapper", "modbus-tcp")
        ]
        if any(item is not None for item in overrides):
            if any(item is None for item in overrides):
                raise Refused("Only one service has a staged Modbus source map")
            try:
                maps = [json.loads(item) for item in overrides]
            except (ValueError, TypeError) as error:
                raise Refused("Malformed staged Modbus Unit map") from error
            expected = {
                "EMU-BFDB-01": 1, "EMU-BFDB-02": 2, "EMU-BFDB-03": 3,
                "LAB-BDFB-02": 4, "LAB-BDFB-03": 5,
            }
            if maps[0] != expected or maps[1] != expected:
                raise Refused("Unexpected Modbus source map; cannot regenerate overlay")
            committed = json.dumps(expected, separators=(",", ":"))
            services["site-mapper"]["environment"]["MODBUS_SOURCE_UNITS_JSON"] = committed
            services["modbus-tcp"] = {
                "environment": {"MODBUS_SOURCE_UNITS_JSON": committed}
            }
    compose = {
        "services": services,
        "networks": {
            "industrial-lab": {
                "internal": True, "ipam": {"config": [{"subnet": str(args.subnet)}]}
            }
        },
    }
    save_private(RUNTIME / "existing-compose.json", json.dumps(compose, indent=2) + "\n")
    env = {
        "MONGODB_DB_NAME": args.existing_db,
        "TELEMETRY_ENABLED": "true",
        "TELEMETRY_HISTORY_ENABLED": "true",
        "MQTT_BROKER_URL": "mqtt://lab-mosquitto:1883",
        "INDUSTRIAL_TIMESCALE_ENABLED": "true",
        # Profile rules are file-mounted on the ACTIVE existing-stack service.
        # Preserve validated full profile JSON in .runtime/profiles.json; keep the
        # required env key below Linux's per-variable size limit.
        "INDUSTRIAL_PROFILES_JSON": "[]",
        "INDUSTRIAL_INGEST_SOURCES_JSON": json.dumps({
            source["sourceIdentity"]: source["token"] for source in sources
        }, separators=(",", ":")),
        "INDUSTRIAL_PROJECTION_TOKEN": secret["projection"],
        "MODBUS_POINTS_LOCAL_PATH": str(RUNTIME / "points.json"),
        "SNMP_TRAP_SOURCES_JSON": json.dumps(sources, separators=(",", ":")),
        "SNMP_TRAP_ENGINE_ID": "8000b983800001202610230001",
    }
    save_private(
        RUNTIME / "existing.env",
        "".join(env_line(key, value) for key, value in env.items()),
    )
    print("Prepared opt-in EXISTING-stack overlay. Original .env and volumes untouched.")


def compose_args():
    return [
        "docker", "compose", "--project-name", PROJECT, "--project-directory", str(ROOT),
        "--env-file", str(ROOT / ".env"),
        "--env-file", str(RUNTIME / "existing.env"),
        "-f", str(ROOT / "docker-compose.telemetry.yml"),
        "-f", str(ROOT / "docker-compose.industrial.yml"),
        "-f", str(RUNTIME / "existing-compose.json"),
    ]


def preflight(args):
    verify_backup(args.backup_dir)
    # Do not trust the implicit Compose project name or current shell environment.
    config_result = command(compose_args() + ["config", "--format", "json"], capture=True)
    try:
        config = json.loads(config_result.stdout)
    except json.JSONDecodeError as error:
        raise Refused("Invalid resolved Compose config") from error
    original = {
        "mongodb": running_service(MONGO),
        "timescaledb": running_service(TIMESCALE),
        "site-mapper": running_service(APP),
        "telemetry-store": running_service(PROJECT + "-telemetry-store-1"),
        "modbus-tcp": running_service(PROJECT + "-modbus-tcp-1"),
    }
    assert_mount(original["mongodb"], "/data/db", PROJECT + "_site_mapper_mongo_data")
    assert_mount(original["timescaledb"], "/var/lib/postgresql/data", PROJECT + "_site_mapper_timescale_data")
    expected_database = args.existing_db
    live_app_env = docker_env(original["site-mapper"])
    if live_app_env.get("MONGODB_DB_NAME") != expected_database:
        raise Refused("Existing Site Mapper is NOT using the requested Mongo database")
    checks = {
        "site-mapper": [
            "MONGODB_DB_NAME", "MONGODB_URI", "APP_ENV", "APP_PERSISTENCE",
            "BOOTSTRAP_ADMIN_TOKEN", "TELEMETRY_STORE_TOKEN", "MODBUS_BRIDGE_TOKEN",
            "MODBUS_SOURCE_UNITS_JSON", "TELEMETRY_STORE_URL", "MODBUS_BRIDGE_URL",
        ],
        "timescaledb": ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"],
        "telemetry-store": ["TIMESCALE_DSN", "TELEMETRY_STORE_TOKEN"],
        "modbus-tcp": ["MODBUS_BRIDGE_TOKEN", "MODBUS_SOURCE_UNITS_JSON", "MODBUS_POINT_LAYOUT"],
    }
    for service, fields in checks.items():
        old = docker_env(original[service])
        new = config["services"][service]["environment"]
        for key in fields:
            if key not in old or key not in new or old[key] != str(new[key]):
                raise Refused(f"Existing credentials/config differ for {service}.{key}; do not recreate")
    check_subnet(args.subnet)
    print("PREFLIGHT PASS: original Mongo DB, fixed volumes, Compose project, secrets and backups unchanged.")
    print("Industrial source mapping remains SYNTHETIC; no FIELD wiring is certified.")


def repair_capture_worker():
    # Keep all publishers OFF so the backed-up live databases can catch up.
    for name in ["lab-mqtt", "lab-snmp-01", "lab-snmp-02", "lab-snmp-03"]:
        service = inspect(f"{PROJECT}-{name}-1")
        if service.get("State", {}).get("Running"):
            raise Refused(
                f"Synthetic publisher {name} must be stopped before an in-place worker repair"
            )
    print("Sources stopped; rebuilding/recreating existing Site Mapper app ONLY.")
    print("MongoDB, TimescaleDB, outbox volumes and Modbus will remain attached.")
    command(compose_args() + ["up", "-d", "--build", "--no-deps", "site-mapper"])


def migrate_industrial_table():
    migration = ROOT / "infra/telemetry-store/init/004-industrial-observations.sql"
    result = subprocess.run(
        [
            "docker", "exec", "-i", TIMESCALE, "psql", "-X", "-v", "ON_ERROR_STOP=1",
            "-U", "site_mapper", "-d", "site_mapper_telemetry",
        ],
        input=migration.read_text(encoding="utf-8"),
        text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise Refused("Additive industrial Timescale SQL failed; no application services were recreated")
    print("Original TimescaleDB: additive industrial_observations migration applied.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bfdb-dir", required=True, type=Path)
    parser.add_argument("--existing-db", required=True)
    parser.add_argument("--subnet", default="10.253.55.0/24")
    parser.add_argument("--backup-dir", type=Path)
    parser.add_argument("--mqtt-interval-seconds", type=float, default=None,
                        help="Private lab publication cadence (default 10s; 3-120s)")
    parser.add_argument(
        "--action", choices=["prepare", "preflight", "up", "status", "logs", "stop-lab", "resume-mqtt", "repair-app"],
        default="prepare",
    )
    args = parser.parse_args()
    args.bfdb_dir = args.bfdb_dir.expanduser().resolve()
    args.backup_dir = args.backup_dir.expanduser().resolve() if args.backup_dir else None
    try:
        args.subnet = ipaddress.ip_network(args.subnet)
        if args.subnet.version != 4 or args.subnet.prefixlen != 24 or not args.subnet.is_private:
            raise Refused("--subnet requires a private IPv4 /24")
        if not args.existing_db or any(c in args.existing_db for c in "/\\ $'\"\n"):
            raise Refused("Pass the exact existing MongoDB name")
        prepare(args)
        if args.action == "prepare":
            return
        if args.action in ("preflight", "up", "resume-mqtt", "repair-app"):
            preflight(args)
        if args.action == "up":
            migrate_industrial_table()
            # Explicit --no-deps NEVER recreates/reinitializes Mongo, Timescale or mongo-init.
            command(compose_args() + ["up", "-d", "--build", "--no-deps"] + UP_SERVICES)
        elif args.action == "repair-app":
            repair_capture_worker()
        elif args.action == "resume-mqtt":
            safe_resume_mqtt(args)
        elif args.action == "preflight":
            return
        elif args.action == "status":
            command(compose_args() + ["ps"])
        elif args.action == "logs":
            command(compose_args() + ["logs", "--tail", "80"] + UP_SERVICES)
        elif args.action == "stop-lab":
            # Keeps Site Mapper, its two databases, historical store and Modbus running.
            command(compose_args() + ["stop"] + LAB_SERVICES + ["snmp-traps"])
    except (Refused, OSError, KeyError, json.JSONDecodeError, subprocess.SubprocessError) as error:
        print("REFUSED: " + str(error), file=sys.stderr)
        raise SystemExit(2) from None


if __name__ == "__main__":
    main()
