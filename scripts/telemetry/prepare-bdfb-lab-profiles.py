#!/usr/bin/env python3
"""Stage/commission INDUSTRIAL_PROFILES_JSON for two new synthetic LAB BDFBs.

Default: read-only, prints counts and current profile coverage.
--apply: additive, backed-up edits ONLY to .runtime/industrial-lab/profiles.json,
         the ACTIVE existing-compose.json read-only app mount, and the fallback
         INDUSTRIAL_PROFILES_JSON='[]' in existing.env.
No giant environment variables; full profiles are loaded from a mounted file.
This does not touch Mongo, original profiles, timeseries, service processes,
Docker containers or Modbus mapping. Existing Site Mapper app must load the
changed environment on a separately controlled service-only restart.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAB = ROOT / ".runtime" / "industrial-lab"
MONGO = "appm-site-mapper-mongodb-1"
DB = "site_mapper_crud_acceptance_02"
SERIALS = ("LAB-BDFB-02", "LAB-BDFB-03")
ORIGINAL_SOURCE_BINDINGS = {
    "EMU-BFDB-02": (
        "auto:mqtt:bb137f93188ec2f23b90b1c40f940d1cc4ce8adb6526e1934c2e9f4936e0dbe8",
        "540efb3c-d6a8-4633-b6d3-3dc719f511c5",
    ),
    "EMU-BFDB-03": (
        "auto:mqtt:88cffc3d56c7eea4e6dc31b457d72eb20bc77d5a040cbe9190c2abba7579a9b0",
        "4e9b6c5a-ffc8-4d06-84b2-34845b6cdfaa",
    ),
}
METRICS = {
    "VOLTAGE": ("U1", "V"),
    "CURRENT": ("I1", "A"),
    "POWER": ("P1", "W"),
    "ENERGY": ("EP1", "kWh"),
}


def read_mongo():
    js = """
