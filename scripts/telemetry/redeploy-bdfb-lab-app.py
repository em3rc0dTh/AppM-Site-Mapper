#!/usr/bin/env python3
"""Safely re-create ONLY Site Mapper app for LAB-BDFB-02/03 industrial profiles.

Read-only preflight:
  python3 scripts/telemetry/redeploy-bdfb-lab-app.py
Explicit app-only rebuild:
  python3 scripts/telemetry/redeploy-bdfb-lab-app.py --apply

Never recreates Mongo, TimescaleDB, modbus-tcp, broker or emulators; no
volume deletion/seed, no changed credentials. Requires prepared original
existing-stack overlay and fresh post-commissioning backups verified by user.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
LAB=ROOT/".runtime"/"industrial-lab"
PROJECT="appm-site-mapper"
APP=PROJECT+"-site-mapper-1"
DB_NAME="site_mapper_crud_acceptance_02"
FILES=[
    ROOT/"docker-compose.telemetry.yml",
    ROOT/"docker-compose.industrial.yml",
    LAB/"existing-compose.json",
]
ENV_FILES=[ROOT/".env",LAB/"existing.env"]
PROFILES=LAB/"profiles.json"
LAB_SERIALS={"LAB-BDFB-02","LAB-BDFB-03"}
PROTECTED_APP_ENV={
    "APP_ENV","APP_PERSISTENCE","MONGODB_URI","MONGODB_DB_NAME",
    "BOOTSTRAP_ADMIN_TOKEN","TELEMETRY_STORE_TOKEN",
    "MODBUS_BRIDGE_TOKEN","MODBUS_SOURCE_UNITS_JSON",
    "TELEMETRY_STORE_URL","MODBUS_BRIDGE_URL",
    "INDUSTRIAL_INGEST_SOURCES_JSON","INDUSTRIAL_PROJECTION_TOKEN",
    "SNMP_INGEST_TOKEN","SNMP_INGEST_SOURCES_JSON",
    "SNMP_TRAP_SOURCES_JSON","SNMP_TRAP_ENGINE_ID",
    "INDUSTRIAL_TIMESCALE_ENABLED","INDUSTRIAL_MQTT_SPOOL",
    "MQTT_BROKER_URL","MQTT_TOPIC_FILTER","MQTT_TOPIC_PREFIX",
}
PROTECTED_SERVICES={
    "mongodb":("MONGODB_DB_NAME",),
    "timescaledb":("POSTGRES_DB","POSTGRES_USER","POSTGRES_PASSWORD"),
    "telemetry-store":("TIMESCALE_DSN","TELEMETRY_STORE_TOKEN"),
    "modbus-tcp":("MODBUS_BRIDGE_TOKEN","MODBUS_SOURCE_UNITS_JSON","MODBUS_POINT_LAYOUT"),
}
EXPECTED_SOURCE_BINDING_COUNTS={"LAB-BDFB-02":385,"LAB-BDFB-03":385}


def check(ok, detail):
    if not ok:
        raise RuntimeError("REFUSED: "+detail)


def run(args, *, env=None):
    result=subprocess.run(args,capture_output=True,text=True,timeout=2400,
                          env=env,check=False)
    if result.returncode:
        raise RuntimeError("REFUSED: subprocess failed ("+
                           args[0]+" "+args[1]+") exit="+str(result.returncode))
    return result.stdout


def inspect(name):
    rows=json.loads(run(["docker","inspect",name]))
    check(len(rows)==1,"Docker object not uniquely resolved: "+name)
    return rows[0]


def env_dict(obj):
    return dict(value.split("=",1) for value in
                obj.get("Config",{}).get("Env",[]) if "=" in value)


def compose_env():
    forbidden=set()
    for path in ENV_FILES:
        for line in path.read_text(encoding="utf-8").splitlines():
            match=re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=",line.strip())
            if match:
                forbidden.add(match.group(1))
    return {key:value for key,value in os.environ.items() if key not in forbidden}


def args_compose():
    return ["docker","compose","--project-name",PROJECT,
            "--project-directory",str(ROOT),
            "--env-file",str(ENV_FILES[0]),"--env-file",str(ENV_FILES[1]),
            "-f",str(FILES[0]),"-f",str(FILES[1]),"-f",str(FILES[2])]


def check_app_mounts(original,configured):
    existing={m.get("Destination"):m for m in original.get("Mounts",[])}
    proposed={v.get("target"):v for v in configured.get("volumes",[])
              if isinstance(v,dict)}
    for target,current in existing.items():
        candidate=proposed.get(target)
        check(candidate is not None,"Original Site Mapper mount missing: "+str(target))
        if current.get("Type")=="volume":
            check(candidate.get("type")=="volume" and
                  candidate.get("source")==current.get("Name"),
                  "Site Mapper named volume changed at "+str(target))
        elif current.get("Type")=="bind":
            check(candidate.get("type")=="bind" and
                  candidate.get("source")==current.get("Source"),
                  "Site Mapper bind mount changed at "+str(target))
    mounted=proposed.get("/config/industrial-profiles.json")
    check(mounted is not None and mounted.get("type")=="bind" and
          mounted.get("read_only") is True and
          mounted.get("source")==str(PROFILES),
          "New file-backed profiles are not mounted at the correct read-only path")


def preflight():
    for file in FILES+ENV_FILES+[PROFILES]:
        check(file.is_file() and not file.is_symlink(),
              "Original required config missing or symlinked: "+str(file))
    profiles=json.loads(PROFILES.read_text(encoding="utf-8"))
    check(isinstance(profiles,list),"profiles.json is not a list")
    labprofiles={p.get("sourceIdentity"):p for p in profiles
                 if isinstance(p,dict) and p.get("sourceIdentity") in LAB_SERIALS}
    check(set(labprofiles)==LAB_SERIALS and
          all(p.get("protocol")=="MQTT" and len(p.get("rules",[]))==480
              for p in labprofiles.values()),
          "Expected 2 LAB industrial source profiles with 480 rules each")
    original=inspect(APP)
    labels=original.get("Config",{}).get("Labels",{})
    check(labels.get("com.docker.compose.project")==PROJECT,
          "Original Site Mapper Compose project mismatch")
    configs=labels.get("com.docker.compose.project.config_files","").split(",")
    check(configs==[str(path) for path in FILES],
          "Current Site Mapper service is not running the exact expected 3 Compose files")
    check(original.get("State",{}).get("Running") is True,
          "Current Site Mapper application is not running")
    old_env=env_dict(original)
    check(old_env.get("MONGODB_DB_NAME")==DB_NAME,
          "Original Site Mapper database mismatch")

    configuration=json.loads(run(args_compose()+["config","--format","json"],
                                 env=compose_env()))
    check(configuration.get("name")==PROJECT,
          "Resolved compose project mismatch")
    new_app=configuration.get("services",{}).get("site-mapper")
    check(isinstance(new_app,dict),"Resolved Site Mapper service missing")
    new_env={key:str(value) for key,value in new_app.get("environment",{}).items()}
    changed=[]
    for key in sorted(PROTECTED_APP_ENV):
        if old_env.get(key)!=new_env.get(key):
            changed.append(key)
    check(not changed,"App secrets/critical config would change: "+", ".join(changed))
    check(new_env.get("INDUSTRIAL_PROFILES_FILE")=="/config/industrial-profiles.json",
          "INDUSTRIAL_PROFILES_FILE missing from resolved app config")
    check(new_env.get("INDUSTRIAL_PROFILES_JSON")=="[]",
          "Large legacy JSON env must be replaced by [] fallback")
    check_app_mounts(original,new_app)

    for service,keys in PROTECTED_SERVICES.items():
        name=PROJECT+"-"+service+"-1"
        obj=inspect(name)
        check(obj.get("State",{}).get("Running") is True,
              "Original dependent service not running: "+service)
        labels=obj.get("Config",{}).get("Labels",{})
        check(labels.get("com.docker.compose.project")==PROJECT,
              "Dependent container belongs to another Compose project: "+service)
        configured=configuration.get("services",{}).get(service)
        check(isinstance(configured,dict),"Dependent service config missing: "+service)
        original_env=env_dict(obj)
        candidate={key:str(value) for key,value in configured.get("environment",{}).items()}
        for key in keys:
            if key in original_env or key in candidate:
                check(original_env.get(key)==candidate.get(key),
                      "Dependent service config changed: "+service+"."+key)
        if service=="mongodb":
            check(any(m.get("Destination")=="/data/db" and
                      m.get("Name")==PROJECT+"_site_mapper_mongo_data"
                      for m in obj.get("Mounts",[])),
                  "Original MongoDB persistent volume changed")
        if service=="timescaledb":
            check(any(m.get("Destination")=="/var/lib/postgresql/data" and
                      m.get("Name")==PROJECT+"_site_mapper_timescale_data"
                      for m in obj.get("Mounts",[])),
                  "Original TimescaleDB persistent volume changed")
    check(old_env.get("MQTT_TOPIC_FILTER")=="data/dev/#",
          "Unexpected active MQTT subscription")
    print("PRECHECK PASSED: active project and overlays confirmed.")
    print("Original database, credentials, dependent services and persistent mounts match.")
    print("Both LAB profiles contain 480 explicit rules and will be read from a mounted file.")
    print("Only app environment changes: industrial profile file + LAB expected source list.")
    print("No other service will be addressed by the deployment command.")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply",action="store_true",
                        help="After verified fresh DB backup, rebuild/recreate ONLY site-mapper")
    args=parser.parse_args()
    preflight()
    if not args.apply:
        print("PLAN ONLY: no Docker service recreated, no config or DB writes.")
        return
    print("APPLY: building and recreating Site Mapper ONLY with --no-deps",flush=True)
    # Avoid stdout from Compose config which can include local secrets.
    run(args_compose()+[
        "up","-d","--build","--no-deps","--force-recreate","site-mapper",
    ],env=compose_env())
    print("APP RECREATED (appm-site-mapper-site-mapper-1).")
    print("Re-run diagnose-bdfb-lab-ingress.py to verify runtime profiles.")
    print("MongoDB, TimescaleDB, broker, MODBUS and SNMP services were NOT targeted.")


if __name__=="__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError,
            json.JSONDecodeError, subprocess.TimeoutExpired) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
