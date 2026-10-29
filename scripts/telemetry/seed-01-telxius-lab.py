#!/usr/bin/env python3
"""Opt-in Telxius seed-01 MQTT + SmartPack2 synthetic lab.

Preserves the customer Mongo volume and seed. Synthetic identities are isolated
from field commissioning and may be retired without touching topology.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import secrets
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / ".runtime" / "industrial-lab"
PROJECT = "site-mapper-seed-01"
MONGO = PROJECT + "-mongodb-1"
BASE_FILES = [
    ROOT / "docker-compose.telemetry.yml",
    ROOT / "docker-compose.industrial.yml",
    RUNTIME / "compose.json",
    RUNTIME / "seed-01.ports.yml",
]
BASE_ENV = RUNTIME / "lab.env"
PROFILE_FILE = RUNTIME / "seed-01-telxius-profiles.json"
OVERLAY_FILE = RUNTIME / "seed-01-telxius.compose.json"
ENV_FILE = RUNTIME / "seed-01-telxius.env"
SECRET_FILE = RUNTIME / "seed-01-telxius.secrets.json"
COMMISSION = ROOT / "scripts/telemetry/commission-seed-01-telxius-lab.mongosh.js"

QDFS = ("QDF-2", "QDF-4", "QDF-5")
MQTT_SOURCE = {q: "EMU-TELXIUS-" + q for q in QDFS}
SNMP_SOURCE = {q: "EMU-SNMP-TELXIUS-" + q for q in QDFS}
SNMP_ROOT = "1.3.6.1.4.1.8072.9999.2026.52"
SNMP_POINTS = [
    f"{SNMP_ROOT}.1.1.0",
    f"{SNMP_ROOT}.1.2.0",
    f"{SNMP_ROOT}.1.3.0",
    f"{SNMP_ROOT}.1.4.0",
    f"{SNMP_ROOT}.1.5.0",
    f"{SNMP_ROOT}.1.6.0",
    f"{SNMP_ROOT}.1.7.0",
    f"{SNMP_ROOT}.1.8.0",
    *[f"{SNMP_ROOT}.2.{i}.0" for i in range(1, 7)],
]


def fail(message: str) -> None:
    raise RuntimeError("SEED01 TELXIUS LAB BLOCKED: " + message)


def run(argv: list[str], *, input_text: str | None = None, env=None, timeout=300) -> str:
    done = subprocess.run(
        argv,
        input=input_text,
        text=True,
        capture_output=True,
        env=env,
        timeout=timeout,
    )
    if done.returncode:
        raise RuntimeError(f"command failed ({done.returncode}): {argv[0]}\n{done.stderr[-2000:]}")
    return done.stdout.strip()


def run_live(argv: list[str], *, env=None, timeout=1200) -> None:
    """Run a long Docker operation with visible progress instead of looking hung."""
    try:
        done = subprocess.run(argv, text=True, env=env, timeout=timeout)
    except KeyboardInterrupt:
        raise RuntimeError(
            "launch interrupted by operator; rerun --action up safely after checking --action status"
        )
    if done.returncode:
        raise RuntimeError(f"command failed ({done.returncode}): {argv[0]}")


def mongo_container_ip() -> str:
    """Use the Mongo IP on this Compose project's private default network.

    The shared host-access network can contain another 'mongodb' DNS alias from
    an older lab. Pinning this one local launch to the already-running seed
    container removes that ambiguity without recreating Mongo or its volume.
    """
    raw = run(["docker", "inspect", MONGO])
    details = json.loads(raw)
    if len(details) != 1:
        fail("cannot inspect seed-01 Mongo container")
    networks = details[0].get("NetworkSettings", {}).get("Networks", {})
    preferred = PROJECT + "_default"
    entry = networks.get(preferred)
    if not entry:
        candidates = [
            value
            for name, value in networks.items()
            if "host-access" not in name and value.get("IPAddress")
        ]
        if len(candidates) != 1:
            fail("cannot identify the private seed-01 Mongo network")
        entry = candidates[0]
    ip = entry.get("IPAddress")
    if not ip:
        fail("seed-01 Mongo has no private network IP")
    return ip


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = shlex.split(value, posix=True)[0] if value.strip() else ""
    return values


def save_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf8")
    path.chmod(0o600)


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
    return m[0].id;
  };
  return {
    key:x.key,deviceId:x.deviceId,
    gatewayId:one(x.key+'_GW-1','NETWORK_BOARD'),
    controllerId:one(x.key+'_CTRL-1','CONTROLLER_BOARD')
  };
});
print(JSON.stringify({version:state.version,rows}));
"""
    out = run(["docker", "exec", MONGO, "mongosh", "--quiet", "--eval", script])
    line = [x for x in out.splitlines() if x.startswith("{")][-1]
    data = json.loads(line)
    if {x["key"] for x in data["rows"]} != set(QDFS):
        fail("unexpected seed BDFB inventory")
    return data