const d = db.getSiblingDB(%s);
const serials = %s;
const olds = %s;
const devices = d.topology_nodes.find({
  kind:"DEVICE",deviceType:"BDFB",lifecycle:"ACTIVE",
  serialNumber:{$in:serials}
}, {_id:0,id:1,name:1,serialNumber:1,attributes:1}).toArray();
const points = d.telemetry_bindings.find({
  protocol:"MQTT",lifecycle:"ACTIVE",sourceIdentity:{$in:serials}
}, {_id:0,id:1,sourceIdentity:1,sourcePointId:1,metric:1,targetType:1,targetId:1}).toArray();
const ids = [...new Set(points.map(p=>p.targetId))];
const targets = d.topology_nodes.find({id:{$in:ids}},{
  _id:0,id:1,kind:1,deviceId:1,equipmentType:1,lifecycle:1
}).toArray();
const original = d.telemetry_bindings.find({id:{$in:olds}},{
  _id:0,id:1,protocol:1,sourceIdentity:1,metric:1,
  targetType:1,targetId:1,lifecycle:1
}).toArray();
print(JSON.stringify({devices,points,targets,original}));
""" % (json.dumps(DB), json.dumps(list(SERIALS)),
       json.dumps([b[0] for b in ORIGINAL_SOURCE_BINDINGS.values()]))
    result = subprocess.run(
        ["docker", "exec", MONGO, "mongosh", "--quiet", "--eval", js],
        capture_output=True, text=True, timeout=45, check=False,
    )
    if result.returncode:
        raise RuntimeError((result.stderr.strip() or result.stdout.strip())[:350])
    return json.loads(result.stdout.strip().splitlines()[-1])


def validated_profiles(data):
    devices = {d["serialNumber"]: d for d in data["devices"]}
    targets = {t["id"]: t for t in data["targets"]}
    assert set(devices) == set(SERIALS), "Expected exactly both LAB BDFB Devices"
    for source, (binding_id, target_id) in ORIGINAL_SOURCE_BINDINGS.items():
        matches = [x for x in data["original"] if x["id"] == binding_id]
        assert len(matches) == 1, source + ": original binding missing"
        item = matches[0]
        assert item["protocol"] == "MQTT" and item["sourceIdentity"] == source
        assert item["targetId"] == target_id and item["targetType"] == "EQUIPMENT"
        assert item["metric"] == "SOURCE" and item["lifecycle"] == "ACTIVE"

    rules = []
    for serial in SERIALS:
        dev = devices[serial]
        assert dev["name"] == "BDFB-" + serial[-2:]
        assert dev.get("attributes", {}).get("synthetic") is True
        rows = [p for p in data["points"] if p["sourceIdentity"] == serial]
        assert len(rows) == 385, serial + ": expected 385 commissioned bindings"
        source = [p for p in rows if p["metric"] == "SOURCE"]
        assert len(source) == 1 and source[0]["targetId"] == dev["id"]
        assert source[0]["targetType"] == "DEVICE" and not source[0].get("sourcePointId")
        by_point = defaultdict(dict)
        for link in rows:
            if link["metric"] == "SOURCE":
                continue
            point = link.get("sourcePointId")
            assert isinstance(point, str) and re.fullmatch(r"0_[1-4]_(?:[1-9]|1[0-9]|2[0-4])", point)
            metric = link["metric"]
            assert metric in METRICS and link["targetType"] == "EQUIPMENT"
            assert metric not in by_point[point], "duplicate point metric " + point
            breaker = targets.get(link["targetId"])
            assert breaker is not None and breaker.get("lifecycle") == "ACTIVE"
            assert breaker["kind"] == "EQUIPMENT"
            assert breaker["equipmentType"] == "CIRCUIT_BREAKER"
            assert breaker["deviceId"] == dev["id"]
            by_point[point][metric] = link["targetId"]
        assert len(by_point) == 96, serial + ": expected 96 distinct raw points"
        for panel in range(1, 5):
            for position in range(1, 25):
                point = f"0_{panel}_{position}"
                assignments = by_point.get(point)
                assert assignments is not None and set(assignments) == set(METRICS)
                assert len(set(assignments.values())) == 1, point + " maps multiple breakers"
                target = assignments["VOLTAGE"]
                for metric, (field, unit) in METRICS.items():
                    rules.append({
                        "key": f"/reported/{point}/{field}",
                        "kind": "measurement",
                        "targetId": target,
                        "unit": unit,
                        "scale": 1,
                        "numericEncoding": "decimal-string",
                        "evidence": "Site Mapper simulated LAB BFDB explicit point binding; not field evidence",
                        "_serial": serial,
                    })
                rules.append({
                    "key": f"/reported/{point}/state",
                    "kind": "state", "targetId": target,
                    "valueMap": [
                        {"raw": "ONLINE", "code": 1, "label": "ONLINE"},
                        {"raw": "OFFLINE", "code": 0, "label": "OFFLINE"},
                    ],
                    "evidence": "Simulated LAB BFDB breaker state, not a physical breaker alarm",
                    "_serial": serial,
                })
    output = []
    for serial in SERIALS:
        scoped = [{k: v for k, v in rule.items() if k != "_serial"}
                  for rule in rules if rule["_serial"] == serial]
        assert len(scoped) == 480
        assert len({r["key"] for r in scoped}) == len(scoped)
        output.append({
            "sourceIdentity": serial, "protocol": "MQTT",
            "version": "site-mapper-lab-96x5-v1",
            "staleMs": 90000, "rules": scoped,
        })
    return output


def write_atomic(path, text):
    fd, temp = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="Back up and update the existing three lab profile/overlay/env files")
    args = parser.parse_args()
    profiles_path = LAB / "profiles.json"
    # The operator's actual application belongs to Compose project
    # appm-site-mapper and was started with existing-compose.json.
    # The isolated compose.json/lab.env pair belongs to a DIFFERENT project.
    env_path = LAB / "existing.env"
    compose_path = LAB / "existing-compose.json"
    for path in (profiles_path, env_path, compose_path):
        if not path.is_file():
            parser.error("Existing industrial-lab config missing: " + str(path))
        if path.is_symlink():
            parser.error("Refusing to follow symlinked config: " + str(path))
    current = json.loads(profiles_path.read_text(encoding="utf-8"))
    assert isinstance(current, list), "Expected existing array of approved profiles"
    assert any(p.get("sourceIdentity") == "EMU-BFDB-02" for p in current)
    assert any(p.get("sourceIdentity") == "EMU-BFDB-03" for p in current)
    existing = {(p.get("protocol"), p.get("sourceIdentity")): p for p in current}
    assert len(existing) == len(current), "Duplicate pre-existing profile identities"
    staged = validated_profiles(read_mongo())
    changes = []
    for p in staged:
        key = (p["protocol"], p["sourceIdentity"])
        if key in existing:
            assert existing[key] == p, (
                "LAB profile already exists with different rules: refusing replacement " + p["sourceIdentity"]
            )
        else:
            changes.append(p)
    combined = current + changes
    compose = json.loads(compose_path.read_text(encoding="utf-8"))
    assert isinstance(compose, dict) and isinstance(compose.get("services"), dict)
    service = compose["services"].get("site-mapper")
    assert isinstance(service, dict), "Missing site-mapper overlay service"
    assert isinstance(service.get("environment"), dict), "Missing Site Mapper environment"
    assert isinstance(service.get("volumes"), list), "Missing Site Mapper volume list"
    assert service["environment"].get("MQTT_BROKER_URL") == "mqtt://lab-mosquitto:1883", (
        "Active existing-stack overlay does not use the expected isolated LAB MQTT broker"
    )
    assert any(v.endswith(":/config/logical.json:ro") for v in service["volumes"]
               if isinstance(v, str)), "Existing overlay is missing its canonical logical-points mount"
    assert any(re.fullmatch(r"MONGODB_DB_NAME=['\"]?" + re.escape(DB) + r"['\"]?",
                            line.strip()) for line in env_path.read_text(encoding="utf-8").splitlines()), (
        "existing.env does not select the exact preserved acceptance database"
    )
    target_mount = str(profiles_path) + ":/config/industrial-profiles.json:ro"
    existing_mounts = [v for v in service["volumes"]
                       if isinstance(v, str) and "/config/industrial-profiles.json" in v]
    assert not existing_mounts or existing_mounts == [target_mount], (
        "Unexpected pre-existing industrial profiles volume mount"
    )
    service["environment"]["INDUSTRIAL_PROFILES_FILE"] = "/config/industrial-profiles.json"
    expected = [x.strip() for x in service["environment"].get("MQTT_EXPECTED_SOURCES", "").split(",")
                if x.strip()]
    for serial in SERIALS:
        if serial not in expected:
            expected.append(serial)
    service["environment"]["MQTT_EXPECTED_SOURCES"] = ",".join(expected)
    if not existing_mounts:
        service["volumes"].append(target_mount)
    next_compose = json.dumps(compose, ensure_ascii=True, indent=2) + "\n"
    lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
    indexes = [i for i, line in enumerate(lines)
               if line.startswith("INDUSTRIAL_PROFILES_JSON=")]
    assert len(indexes) == 1, "Expected exactly one INDUSTRIAL_PROFILES_JSON in lab.env"
    # Keep the required legacy env key small; file-backed rules take precedence.
    next_lines = list(lines)
    next_lines[indexes[0]] = "INDUSTRIAL_PROFILES_JSON='[]'\n"
    next_env = "".join(next_lines)
    print("SITE MAPPER / INDUSTRIAL LAB PROFILES")
    print("Original profiles preserved:", len(current))
    print("New LAB sources:", ", ".join(x["sourceIdentity"] for x in changes) or "none")
    for p in staged:
        print(p["sourceIdentity"] + ": " + str(len(p["rules"])) +
              " profile rules = 96 breakers x (U1,I1,P1,EP1,state)")
    print("Secondary U2/I2/P2/EP2 fields intentionally remain raw/UNINTERPRETED.")
    if not args.apply:
        print("PLAN ONLY: 0 filesystem/DB writes. --apply edits 3 config files, no restart.")
        return
    current_compose = compose_path.read_text(encoding="utf-8")
    current_env = env_path.read_text(encoding="utf-8")
    if (not changes and current_compose == next_compose
            and current_env == next_env):
        print("ALREADY PREPARED: no configuration changes.")
        return
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    for path in (profiles_path, compose_path, env_path):
        backup = path.with_name(path.name + ".before-lab-" + timestamp)
        if backup.exists():
            raise RuntimeError("Backup already exists, retry later: " + str(backup))
        shutil.copy2(path, backup)
        backup.chmod(0o600)
    write_atomic(profiles_path, json.dumps(combined, indent=2, ensure_ascii=True) + "\n")
    write_atomic(compose_path, next_compose)
    write_atomic(env_path, next_env)
    print("CONFIG WRITTEN (3 files; private backups saved alongside).")
    print("The current Site Mapper container still has OLD startup profiles.")
    print("This stages appm-site-mapper's actual existing-compose.json + existing.env.")
    print("Recreate ONLY Site Mapper after a verified Compose config/secret comparison; no auto-restart.")
    print("No source mappings, Mongo documents, Modbus points, SNMP settings or original profiles changed.")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, RuntimeError, ValueError, OSError,
            json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
        print("BLOCKED:", str(exc), file=sys.stderr)
        sys.exit(1)
