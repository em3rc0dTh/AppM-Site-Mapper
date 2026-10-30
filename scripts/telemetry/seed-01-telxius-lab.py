#!/usr/bin/env python3
"""Run the consolidated Telxius seed-01 MQTT + Smartpack2 evidence lab.

Truth boundary:
- MQTT comes from the BFDB Telxius emulator and is published to the existing
  operator-supplied MQTT broker. This launcher does not start or own a broker.
- Smartpack2 is one evidence snapshot source, not one controller per QDF.
- The private 5,407-object SNMPWalk + Eltek MIB evidence is mounted at runtime;
  it is never copied into Git.
- QDF-2 remains RAW-only at breaker level until final post-migration breaker
  positions are evidenced in Site Mapper. QDF-4/QDF-5 keep their existing
  explicit Circuit Breaker bindings.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import sys
from urllib.parse import urlparse, urlunparse

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime" / "industrial-lab"
PROJECT = "site-mapper-seed-01"
MONGO = PROJECT + "-mongodb-1"

BASE_COMPOSE = [
    ROOT / "docker-compose.telemetry.yml",
    ROOT / "docker-compose.industrial.yml",
]
BASE_GENERATED = RUNTIME / "compose.json"
BASE_PORTS = RUNTIME / "seed-01.ports.yml"
BASE_ENV = RUNTIME / "lab.env"

PROFILE_FILE = RUNTIME / "seed-01-telxius-profiles.json"
OVERLAY_FILE = RUNTIME / "seed-01-telxius.compose.json"
ENV_FILE = RUNTIME / "seed-01-telxius.env"
SECRET_FILE = RUNTIME / "seed-01-telxius.secrets.json"
COMMISSION = ROOT / "scripts/telemetry/commission-seed-01-telxius-lab.mongosh.js"
BASE_LAUNCHER = ROOT / "scripts/telemetry/industrial-lab.py"

QDFS = ("QDF-2", "QDF-4", "QDF-5")
MQTT_SOURCE = {qdf: "EMU-TELXIUS-" + qdf for qdf in QDFS}
MODBUS_SOURCE_UNITS = {
    "EMU-TELXIUS-QDF-2": 1,
    "EMU-TELXIUS-QDF-4": 2,
    "EMU-TELXIUS-QDF-5": 3,
}
SMARTPACK_SOURCE = "EMU-SMARTPACK2-LURIN"
SYNTHETIC_SNMP_SOURCE = {qdf: "EMU-SNMP-" + qdf for qdf in QDFS}
SYNTHETIC_SNMP_SERVICES = {qdf: "seed01-snmp-agent-" + qdf.lower().replace("-", "") for qdf in QDFS}

WALK_CANDIDATES = (
    "walk.txt",
    "Results SNMPWalk(4).txt",
    "Results SNMPWalk.txt",
)
MAIN_MIB_CANDIDATES = (
    "EltekEnexusPowersystem-rev54.mib",
    "EltekEnexusPowersystem.mib",
)
BRANCH_MIB_CANDIDATES = (
    "EltekEnexusPowersystem_branch10_rev54.mib",
    "EltekEnexusPowersystem_branch10.mib",
)


def fail(message: str) -> None:
    raise RuntimeError("SEED01 TELXIUS LAB BLOCKED: " + message)


def run(
    argv: list[str],
    *,
    input_text: str | None = None,
    env: dict[str, str] | None = None,
    timeout: int = 300,
) -> str:
    done = subprocess.run(
        argv,
        input=input_text,
        text=True,
        capture_output=True,
        env=env,
        timeout=timeout,
    )
    if done.returncode:
        raise RuntimeError(
            f"command failed ({done.returncode}): {' '.join(argv[:4])}\n"
            + done.stderr[-3000:]
        )
    return done.stdout.strip()


def run_live(
    argv: list[str],
    *,
    env: dict[str, str] | None = None,
    timeout: int = 1800,
) -> None:
    try:
        done = subprocess.run(argv, text=True, env=env, timeout=timeout)
    except KeyboardInterrupt:
        raise RuntimeError(
            "launch interrupted by operator; inspect --action status before retrying"
        )
    if done.returncode:
        raise RuntimeError(f"command failed ({done.returncode}): {argv[0]}")


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw in path.read_text(encoding="utf8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        try:
            parsed = shlex.split(value, posix=True)
            values[key] = parsed[0] if parsed else ""
        except ValueError:
            values[key] = value.strip().strip("'").strip('"')
    return values


def write_env(path: Path, values: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(
        "\n".join(key + "=" + shlex.quote(str(value)) for key, value in values.items())
        + "\n",
        encoding="utf8",
    )
    path.chmod(0o600)


def save_json(path: Path, value, *, mode: int = 0o600) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")
    path.chmod(mode)


def existing_base_files() -> list[Path]:
    files = [*BASE_COMPOSE, BASE_GENERATED]
    if BASE_PORTS.is_file():
        files.append(BASE_PORTS)
    return files


def ensure_base_runtime(bfdb: Path) -> None:
    missing = [path for path in [*BASE_COMPOSE, BASE_GENERATED, BASE_ENV] if not path.is_file()]
    if not missing:
        return
    if not BASE_LAUNCHER.is_file():
        fail("missing base industrial launcher")
    print("Preparing the existing Site Mapper industrial runtime ...", flush=True)
    run_live(
        [
            sys.executable,
            str(BASE_LAUNCHER),
            "--bfdb-dir",
            str(bfdb),
            "--action",
            "prepare",
        ],
        timeout=600,
    )
    missing = [path for path in [*BASE_COMPOSE, BASE_GENERATED, BASE_ENV] if not path.is_file()]
    if missing:
        fail("base runtime preparation did not create: " + ", ".join(map(str, missing)))


def base_compose_command() -> list[str]:
    command = [
        "docker",
        "compose",
        "-p",
        PROJECT,
        "--project-directory",
        str(ROOT),
        "--env-file",
        str(BASE_ENV),
    ]
    for file in existing_base_files():
        command += ["-f", str(file)]
    return command


def full_compose_command() -> list[str]:
    command = [
        "docker",
        "compose",
        "-p",
        PROJECT,
        "--project-directory",
        str(ROOT),
        "--env-file",
        str(ENV_FILE),
    ]
    for file in [*existing_base_files(), OVERLAY_FILE]:
        command += ["-f", str(file)]
    return command


def ensure_mongo_running() -> None:
    command = base_compose_command()
    run_live(command + ["up", "-d", "mongodb", "mongo-init"], timeout=600)
    for _ in range(60):
        try:
            if run(
                [
                    "docker",
                    "exec",
                    MONGO,
                    "mongosh",
                    "--quiet",
                    "--eval",
                    "print(db.adminCommand({ping:1}).ok)",
                ],
                timeout=10,
            ).strip().endswith("1"):
                return
        except RuntimeError:
            pass
        subprocess.run(["sleep", "1"], check=False)
    fail("MongoDB did not become ready")


def inventory() -> dict:
    script = r"""
