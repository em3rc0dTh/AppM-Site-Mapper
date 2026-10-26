#!/usr/bin/env python3
"""STRICT READ-ONLY planning for additive LAB Modbus Unit IDs 4 and 5.

The existing bridge maps EMU-BFDB-01/02/03 to 1/2/3, respectively.
This is an acceptance gate, never edits env/compose, never starts/stops
containers, never writes registers or Mongo/Timescale rows.

Usage:
  python3 scripts/telemetry/plan-bdfb-lab-modbus.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OVERLAY = ROOT / ".runtime" / "industrial-lab" / "existing-compose.json"
DB = "site_mapper_crud_acceptance_02"
PROJECT = "appm-site-mapper"
APP = PROJECT + "-site-mapper-1"
BRIDGE = PROJECT + "-modbus-tcp-1"
MONGO = PROJECT + "-mongodb-1"
ORIGINAL = {"EMU-BFDB-01": 1, "EMU-BFDB-02": 2, "EMU-BFDB-03": 3}
LAB = {"LAB-BDFB-02": 4, "LAB-BDFB-03": 5}


def guard(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError("PREFLIGHT BLOCKED: " + message)


def run(*args: str) -> str:
    result = subprocess.run(list(args), capture_output=True, text=True,
                            timeout=45, check=False)
    if result.returncode:
        raise RuntimeError(
            "Unable to inspect " + args[0] + " (" + str(result.returncode) + ")")
    return result.stdout.strip()


def inspect(container: str) -> dict:
    rows = json.loads(run("docker", "inspect", container))
    guard(len(rows) == 1, "Docker object unavailable: " + container)
    value = rows[0]
    guard(value.get("State", {}).get("Running") is True,
          "Docker service not running: " + container)
    labels = value.get("Config", {}).get("Labels", {})
    guard(labels.get("com.docker.compose.project") == PROJECT,
          "Unexpected project container: " + container)
    return value


def env(container: dict) -> dict[str, str]:
    return dict(x.split("=", 1) for x in container["Config"].get("Env", [])
                if "=" in x)


def serial_map(environment: dict, title: str) -> dict[str, int]:
    try:
        value = json.loads(environment["MODBUS_SOURCE_UNITS_JSON"])
    except (ValueError, KeyError) as error:
        raise ValueError("PREFLIGHT BLOCKED: invalid source map at "+title) from error
    guard(isinstance(value, dict) and len(value) == len(set(value)),
          "source map is not an object at " + title)
    used = set()
    for key, unit in value.items():
        guard(isinstance(key, str) and re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}", key),
              title + " contains invalid source identity")
        guard(type(unit) is int and 1 <= unit <= 247 and unit not in used,
              title + " contains a duplicate or invalid Unit ID")
        used.add(unit)
    return value


def mongo_evidence() -> dict:
    js = """