def mqtt_rules() -> list[dict]:
    fields = (
        ("U1", "V", "VOLTAGE"),
        ("I1", "A", "CURRENT"),
        ("P1", "W", "POWER"),
        ("EP1", "kWh", "ENERGY"),
    )
    rules = []
    for group in range(1, 5):
        for position in range(1, 25):
            for wire, unit, metric in fields:
                rules.append({
                    "key": f"/reported/0_{group}_{position}/{wire}",
                    "kind": "measurement",
                    "unit": unit,
                    "scale": 1,
                    "numericEncoding": "decimal-string",
                    "evidence": (
                        "Synthetic Telxius seed-01 Acrel channel; group order "
                        "A3,A2,B3,B2. Lab only; field channel binding remains separate."
                    ),
                })
    return rules


def snmp_rules() -> list[dict]:
    rules = [
        {
            "key": f"{SNMP_ROOT}.1.1.0",
            "kind": "state",
            "valueMap": [{"raw": 1, "code": 1, "label": "normal"}],
            "evidence": "Results SNMPWalk powerSystemStatus=normal(1); numeric OID synthetic lab-only",
        },
        {
            "key": f"{SNMP_ROOT}.1.2.0",
            "kind": "state",
            "valueMap": [{"raw": 4, "code": 4, "label": "SmartPack2 Touch"}],
            "evidence": "Results SNMPWalk powerSystemType=smartpack2Touch(4); numeric OID synthetic lab-only",
        },
        {
            "key": f"{SNMP_ROOT}.1.3.0",
            "kind": "measurement",
            "unit": "V",
            "scale": 1,
            "evidence": "Results SNMPWalk powerSystemNominalVoltage=48; synthetic lab-only",
        },
        {
            "key": f"{SNMP_ROOT}.1.4.0",
            "kind": "unknown",
            "evidence": "Results SNMPWalk load-current literal 91; engineering interpretation intentionally unverified",
        },
        *[
            {
                "key": f"{SNMP_ROOT}.1.{index}.0",
                "kind": "state",
                "evidence": "Results SNMPWalk controller identity text; numeric OID synthetic lab-only",
            }
            for index in range(5, 9)
        ],
    ]
    order = ("A3", "B3", "A2", "B2", "A1", "B1")
    for index, panel in enumerate(order, 1):
        rules.append({
            "key": f"{SNMP_ROOT}.2.{index}.0",
            "kind": "alarm",
            "activeValues": [1],
            "clearValues": [0],
            "severity": "warning",
            "evidence": (
                f"Results SNMPWalk inputIoUnitProgInputDescription order: {panel} Fuse Alarm; "
                "numeric OID/value convention synthetic lab-only"
            ),
        })
    return rules


