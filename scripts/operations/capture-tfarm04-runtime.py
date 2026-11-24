#!/usr/bin/env python3
"""Read-only runtime inventory; not a backup. Never serialize raw environments."""
import argparse
import datetime
import hashlib
import io
import json
import os
import pathlib
import re
import subprocess
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", required=True, type=pathlib.Path)
parser.add_argument("--project", default="appm-site-mapper")
args = parser.parse_args()
root = pathlib.Path.cwd()
errors = []
report = {"schemaVersion": 1, "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "project": args.project, "scope": "PRIVATE_OPERATIONAL_INVENTORY_NOT_BACKUP"}

def run(label, command, timeout=20):
    try:
        p = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=timeout, check=False)
        if p.returncode != 0:
            errors.append({"check": label, "exit": p.returncode})
            return None
        return p.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        errors.append({"check": label, "error": "unavailable_or_timeout"})
        return None

def json_run(label, command, timeout=20):
    raw = run(label, command, timeout)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        errors.append({"check": label, "error": "invalid_json"})
        return None

def parse_json(value):
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return None

def select(obj, keys):
    return {k: obj[k] for k in keys if k in obj} if isinstance(obj, dict) else {}

def env_map(values):
    return dict(item.split("=", 1) for item in values or [] if "=" in item)