const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const serials=['LAB-BDFB-02','LAB-BDFB-03'];
const devices=d.topology_nodes.find({
  kind:'DEVICE',deviceType:'BDFB',lifecycle:'ACTIVE',
  serialNumber:{$in:serials}
},{_id:0,id:1,name:1,serialNumber:1,parentId:1}).toArray();
const bindings=serials.map(s=>({
  serial:s,
  source:d.telemetry_bindings.countDocuments({
    sourceIdentity:s,protocol:'MQTT',metric:'SOURCE',
    targetType:'DEVICE',lifecycle:'ACTIVE'
  }),
  points:d.telemetry_bindings.countDocuments({
    sourceIdentity:s,protocol:'MQTT',sourcePointId:{$exists:true},
    lifecycle:'ACTIVE'
  })
}));
print(JSON.stringify({
  devices,bindings,
  timescaleOutbox:d.industrial_timescale_outbox.countDocuments({}),
  retrying:d.industrial_timescale_outbox.countDocuments({
    lastFailureAt:{$exists:true}
  })
}));
"""
    raw = run("docker", "exec", MONGO, "mongosh", "--quiet", "--eval", js)
    return json.loads(raw.splitlines()[-1])


def main() -> int:
    print("=== SITE MAPPER · ADDITIVE LAB MODBUS PLAN · READ ONLY ===", flush=True)
    app = inspect(APP)
    bridge = inspect(BRIDGE)
    mongo = inspect(MONGO)
    a = env(app)
    b = env(bridge)
    guard(a.get("MONGODB_DB_NAME") == DB,
          "Site Mapper not pointing to preserved MongoDB database")
    guard(a.get("MODBUS_BRIDGE_URL") == "http://modbus-tcp:18082",
          "Site Mapper bridge endpoint changed")
    guard(b.get("MODBUS_POINT_LAYOUT") == "panels-4x24",
          "Existing register layout not panels-4x24")
    guard(a.get("MODBUS_BRIDGE_TOKEN") and
          a.get("MODBUS_BRIDGE_TOKEN") == b.get("MODBUS_BRIDGE_TOKEN"),
          "App and bridge authentication tokens differ")
    guard(b.get("MODBUS_BIND_PORT") == "1502" and
          b.get("MODBUS_INGEST_PORT") == "18082",
          "Bridge ports have changed")
    app_map = serial_map(a, "app")
    bridge_map = serial_map(b, "bridge")
    guard(app_map == bridge_map, "app and bridge source maps differ")
    for serial, unit in ORIGINAL.items():
        guard(bridge_map.get(serial) == unit,
              "Original source " + serial + " does not own Unit ID " + str(unit))
    for serial, unit in LAB.items():
        guard(bridge_map.get(serial) in (None, unit),
              "LAB source already assigned to a different Unit ID")
        guard(unit not in set(bridge_map.values()) or bridge_map.get(serial) == unit,
              "Proposed Unit ID " + str(unit) + " belongs to an existing source")

    files = app.get("Config", {}).get("Labels", {}).get(
        "com.docker.compose.project.config_files", "")
    active = [Path(p) for p in files.split(",") if p]
    guard(active == [
        ROOT / "docker-compose.telemetry.yml",
        ROOT / "docker-compose.industrial.yml",
        OVERLAY,
    ], "Active original Compose files differ from expected")
    guard(OVERLAY.is_file() and not OVERLAY.is_symlink(),
          "Original existing-compose.json unavailable")
    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))
    services = overlay.get("services") if isinstance(overlay, dict) else None
    guard(isinstance(services, dict), "Active overlay services missing")
    guard(isinstance(services.get("site-mapper"), dict),
          "Site Mapper overlay configuration missing")
    existing_env = services["site-mapper"].get("environment", {})
    guard(existing_env.get("MQTT_BROKER_URL") == "mqtt://lab-mosquitto:1883",
          "Existing industrial MQTT broker override changed")
    # The staged overlay may already have a Modbus source map if a previous
    # operator explicitly configured one: never silently overwrite it.
    for service in ("site-mapper", "modbus-tcp"):
        scoped = services.get(service) or {}
        candidate = (scoped.get("environment") or {}).get("MODBUS_SOURCE_UNITS_JSON")
        if candidate is not None:
            guard(serial_map({"MODBUS_SOURCE_UNITS_JSON": candidate},
                  service+" overlay") == bridge_map,
                  "Overlay Modbus mapping differs from active containers")
    evidence = mongo_evidence()
    devices = {d["serialNumber"]:d for d in evidence["devices"]}
    guard(len(evidence["devices"]) == 2 and set(devices) == set(LAB),
          "LAB Device inventory is incomplete")
    for serial in LAB:
        ownership = [x for x in evidence["bindings"] if x["serial"] == serial]
        guard(len(ownership) == 1 and ownership[0]["source"] == 1
              and ownership[0]["points"] == 384,
              serial + " MQTT commissioning is incomplete")
    source_map = dict(bridge_map)
    source_map.update(LAB)
    print("Original source map:")
    for serial, unit in bridge_map.items():
        print("  " + serial + " -> Unit ID " + str(unit))
    print("Proposed additive mapping:")
    for serial, unit in LAB.items():
        print("  " + serial + " -> Unit ID " + str(unit))
    print("Register contract: panels-4x24; 96 circuits x 4 FLOAT32 = 768 holding registers per Unit.")
    print("LAB device ownership and all 770 MQTT bindings confirmed.")
    print("Timescale durable outbox pending="+str(evidence["timescaleOutbox"])+
          " retrying="+str(evidence["retrying"]))
    if evidence["timescaleOutbox"] > 100 or evidence["retrying"]:
        print("STOP: Do not attempt a service restart while the historical delivery queue is backed up.")
        print("Stop LAB publishers first and let the outbox drain. Recheck after.")
    else:
        print("OUTBOX THRESHOLD OK; still stop LAB publishers and verify fresh backups before any restart.")
    print("READ-ONLY PLAN PASS: source map suitable for explicit additive approval.")
    print("No Docker, Compose, environment, Modbus registers, or DB changes.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, KeyError,
            json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