def prepare(bfdb: Path) -> dict:
    for path in [*BASE_FILES, BASE_ENV, COMMISSION]:
        if not path.is_file():
            fail("missing required local file: " + str(path))
    for path in [
        bfdb / "apps/field-emulator/main.py",
        bfdb / "config/devices.telxius-seed-01.yaml",
        bfdb / "config/emulator.telxius-seed-01.yaml",
        bfdb / "apps/snmp-emulator/telxius-smartpack2-lab-service.mjs",
    ]:
        if not path.is_file():
            fail("BFDB checkout is missing Telxius emulator update: " + str(path))

    data = inventory()
    rows = {x["key"]: x for x in data["rows"]}
    profiles = []
    for qdf in QDFS:
        profiles.append({
            "sourceIdentity": MQTT_SOURCE[qdf],
            "protocol": "MQTT",
            "version": "synthetic-telxius-seed01-mqtt-v1",
            "targetId": rows[qdf]["gatewayId"],
            "staleMs": 30000,
            "rules": mqtt_rules(),
        })
        profiles.append({
            "sourceIdentity": SNMP_SOURCE[qdf],
            "protocol": "SNMP",
            "version": "synthetic-telxius-smartpack2-v1",
            "targetId": rows[qdf]["controllerId"],
            "staleMs": 60000,
            "rules": snmp_rules(),
        })
    save_json(PROFILE_FILE, profiles)

    if SECRET_FILE.exists():
        secrets_data = json.loads(SECRET_FILE.read_text(encoding="utf8"))
    else:
        secrets_data = {
            "community": "lab-" + secrets.token_hex(12),
            "tokens": {qdf: secrets.token_hex(24) for qdf in QDFS},
        }
        save_json(SECRET_FILE, secrets_data)

    services = {
        "site-mapper": {
            "environment": {
                "INDUSTRIAL_PROFILES_FILE": "/config/seed-01-telxius-profiles.json",
                "MQTT_EXPECTED_SOURCES": ",".join(MQTT_SOURCE.values()),
                "MONGODB_URI": (
                    "mongodb://" + mongo_container_ip() +
                    ":27017/?replicaSet=rs0&directConnection=true"
                ),
            },
            "volumes": [
                str(PROFILE_FILE) + ":/config/seed-01-telxius-profiles.json:ro",
            ],
        },
        "lab-mqtt-telxius": {
            "build": {"context": str(bfdb)},
            "command": ["python", "apps/field-emulator/main.py"],
            "environment": {
                "MQTT_HOST": "lab-mosquitto",
                "MQTT_PORT": "1883",
                "EMULATOR_DEVICES_FILE": "devices.telxius-seed-01.yaml",
                "EMULATOR_CONFIG_FILE": "emulator.telxius-seed-01.yaml",
            },
            "depends_on": ["lab-mosquitto"],
            "restart": "unless-stopped",
        },
    }
    for qdf in QDFS:
        suffix = qdf.lower().replace("-", "")
        agent = f"seed01-snmp-agent-{suffix}"
        collector = f"seed01-snmp-collector-{suffix}"
        services[agent] = {
            "build": {"context": str(bfdb), "dockerfile": "apps/snmp-emulator/Dockerfile"},
            "command": ["node", "telxius-smartpack2-lab-service.mjs"],
            "environment": {
                "SNMP_VERSION": "2c",
                "SNMP_COMMUNITY": secrets_data["community"],
                "SNMP_AGENT_PORT": "1161",
                "SNMP_LAB_QDF": qdf,
                "SNMP_LAB_SERIAL": "EMU-SMARTPACK2-" + qdf,
                "SNMP_LAB_SCENARIO": "NORMAL",
            },
            "restart": "unless-stopped",
        }
        services[collector] = {
            "build": {"context": str(ROOT), "dockerfile": "infra/snmp-collector/Dockerfile"},
            "command": ["node", "industrial-poll.mjs"],
            "environment": {
                "APP_ENV": "development",
                "SNMP_CONTROLLER_HOST": agent,
                "SNMP_CONTROLLER_PORT": "1161",
                "SNMP_CONTROLLER_ID": SNMP_SOURCE[qdf],
                "SNMP_VERSION": "2c",
                "SNMP_COMMUNITY": secrets_data["community"],
                "SNMP_OPERATIONAL_POINTS_JSON": json.dumps(SNMP_POINTS, separators=(",", ":")),
                "SNMP_POLL_INTERVAL_MS": "10000",
                "INDUSTRIAL_INGEST_URL": "http://site-mapper:3000/api/telemetry/industrial/ingest",
                "INDUSTRIAL_INGEST_TOKEN": secrets_data["tokens"][qdf],
            },
            "depends_on": [agent, "site-mapper"],
            "restart": "unless-stopped",
        }
    save_json(OVERLAY_FILE, {"services": services})

    env = read_env(BASE_ENV)
    try:
        existing_sources = json.loads(env.get("INDUSTRIAL_INGEST_SOURCES_JSON", "{}"))
    except json.JSONDecodeError:
        fail("existing INDUSTRIAL_INGEST_SOURCES_JSON is invalid")
    for qdf in QDFS:
        existing_sources[SNMP_SOURCE[qdf]] = secrets_data["tokens"][qdf]
    env["INDUSTRIAL_INGEST_SOURCES_JSON"] = json.dumps(existing_sources, separators=(",", ":"))
    ENV_FILE.write_text(
        "\n".join(k + "=" + shlex.quote(str(v)) for k, v in env.items()) + "\n",
        encoding="utf8",
    )
    ENV_FILE.chmod(0o600)
    return data