def env_file(path):
    result = {}
    if not path.is_file():
        return result
    for line in path.read_text(errors="replace").splitlines():
        m = re.match(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$", line)
        if m:
            value = m.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            result[m.group(1)] = value
    return result

# Explicit allowlist: no arbitrary env, URLs, credentials, command lines or logs.
SAFE = set("""APP_ENV APP_PERSISTENCE MONGODB_DB_NAME SITE_MAPPER_SEED_PROFILE
SITE_MAPPER_INTEGRATION_PROFILE TELEMETRY_ENABLED TELEMETRY_HISTORY_ENABLED
TELEMETRY_WATCH_MODE TELEMETRY_WATCH_LOSS_AFTER_MS TELEMETRY_WATCH_RECOVERY_SAMPLES
MQTT_CLIENT_ID MQTT_TOPIC_FILTER MQTT_TOPIC_PREFIX MQTT_LAN_BIND_HOST MQTT_LAN_PORT
INDUSTRIAL_TIMESCALE_ENABLED INDUSTRIAL_RETENTION_DAYS
SNMP_VERSION SNMP_REAL_VERSION SNMP_CONTROLLER_HOST SNMP_CONTROLLER_PORT
SNMP_CONTROLLER_ID SNMP_POLL_INTERVAL_MS SNMP_QDF2_HOST SNMP_QDF2_PORT SNMP_QDF2_ID
SNMP_QDF4_HOST SNMP_QDF4_PORT SNMP_QDF4_ID SNMP_QDF5_HOST SNMP_QDF5_PORT SNMP_QDF5_ID
SNMP_TRAP_HOST_BIND SNMP_TRAP_HOST_PORT SNMP_TRAP_BIND_HOST SNMP_TRAP_PORT
SNMP_TRAP_MAX_PENDING MODBUS_CLIENT_BIND_HOST MODBUS_CLIENT_PORT MODBUS_BIND_HOST
MODBUS_BIND_PORT MODBUS_POINT_LAYOUT MODBUS_MISSING_POLICY MODBUS_STALE_MS
POSTGRES_DB""".split())

def safe_env(env):
    out = {k: env[k] for k in sorted(SAFE & env.keys())}
    sources = parse_json(env.get("SNMP_TRAP_SOURCES_JSON"))
    if isinstance(sources, list):
        out["SNMP_TRAP_SOURCES_JSON"] = []
        for source in sources:
            if not isinstance(source, dict):
                continue
            item = select(source, ("sourceIdentity", "address", "version"))
            if isinstance(source.get("poll"), dict):
                item["poll"] = select(source["poll"], ("method", "port", "intervalMs", "oids"))
            out["SNMP_TRAP_SOURCES_JSON"].append(item)
    elif "SNMP_TRAP_SOURCES_JSON" in env:
        out["SNMP_TRAP_SOURCES_JSON_parse_failed"] = True
    units = parse_json(env.get("MODBUS_SOURCE_UNITS_JSON"))
    if isinstance(units, dict):
        out["MODBUS_SOURCE_UNITS_JSON"] = {k: v for k, v in units.items()
            if isinstance(v, int) and not isinstance(v, bool)}
    for key in ("INDUSTRIAL_PROFILES_JSON", "INDUSTRIAL_INGEST_SOURCES_JSON",
                "SNMP_INGEST_SOURCES_JSON", "SNMP_FEED_POINTS_JSON"):
        if key in env:
            val = parse_json(env[key])
            out[key + "_entry_count"] = len(val) if isinstance(val, (dict, list)) else None
    out["other_variable_names"] = sorted(set(env) - SAFE)
    return out

git = ["git", "-c", "safe.directory=" + str(root)]
report["git"] = {
    "head": run("git_head", git + ["rev-parse", "HEAD"]),
    "branch": run("git_branch", git + ["branch", "--show-current"]),
    "status": run("git_status", git + ["status", "--short"]),
}
report["configuration_files"] = []
for path in sorted(root.glob("docker-compose*.yml")):
    report["configuration_files"].append({"name": path.name,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
runtime = env_file(root / ".runtime/office-test.env")
report["runtime_file"] = {"present": bool(runtime), "configuration": safe_env(runtime)}

report["host"] = {}
for key, command in {
    "hostname": ["hostname"], "kernel": ["uname", "-r"], "architecture": ["uname", "-m"],
    "cpu": ["lscpu"], "memory": ["free", "-b"], "filesystem": ["df", "-PT", "/"],
    "dockerVersion": ["docker", "--version"], "composeVersion": ["docker", "compose", "version"],
    "interfaces": ["ip", "-br", "address"], "routes": ["ip", "-4", "route", "show", "table", "all"],
    "bridge": ["bridge", "link", "show"],
    "networkDevices": ["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"],
    "connections": ["nmcli", "-t", "-f", "NAME,UUID,TYPE,DEVICE,AUTOCONNECT", "connection", "show"],
    "listeningPorts": ["ss", "-H", "-lntu"],
}.items():
    report["host"][key] = run(key, command)

report["host"]["services"] = {}
for name in ("docker", "NetworkManager", "systemd-networkd", "kea-dhcp4-server",
             "cloudflared", "anydesk", "libvirtd"):
    values = {}
    for action in ("is-active", "is-enabled"):
        # systemctl returns nonzero for normal inactive/disabled states.
        try:
            p = subprocess.run(["systemctl", action, name], text=True,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10)
            values[action] = p.stdout.strip() or "unknown"
        except (OSError, subprocess.TimeoutExpired):
            values[action] = "unknown"
    report["host"]["services"][name] = values

# NetworkManager's selected connection fields exclude PSK and other authentication data.
report["host"]["bridgeProfile"] = run("bridge_profile", ["nmcli", "-t", "-f",
    "connection.id,connection.interface-name,connection.autoconnect,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.never-default",
    "connection", "show", "br-lab"])
report["host"]["dhcpConfigFiles"] = []
for path in (pathlib.Path("/etc/kea/kea-dhcp4.conf"), pathlib.Path("/etc/netplan")):
    if path.is_file():
        report["host"]["dhcpConfigFiles"].append(str(path))
    elif path.is_dir():
        report["host"]["dhcpConfigFiles"].extend(str(p) for p in sorted(path.glob("*.yaml")))

ids = run("docker_project_containers", ["docker", "ps", "-aq", "--filter",
          "label=com.docker.compose.project=" + args.project])
containers = json_run("docker_inspect", ["docker", "inspect", *ids.split()]) if ids else []
report["containers"] = []
services = {}
for item in containers or []:
    config = item.get("Config", {})
    labels = config.get("Labels") or {}
    service = labels.get("com.docker.compose.service", "")
    services[service] = item
    host = item.get("HostConfig") or {}
    state = item.get("State") or {}
    image_id = item.get("Image")
    image = json_run("image_" + service, ["docker", "image", "inspect", image_id]) if image_id else []
    report["containers"].append({
        "service": service, "name": item.get("Name"), "image": config.get("Image"),
        "imageId": image_id, "repoDigests": (image or [{}])[0].get("RepoDigests"),
        "state": select(state, ("Status", "Running", "ExitCode", "StartedAt")),
        "health": (state.get("Health") or {}).get("Status"),
        "composeFiles": labels.get("com.docker.compose.project.config_files"),
        "restartPolicy": host.get("RestartPolicy"),
        "resources": select(host, ("Memory", "MemorySwap", "NanoCpus", "CpuQuota", "CpuPeriod", "CpusetCpus", "PidsLimit")),
        "ports": (item.get("NetworkSettings") or {}).get("Ports"),
        "mounts": [select(m, ("Type", "Name", "Source", "Destination", "RW")) for m in item.get("Mounts", [])],
        "configuration": safe_env(env_map(config.get("Env"))),
    })
report["volumes"] = run("volumes", ["docker", "volume", "ls", "--filter",
    "label=com.docker.compose.project=" + args.project, "--format", "{{.Name}}"])

# Read only the declared controller attributes and estimated collection sizes.
app = services.get("site-mapper", {})
db = env_map((app.get("Config") or {}).get("Env")).get("MONGODB_DB_NAME")
mongo = services.get("mongodb", {})
if mongo.get("State", {}).get("Running") and db and re.fullmatch(r"[A-Za-z0-9_-]{1,63}", db):
    query = """const c=db.getCollection('topology_nodes');
const names=db.getCollectionNames();
const wanted=['topology_nodes','power_paths','telemetry_bindings','users','industrial_events','industrial_signals','industrial_signal_history','industrial_sources','industrial_timescale_outbox','industrial_delivery_status','industrial_logical_registry'];
const counts={}; for(const n of wanted) if(names.includes(n)) counts[n]=db.getCollection(n).estimatedDocumentCount();
const profiles=c.find({'attributes.snmpControllerProfile':{$exists:true}},{_id:0,id:1,name:1,'attributes.snmpControllerProfile':1,'attributes.snmpTrapSourceIdentities':1}).limit(500).toArray();
print(JSON.stringify({counts,profiles}));"""
    data = json_run("mongo_metadata", ["docker", "exec", mongo["Id"], "mongosh",
        "--quiet", db, "--eval", query], 45)
    if isinstance(data, dict):
        profiles = []
        for node in data.get("profiles", []):
            attrs = node.get("attributes") or {}
            profile = attrs.get("snmpControllerProfile") or {}
            safe = select(profile, ("schemaVersion", "title", "sourceIdentity"))
            safe["signals"] = [select(s, ("oid", "label", "displayMode", "metric")) for s in profile.get("signals", [])]
            balance = profile.get("balance")
            if isinstance(balance, dict):
                safe["balance"] = select(balance, ("method", "totalOid", "branchOid", "voltageOid", "branchStatusOid"))
                safe["balance"]["normalization"] = select(balance.get("normalization"),
                    ("totalCurrentScale", "branchCurrentScale", "voltageScale"))
            profiles.append({"id": node.get("id"), "name": node.get("name"), "profile": safe,
                "trapSources": attrs.get("snmpTrapSourceIdentities")})
        report["mongo"] = {"database": db, "estimatedCounts": data.get("counts"), "controllerProfiles": profiles}
else:
    errors.append({"check": "mongo_metadata", "error": "database_or_running_container_not_identified"})

pg = services.get("timescaledb", {})
if pg.get("State", {}).get("Running"):
    report["timescale"] = run("timescale_metadata", ["docker", "exec", pg["Id"], "psql",
        "-X", "-At", "-v", "ON_ERROR_STOP=1", "-U", "site_mapper", "-d", "site_mapper_telemetry",
        "-c", "SELECT version(); SELECT extname, extversion FROM pg_extension; SELECT schemaname,relname,n_live_tup FROM pg_stat_user_tables ORDER BY 1,2;"], 30)
else:
    errors.append({"check": "timescale_metadata", "error": "container_not_running"})

report["captureWarnings"] = errors
report["limitations"] = ["No database dump, secrets, raw logs, queue contents or full network configuration.",
    "Runtime file parsing is best-effort; container configuration is the effective running configuration.",
    "Internal addresses, identifiers and operational labels are private information.",
    "Collection counts are estimates; service health is not end-to-end acceptance."]
payload = json.dumps(report, indent=2, ensure_ascii=False).encode("utf-8")
stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
out = args.output / ("SiteMapper-TFARM04-Runtime-" + stamp + ".tar.gz")
os.umask(0o077)
with out.open("xb") as file:
    with tarfile.open(fileobj=file, mode="w:gz") as tar:
        for name, data in [("runtime-inventory.json", payload),
            ("SHA256SUMS", (hashlib.sha256(payload).hexdigest() + "  runtime-inventory.json\n").encode())]:
            info = tarfile.TarInfo(name)
            info.mode = 0o600
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    if "SUDO_UID" in os.environ and "SUDO_GID" in os.environ:
        os.fchown(file.fileno(), int(os.environ["SUDO_UID"]), int(os.environ["SUDO_GID"]))
print("CAPTURE_COMPLETE" if not errors else "CAPTURE_COMPLETE_WITH_WARNINGS")
print("Warnings:", len(errors))
print("Archive:", out)