const d=db.getSiblingDB('seed-01');
const state=d.runtime_seed_state.findOne({_id:'seed-01',status:'APPLIED'});
if(!state || state.version<4) throw new Error('seed-01 v4+ required');
const rows=state.bdfbs.map(x=>{
  const eq=d.topology_nodes.find({kind:'EQUIPMENT',deviceId:x.deviceId,lifecycle:'ACTIVE'}).toArray();
  const one=(name,type)=>{
    const m=eq.filter(e=>e.name===name && e.equipmentType===type);
    if(m.length!==1) throw new Error(name+' '+type+' expected once, got '+m.length);
    return m[0];
  };
  const gateway=one(x.key+'_GW-1','NETWORK_BOARD');
  const controller=one(x.key+'_CTRL-1','CONTROLLER_BOARD');
  const breakers=eq.filter(e=>e.equipmentType==='CIRCUIT_BREAKER');
  return {
    key:x.key,
    deviceId:x.deviceId,
    gatewayId:gateway.id,
    gatewaySerial:gateway.serialNumber || null,
    controllerId:controller.id,
    breakerCount:breakers.length
  };
});
print(JSON.stringify({version:state.version,rows}));
"""
    out = run(["docker", "exec", MONGO, "mongosh", "--quiet", "--eval", script])
    lines = [line for line in out.splitlines() if line.startswith("{")]
    if not lines:
        fail("could not read seed-01 inventory from MongoDB")
    data = json.loads(lines[-1])
    if {item["key"] for item in data["rows"]} != set(QDFS):
        fail("unexpected seed BDFB inventory")
    return data


def mqtt_rules() -> list[dict]:
    fields = (
        ("U1", "V", "VOLTAGE"),
        ("I1", "A", "CURRENT"),
        ("P1", "W", "POWER"),
        ("EP1", "kWh", "ENERGY"),
    )
    rules: list[dict] = []
    for group in range(1, 5):
        for position in range(1, 25):
            for wire, unit, metric in fields:
                rules.append(
                    {
                        "key": f"/reported/0_{group}_{position}/{wire}",
                        "kind": "measurement",
                        "unit": unit,
                        "scale": 1,
                        "numericEncoding": "decimal-string",
                        "evidence": (
                            "Telxius seed-01 LAB MQTT replay. Raw point identity is "
                            "SN + rawPointId. The group-to-physical-panel relationship "
                            "remains a laboratory transport mapping until field commissioning."
                        ),
                    }
                )
    return rules


def smartpack_profile() -> dict:
    return {
        "sourceIdentity": SMARTPACK_SOURCE,
        "protocol": "SNMP",
        "version": "telxius-smartpack2-evidence-replay-v1",
        "staleMs": 120000,
        "mib": "eltek-rev54",
        "maxSignals": 4096,
        "rules": [],
    }


def synthetic_snmp_profile(qdf: str, target_id: str) -> dict:
    return {
        "sourceIdentity": SYNTHETIC_SNMP_SOURCE[qdf],
        "protocol": "SNMP",
        "version": "seed01-synthetic-eltek-rev54-v1",
        "targetId": target_id,
        "staleMs": 120000,
        "mib": "eltek-rev54",
        "rules": [
            {
                "key": "1.3.6.1.4.1.12148.10.10.5.5.0",
                "kind": "measurement",
                "unit": "V",
                "scale": 0.1,
                "evidence": "Synthetic Eltek rev54 laboratory voltage; not field evidence",
            },
            {
                "key": "1.3.6.1.4.1.12148.10.9.2.5.0",
                "kind": "measurement",
                "unit": "A",
                "scale": 0.1,
                "evidence": "Synthetic Eltek rev54 laboratory current; not field evidence",
            },
            {
                "key": "1.3.6.1.4.1.12148.10.10.7.5.0",
                "kind": "measurement",
                "unit": "degC",
                "scale": 0.1,
                "evidence": "Synthetic Eltek rev54 laboratory temperature; not field evidence",
            },
            {
                "key": "alarm:1.3.6.1.4.1.12148.10.2.1.0:3",
                "kind": "alarm",
                "activeValues": [1],
                "clearValues": [0],
                "alarmCode": "CONTROLLER_ALARM",
                "evidence": (
                    "Synthetic Eltek power-system status condition=3; "
                    "lab-only controller alarm, not physical field evidence"
                ),
            },
        ],
    }


def first_existing(directory: Path, names: tuple[str, ...], label: str) -> Path:
    for name in names:
        candidate = directory / name
        if candidate.is_file():
            return candidate.resolve()
    fail(f"private SNMP evidence is missing {label} in {directory}")


def resolve_evidence(evidence_dir: Path) -> dict[str, Path]:
    if not evidence_dir.is_dir():
        fail("TELXIUS_SNMP_EVIDENCE_DIR must be an existing private directory")
    return {
        "walk": first_existing(evidence_dir, WALK_CANDIDATES, "SNMPWalk"),
        "mainMib": first_existing(evidence_dir, MAIN_MIB_CANDIDATES, "main Eltek rev54 MIB"),
        "branchMib": first_existing(
            evidence_dir,
            BRANCH_MIB_CANDIDATES,
            "Eltek branch10 rev54 MIB",
        ),
    }


def broker_config(
    raw_url: str,
    username: str | None,
    password: str | None,
) -> dict[str, str]:
    if not raw_url.strip():
        fail(
            "set TELXIUS_MQTT_BROKER_URL (or --mqtt-broker-url) to the existing broker"
        )
    parsed = urlparse(raw_url.strip())
    if parsed.scheme != "mqtt":
        fail(
            "this BFDB field emulator currently supports mqtt:// only; "
            "do not silently downgrade an mqtts:// broker"
        )
    if not parsed.hostname:
        fail("invalid MQTT broker URL")
    port = parsed.port or 1883
    host = parsed.hostname
    docker_host = "host.docker.internal" if host in {"localhost", "127.0.0.1"} else host
    netloc = docker_host + (f":{port}" if port != 1883 else "")
    docker_url = urlunparse(("mqtt", netloc, parsed.path or "", "", "", ""))
    return {
        "host": docker_host,
        "port": str(port),
        "url": docker_url,
        "username": username or (parsed.username or ""),
        "password": password or (parsed.password or ""),
    }


def load_or_create_secrets() -> dict:
    if SECRET_FILE.is_file():
        value = json.loads(SECRET_FILE.read_text(encoding="utf8"))
        required = {
            "community",
            "sourceToken",
            "v3User",
            "v3Auth",
            "v3Priv",
            "engineId",
        }
        if not required.issubset(value):
            fail("existing Telxius secret file is incomplete")
        return value
    value = {
        "community": "lab-" + secrets.token_hex(12),
        "sourceToken": secrets.token_hex(24),
        "v3User": "telxius-lab-" + secrets.token_hex(4),
        "v3Auth": secrets.token_hex(20),
        "v3Priv": secrets.token_hex(20),
        "engineId": "8000" + secrets.token_hex(10),
    }
    save_json(SECRET_FILE, value)
    return value


def default_sender_address() -> str:
    try:
        generated = json.loads(BASE_GENERATED.read_text(encoding="utf8"))
        subnet = generated["networks"]["default"]["ipam"]["config"][0]["subnet"]
        network = ipaddress.ip_network(subnet)
        candidate = network.network_address + 60
        if candidate in network:
            return str(candidate)
    except (KeyError, ValueError, TypeError, json.JSONDecodeError):
        pass
    fail("could not derive a stable SNMP sender address from the base lab network")


def prepare(
    bfdb: Path,
    evidence_dir: Path | None,
    broker: dict[str, str],
) -> dict:
    required = [
        bfdb / "apps/field-emulator/main.py",
        bfdb / "config/devices.telxius-seed-01.yaml",
        bfdb / "config/emulator.telxius-seed-01.yaml",
        bfdb / "apps/snmp-snapshot-emulator/Dockerfile",
        bfdb / "apps/snmp-snapshot-emulator/build_snapshot.py",
        bfdb / "apps/snmp-emulator/Dockerfile",
        bfdb / "apps/snmp-emulator/telxius-snapshot-inform.mjs",
        COMMISSION,
    ]
    missing = [path for path in required if not path.is_file()]
    if missing:
        fail("checkout is not current main; missing: " + ", ".join(map(str, missing)))

    snmp_enabled = evidence_dir is not None
    evidence = (
        resolve_evidence(evidence_dir)
        if evidence_dir is not None
        else {
            "walk": RUNTIME / "SNMP_EVIDENCE_NOT_CONFIGURED",
            "mainMib": RUNTIME / "SNMP_EVIDENCE_NOT_CONFIGURED",
            "branchMib": RUNTIME / "SNMP_EVIDENCE_NOT_CONFIGURED",
        }
    )
    data = inventory()
    rows = {item["key"]: item for item in data["rows"]}

    profiles: list[dict] = []
    for qdf in QDFS:
        profiles.append(
            {
                "sourceIdentity": MQTT_SOURCE[qdf],
                "protocol": "MQTT",
                "version": "telxius-seed01-mqtt-complete-v2",
                "targetId": rows[qdf]["gatewayId"],
                "staleMs": 30000,
                "rules": mqtt_rules(),
            }
        )
    # One Smartpack2 evidence source. No QDF target is assigned because the
    # supplied evidence does not prove which QDF controller owns this walk.
    if snmp_enabled:
        profiles.append(smartpack_profile())
    save_json(PROFILE_FILE, profiles, mode=0o644)

    secret = load_or_create_secrets()
    sender_address = default_sender_address()

    receiver_profile = {
        "sourceIdentity": SMARTPACK_SOURCE,
        "address": sender_address,
        "version": "3",
        "token": secret["sourceToken"],
        "user": {
            "name": secret["v3User"],
            "level": "authPriv",
            "authProtocol": "sha",
            "authKey": secret["v3Auth"],
            "privProtocol": "aes",
            "privKey": secret["v3Priv"],
        },
    }

    services = {
        "site-mapper": {
            "environment": {
                "APP_PERSISTENCE": "mongodb",
                "MONGODB_DB_NAME": "seed-01",
                "SITE_MAPPER_SEED_PROFILE": "seed-01",
                "INDUSTRIAL_PROFILES_FILE": "/config/seed-01-telxius-profiles.json",
                "MQTT_EXPECTED_SOURCES": ",".join(MQTT_SOURCE.values()),
                "MODBUS_SOURCE_UNITS_JSON": json.dumps(
                    MODBUS_SOURCE_UNITS, separators=(",", ":")
                ),
                "MONGODB_URI": (
                    "mongodb://"
                    + MONGO
                    + ":27017/?replicaSet=rs0&directConnection=true"
                ),
                "TELEMETRY_ENABLED": "true",
                "MQTT_BROKER_URL": broker["url"],
                "MQTT_USERNAME": broker["username"],
                "MQTT_PASSWORD": broker["password"],
                "SNMP_INGEST_MAX_RPM": "2000",
                "INDUSTRIAL_TIMESCALE_ENABLED": "true",
            },
            "volumes": [
                str(PROFILE_FILE) + ":/config/seed-01-telxius-profiles.json:ro"
            ],
            "extra_hosts": ["host.docker.internal:host-gateway"],
        },
        "operational-console": {
            "environment": {
                "MQTT_BROKER_URL": broker["url"],
                "MQTT_USERNAME": broker["username"],
                "MQTT_PASSWORD": broker["password"],
            },
            "extra_hosts": ["host.docker.internal:host-gateway"],
        },
        "modbus-tcp": {
            "environment": {
                "MODBUS_SOURCE_UNITS_JSON": json.dumps(
                    MODBUS_SOURCE_UNITS, separators=(",", ":")
                ),
                "MODBUS_POINT_LAYOUT": "panels-4x24",
            }
        },
        "snmp-traps": {
            "environment": {
                "SNMP_TRAP_SOURCES_JSON": json.dumps(
                    [receiver_profile], separators=(",", ":")
                ),
                "SNMP_TRAP_ENGINE_ID": secret["engineId"],
                "SNMP_TRAP_MAX_PENDING": "5000",
            }
        },
        "lab-mqtt-telxius": {
            "build": {"context": str(bfdb)},
            "command": ["python", "apps/field-emulator/main.py"],
            "environment": {
                "MQTT_HOST": broker["host"],
                "MQTT_PORT": broker["port"],
                "MQTT_USERNAME": broker["username"],
                "MQTT_PASSWORD": broker["password"],
                "EMULATOR_DEVICES_FILE": "devices.telxius-seed-01.yaml",
                "EMULATOR_CONFIG_FILE": "emulator.telxius-seed-01.yaml",
            },
            "extra_hosts": ["host.docker.internal:host-gateway"],
            "networks": {"default": {}, "host-access": {}},
            "restart": "unless-stopped",
        },
        "seed01-smartpack2": {
            "build": {
                "context": str(bfdb),
                "dockerfile": "apps/snmp-snapshot-emulator/Dockerfile",
            },
            "environment": {
                "SNMP_WALK_FILE": "/evidence/walk.txt",
                "SNMP_MIB_FILES": (
                    "/evidence/EltekEnexusPowersystem-rev54.mib:"
                    "/evidence/EltekEnexusPowersystem_branch10_rev54.mib"
                ),
                "SNMP_AGENT_PORT": "1161",
                "SNMP_COMMUNITY": secret["community"],
                "SNMP_SIM_LOG_LEVEL": "info",
            },
            "volumes": [
                str(evidence["walk"]) + ":/evidence/walk.txt:ro",
                str(evidence["mainMib"])
                + ":/evidence/EltekEnexusPowersystem-rev54.mib:ro",
                str(evidence["branchMib"])
                + ":/evidence/EltekEnexusPowersystem_branch10_rev54.mib:ro",
                "telxius_snmp_runtime:/runtime",
            ],
            "restart": "unless-stopped",
        },
        "seed01-smartpack2-to-site-mapper": {
            "build": {
                "context": str(bfdb),
                "dockerfile": "apps/snmp-emulator/Dockerfile",
            },
            "command": ["node", "telxius-snapshot-inform.mjs"],
            "environment": {
                "SNMP_SNAPSHOT_FILE": "/runtime/snapshot.json",
                "TELXIUS_SNMP_SOURCE_ID": SMARTPACK_SOURCE,
                "SNMP_TRAP_TARGET_HOST": "snmp-traps",
                "SNMP_TRAP_TARGET_PORT": "1162",
                "SNMP_VERSION": "3",
                "SNMP_V3_USERNAME": secret["v3User"],
                "SNMP_V3_AUTH_KEY": secret["v3Auth"],
                "SNMP_V3_PRIV_KEY": secret["v3Priv"],
                "SNMP_TRAP_INFORM": "true",
                "SNMP_SNAPSHOT_BATCH_SIZE": "16",
                "SNMP_SNAPSHOT_BATCH_INTERVAL_MS": "40",
                "SNMP_SNAPSHOT_REPEAT_SECONDS": "60",
            },
            "volumes": ["telxius_snmp_runtime:/runtime:ro"],
            "depends_on": ["seed01-smartpack2", "snmp-traps"],
            "networks": {"default": {"ipv4_address": sender_address}},
            "restart": "unless-stopped",
        },
    }
    save_json(
        OVERLAY_FILE,
        {
            "services": services,
            "volumes": {"telxius_snmp_runtime": {}},
        },
    )

    env = read_env(BASE_ENV)
    # The generated Telxius env is authoritative for this profile. Inherited
    # shell variables are stripped when Compose is invoked below.
    env.update(
        {
            "APP_ENV": "development",
            "TELEMETRY_ENABLED": "true",
            "TELEMETRY_HISTORY_ENABLED": "true",
            "INDUSTRIAL_TIMESCALE_ENABLED": "true",
            "MQTT_BROKER_URL": broker["url"],
            "MQTT_USERNAME": broker["username"],
            "MQTT_PASSWORD": broker["password"],
            "MQTT_TOPIC_FILTER": "data/dev/#",
            "MQTT_TOPIC_PREFIX": "data/dev/",
            "MQTT_EXPECTED_SOURCES": ",".join(MQTT_SOURCE.values()),
            "MODBUS_SOURCE_UNITS_JSON": json.dumps(
                MODBUS_SOURCE_UNITS, separators=(",", ":")
            ),
            "INDUSTRIAL_PROFILES_JSON": "[]",
            "INDUSTRIAL_INGEST_SOURCES_JSON": json.dumps(
                {SMARTPACK_SOURCE: secret["sourceToken"]} if snmp_enabled else {},
                separators=(",", ":"),
            ),
            "SNMP_TRAP_SOURCES_JSON": json.dumps(
                [receiver_profile] if snmp_enabled else [], separators=(",", ":")
            ),
            "SNMP_TRAP_ENGINE_ID": secret["engineId"],
            "SNMP_TRAP_MAX_PENDING": "5000",
            "SNMP_INGEST_MAX_RPM": "2000",
        }
    )
    write_env(ENV_FILE, env)
    return data


def commission(mode: str) -> None:
    source = COMMISSION.read_text(encoding="utf8")
    argv = ["docker", "exec", "-i", "-e", "SITEMAPPER_SEED01_LAB_MODE=" + mode]
    if mode in {"apply", "retire"}:
        argv += ["-e", "SITEMAPPER_SEED01_LAB_ACK=LAB_ONLY"]
    argv += [MONGO, "mongosh", "--quiet", "seed-01"]
    print(run(argv, input_text=source))


def stop_historical_sources(command: list[str]) -> None:
    # Best-effort only. These services may not exist in the current project.
    old = [
        "lab-mqtt",
        "lab-mosquitto",
        "lab-snmp-01",
        "lab-snmp-02",
        "lab-snmp-03",
        "seed01-snmp-agent-qdf2",
        "seed01-snmp-agent-qdf4",
        "seed01-snmp-agent-qdf5",
        "seed01-snmp-collector-qdf2",
        "seed01-snmp-collector-qdf4",
        "seed01-snmp-collector-qdf5",
    ]
    subprocess.run(command + ["stop", *old], check=False)


def child_env(approved: dict[str, str]) -> dict[str, str]:
    return {key: value for key, value in os.environ.items() if key not in approved}


def require_runtime_inputs(
    args, base: dict[str, str]
) -> tuple[Path | None, dict[str, str]]:
    broker_url = (
        args.mqtt_broker_url
        or os.getenv("TELXIUS_MQTT_BROKER_URL")
        or (
            base.get("MQTT_BROKER_URL", "")
            if "lab-mosquitto" not in base.get("MQTT_BROKER_URL", "")
            else ""
        )
    )
    username = (
        args.mqtt_username
        if args.mqtt_username is not None
        else os.getenv("TELXIUS_MQTT_USERNAME", base.get("MQTT_USERNAME", ""))
    )
    password = (
        args.mqtt_password
        if args.mqtt_password is not None
        else os.getenv("TELXIUS_MQTT_PASSWORD", base.get("MQTT_PASSWORD", ""))
    )
    evidence_raw = (
        str(args.evidence_dir) if args.evidence_dir else os.getenv("TELXIUS_SNMP_EVIDENCE_DIR", "")
    )
    if args.skip_snmp_evidence:
        evidence_dir = None
    elif not evidence_raw:
        fail(
            "set TELXIUS_SNMP_EVIDENCE_DIR (or --evidence-dir) to the private "
            "directory containing the SNMPWalk and both Eltek rev54 MIB files, "
            "or pass --skip-snmp-evidence to start the lab without Smartpack2 replay"
        )
    else:
        evidence_dir = Path(evidence_raw).expanduser().resolve()
    return evidence_dir, broker_config(
        broker_url,
        username,
        password,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bfdb-dir",
        type=Path,
        default=ROOT.parent / "bfdb-telemetry-gateway",
    )
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument(
        "--skip-snmp-evidence",
        action="store_true",
        help=(
            "start the Telxius lab without private Smartpack2 SNMP replay; "
            "MQTT/Mongo/Timescale/Modbus/UI remain enabled"
        ),
    )
    parser.add_argument("--mqtt-broker-url")
    parser.add_argument("--mqtt-username")
    parser.add_argument("--mqtt-password")
    parser.add_argument(
        "--action",
        choices=["prepare", "plan", "up", "stop", "status", "logs", "retire"],
        default="prepare",
    )
    parser.add_argument("--ack-lab-only", action="store_true")
    args = parser.parse_args()

    bfdb = args.bfdb_dir.expanduser().resolve()
    ensure_base_runtime(bfdb)

    if args.action in {"stop", "status", "logs"} and OVERLAY_FILE.is_file() and ENV_FILE.is_file():
        command = full_compose_command()
        services = [
            "mongodb",
            "timescaledb",
            "telemetry-store",
            "site-mapper",
            "modbus-tcp",
            "snmp-traps",
            "operational-console",
            "lab-mqtt-telxius",
            "seed01-smartpack2",
            "seed01-smartpack2-to-site-mapper",
        ]
        if args.action == "stop":
            run(command + ["stop", *services])
        elif args.action == "status":
            print(run(command + ["ps"]))
        else:
            print(run(command + ["logs", "--tail", "180", *services]))
        return

    ensure_mongo_running()
    base = read_env(BASE_ENV)
    evidence_dir, broker = require_runtime_inputs(args, base)
    data = prepare(bfdb, evidence_dir, broker)

    print(
        "Prepared current-main Telxius lab: "
        + ", ".join(
            f"{row['key']} breakers={row['breakerCount']}" for row in data["rows"]
        )
        + (
            "; Smartpack2=one unassigned 5,407-object evidence source."
            if evidence_dir is not None
            else "; Smartpack2=SKIPPED (private SNMP evidence not configured)."
        ),
        flush=True,
    )

    if args.action == "prepare":
        return
    if args.action == "plan":
        commission("plan")
        return
    if args.action == "retire":
        if not args.ack_lab_only:
            fail("--ack-lab-only is required")
        commission("retire")
        return

    command = full_compose_command()
    approved_env = read_env(ENV_FILE)
    environment = child_env(approved_env)

    if args.action == "up":
        if not args.ack_lab_only:
            fail("--ack-lab-only is required")
        commission("apply")
        stop_historical_sources(command)
        selected = [
            "mongodb",
            "mongo-init",
            "timescaledb",
            "telemetry-store",
            "site-mapper",
            "modbus-tcp",
            "operational-console",
            "lab-mqtt-telxius",
        ]
        if evidence_dir is not None:
            selected += [
                "snmp-traps",
                "seed01-smartpack2",
                "seed01-smartpack2-to-site-mapper",
            ]
        run_live(
            command + ["up", "-d", "--build", *selected],
            env=environment,
            timeout=1800,
        )
        print(run(command + ["ps"], env=environment))
        print(
            "\nTELXIUS LAB UP\n"
            "- MQTT: QDF-2/QDF-4/QDF-5 -> existing broker -> Site Mapper\n"
            + (
                "- SNMP: one Smartpack2 private 5,407-object replay -> INFORM batches -> Site Mapper\n"
                if evidence_dir is not None
                else "- SNMP: SKIPPED; no private evidence configured, no Smartpack2 claim made\n"
            )
            + "- Site Mapper: http://127.0.0.1:3000\n"
            + "- Operational Console: http://127.0.0.1:3100\n"
            + "- Modbus TCP lab: 127.0.0.1:1503\n",
            flush=True,
        )
        return

    fail("unsupported action state")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