def compose_command() -> list[str]:
    cmd = [
        "docker", "compose",
        "-p", PROJECT,
        "--project-directory", str(ROOT),
        "--env-file", str(ENV_FILE),
    ]
    for file in [*BASE_FILES, OVERLAY_FILE]:
        cmd += ["-f", str(file)]
    return cmd


def commission(mode: str) -> None:
    source = COMMISSION.read_text(encoding="utf8")
    env = dict(os.environ)
    env["SITEMAPPER_SEED01_LAB_MODE"] = mode
    if mode in {"apply", "retire"}:
        env["SITEMAPPER_SEED01_LAB_ACK"] = "LAB_ONLY"
    # docker exec passes only the requested environment into mongosh.
    argv = ["docker", "exec", "-i"]
    for key in ("SITEMAPPER_SEED01_LAB_MODE", "SITEMAPPER_SEED01_LAB_ACK"):
        if key in env:
            argv += ["-e", key + "=" + env[key]]
    argv += [MONGO, "mongosh", "--quiet", "seed-01"]
    print(run(argv, input_text=source))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bfdb-dir", type=Path, default=ROOT.parent / "bfdb-telemetry-gateway")
    parser.add_argument(
        "--action",
        choices=["prepare", "plan", "up", "stop", "status", "logs", "retire"],
        default="prepare",
    )
    parser.add_argument("--ack-lab-only", action="store_true")
    args = parser.parse_args()
    bfdb = args.bfdb_dir.resolve()
    prepare(bfdb)
    print("Prepared Telxius seed-01 lab profiles/overlay from Mongo seed v4+.")

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

    cmd = compose_command()
    new_services = [
        "site-mapper", "lab-mosquitto", "lab-mqtt-telxius",
        *[f"seed01-snmp-agent-{q.lower().replace('-', '')}" for q in QDFS],
        *[f"seed01-snmp-collector-{q.lower().replace('-', '')}" for q in QDFS],
    ]
    if args.action == "up":
        if not args.ack_lab_only:
            fail("--ack-lab-only is required")
        commission("apply")
        # Stop only historical synthetic publishers. No volumes are removed.
        subprocess.run(cmd + ["stop", "lab-mqtt", "lab-snmp-01", "lab-snmp-02", "lab-snmp-03"],
                       check=False)
        # All required lab services are selected explicitly. --no-deps prevents
        # Compose from recreating Mongo/mongo-init while this additive profile is applied.
        run_live(cmd + ["up", "-d", "--build", "--no-deps", *new_services], timeout=1200)
        print("Telxius seed-01 MQTT + SmartPack2 lab is running.")
        return
    if args.action == "stop":
        run(cmd + ["stop", *new_services])
        return
    if args.action == "status":
        print(run(cmd + ["ps"]))
        return
    if args.action == "logs":
        print(run(cmd + ["logs", "--tail", "160", *new_services]))
        return


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
