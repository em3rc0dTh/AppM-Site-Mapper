#!/usr/bin/env python3
"""Additive Modbus LAB Unit ID 4/5 commissioning for ORIGINAL Site Mapper.

Default: read-only plan. --stage: back up and modify existing-compose.json
ONLY (no restarts). --deploy: explicit two-service (--no-deps --no-build)
recreation, requiring clean queues, stopped LAB publisher and verified backup.

Never edits .env, existing.env, industrial profiles, MongoDB, TimescaleDB,
SNMP, or source assignments for existing Unit IDs 1/2/3.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PROJECT="appm-site-mapper"
LAB=ROOT/".runtime"/"industrial-lab"
OVERLAY=LAB/"existing-compose.json"
FILES=(ROOT/"docker-compose.telemetry.yml",ROOT/"docker-compose.industrial.yml",OVERLAY)
ENV=(ROOT/".env",LAB/"existing.env")
APP=PROJECT+"-site-mapper-1"
BRIDGE=PROJECT+"-modbus-tcp-1"
MONGO=PROJECT+"-mongodb-1"
ORIGINAL={"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3}
ADDITIVE={"LAB-BDFB-02":4,"LAB-BDFB-03":5}
PROPOSED={**ORIGINAL,**ADDITIVE}


def require(condition, reason):
    if not condition: raise RuntimeError("COMMISSION BLOCKED: "+reason)


def run(argv, *, env=None, timeout=75):
    result=subprocess.run(argv,capture_output=True,text=True,env=env,
                          check=False,timeout=timeout)
    if result.returncode:
        raise RuntimeError("COMMISSION BLOCKED: "+argv[0]+
                           " operation exit="+str(result.returncode))
    return result.stdout.strip()


def inspect(name, *, targeted=True):
    """Verify running service identity. Pin Compose provenance only for targets.

    Mongo and Timescale are never recreated: their historical Compose
    labels may contain legitimate overlays not in the app/bridge stack.
    Their exact named volumes are verified separately in deploy().
    """
    rows=json.loads(run(["docker","inspect",name]))
    require(len(rows)==1,"ambiguous/missing "+name)
    node=rows[0]
    require(node.get("State",{}).get("Running") is True,"service not running "+name)
    labels=node.get("Config",{}).get("Labels",{})
    require(labels.get("com.docker.compose.project")==PROJECT,
            "container belongs to another Compose project")
    service=name.removeprefix(PROJECT+"-").removesuffix("-1")
    require(labels.get("com.docker.compose.service")==service,
            "service identity label changed for "+name)
    require(labels.get("com.docker.compose.project.working_dir")==str(ROOT),
            "Compose working directory changed for "+name)
    actual=labels.get("com.docker.compose.project.config_files","").split(",")
    require(bool(actual) and all(actual),
            "missing Compose config provenance for "+name)
    if targeted:
        require(name in (APP,BRIDGE),
                "only app/bridge may be treated as redeployment targets")
        expected=[str(p) for p in FILES]
        # Only a target to be recreated must originate from an exact,
        # approved ordered prefix of the expected current Compose files.
        approved=[expected[:i] for i in (1,2,3)]
        require(actual in approved,
                "unapproved Compose provenance for "+name+
                " (file count="+str(len(actual))+")")
        if name==APP:
            require(actual==expected,
                    "Site Mapper must have been recreated from the active existing-stack overlay")
        print("COMPOSE PROVENANCE OK "+service+" | approved files="+
              str(len(actual))+" | project="+PROJECT)
    else:
        require(name in (MONGO,PROJECT+"-timescaledb-1"),
                "non-target provenance exception limited to original databases")
        # Historical Compose file labels on preserved DB containers are
        # informational, not a request to redeploy those containers.
        # Keep identity + project + working directory checks above, and
        # enforce exact original persistent volume names in deploy().
        print("PRESERVED DATABASE "+service+" | historical Compose files="+
              str(len(actual))+" | persistent mount check required")
    return node


def env_of(node):
    return dict(v.split("=",1) for v in node.get("Config",{}).get("Env",[]) if "=" in v)


def source_map(raw):
    try: value=json.loads(raw)
    except (TypeError,ValueError) as err:
        raise RuntimeError("COMMISSION BLOCKED: malformed source map") from err
    require(isinstance(value,dict) and len(value)==len(set(value.values())),
            "duplicate source Unit IDs")
    require(all(isinstance(k,str) and
                re.fullmatch(r"[A-Za-z0-9_.:-]{1,120}",k) and
                type(v) is int and 1<=v<=247 for k,v in value.items()),
            "invalid Modbus source mapping")
    return value


def sanitized_environment():
    keys=set()
    for f in ENV:
        for line in f.read_text(encoding="utf8").splitlines():
            m=re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=",line.strip())
            if m: keys.add(m.group(1))
    return {k:v for k,v in os.environ.items() if k not in keys}


def compose():
    return ["docker","compose","--project-name",PROJECT,
            "--project-directory",str(ROOT),
            "--env-file",str(ENV[0]),"--env-file",str(ENV[1]),
            "-f",str(FILES[0]),"-f",str(FILES[1]),"-f",str(FILES[2])]


def compare_mounts(node, config, service):
    original={m["Destination"]:m for m in node.get("Mounts",[])}
    target={x["target"]:x for x in config.get("volumes",[]) if isinstance(x,dict)}
    require(set(original)==set(target),"volume/mount set changed for "+service)
    for destination,mount in original.items():
        candidate=target[destination]
        if mount.get("Type")=="bind":
            require(candidate.get("type")=="bind" and
                    candidate.get("source")==mount.get("Source"),
                    "bind mount changed: "+service+destination)
        elif mount.get("Type")=="volume":
            src=candidate.get("source")
            allowed={src,PROJECT+"_"+src} if isinstance(src,str) else set()
            require(candidate.get("type")=="volume" and mount.get("Name") in allowed,
                    "named volume changed: "+service+destination)
        else:
            require(False,"unsupported mount type in "+service)


def verify_backup(folder):
    require(folder is not None and folder.is_dir(),"--backup-dir is required for deploy")
    archive=folder/"mongodb-bdfb-lab.archive.gz"
    sums=folder/"SHA256SUMS"
    require(archive.is_file() and archive.stat().st_size>0 and sums.is_file(),
            "post-commission Mongo archive/checksums missing")
    recorded=[s.split()[0].lower() for s in sums.read_text(encoding="utf8").splitlines()
              if len(s.split())==2 and s.split()[1].lstrip("*")==archive.name]
    require(len(recorded)==1 and bool(re.fullmatch(r"[0-9a-f]{64}",recorded[0])),
            "Mongo backup digest missing")
    digest=hashlib.sha256()
    with archive.open("rb") as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b""): digest.update(chunk)
    require(digest.hexdigest()==recorded[0],"Mongo backup integrity check failed")


def queues():
    js="""const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const q=d.industrial_timescale_outbox;
print(JSON.stringify({pending:q.countDocuments({}),
retrying:q.countDocuments({lastFailureAt:{$exists:true}})}));"""
    result=run(["docker","exec",MONGO,"mongosh","--quiet","--eval",js])
    depth=json.loads(result.splitlines()[-1])
    capture="""const fs=require('node:fs');
const names=fs.readdirSync('/data/industrial-mqtt',{withFileTypes:true});
console.log(names.filter(e=>e.isFile()&&/^[a-f0-9-]{36}\\.json$/.test(e.name)).length);"""
    count=int(run(["docker","exec",APP,"node","-e",capture]).splitlines()[-1])
    return depth,count


def publisher_stopped():
    lines=run(["ps","-eo","args="]).splitlines()
    require(not any("publish-bdfb-lab-pair.py" in s and "--publish" in s and
                    "ps -eo" not in s for s in lines),
            "host LAB publisher still active; stop it first")


def inspect_core():
    for path in (*FILES,*ENV):
        require(path.is_file() and not path.is_symlink(),
                "original Compose/env file absent or symlinked: "+str(path))
    app,bridge=inspect(APP),inspect(BRIDGE)
    app_env,bridge_env=env_of(app),env_of(bridge)
    require(app_env.get("MONGODB_DB_NAME")=="site_mapper_crud_acceptance_02",
            "original MongoDB name differs")
    require(app_env.get("MODBUS_BRIDGE_URL")=="http://modbus-tcp:18082" and
            app_env.get("MODBUS_BRIDGE_TOKEN") and
            app_env.get("MODBUS_BRIDGE_TOKEN")==bridge_env.get("MODBUS_BRIDGE_TOKEN"),
            "original bridge URL/token differs")
    require(bridge_env.get("MODBUS_POINT_LAYOUT")=="panels-4x24",
            "original register layout differs")
    am,bm=source_map(app_env.get("MODBUS_SOURCE_UNITS_JSON")),source_map(
        bridge_env.get("MODBUS_SOURCE_UNITS_JSON"))
    # Bridge-only transition is explicitly allowed: the application keeps
    # ingesting MQTT with its original mapping while the gateway activates
    # the new two LAB Unit IDs. No other app/bridge drift is accepted.
    require((am,bm) in (
        (ORIGINAL,ORIGINAL),(ORIGINAL,PROPOSED),(PROPOSED,PROPOSED)),
        "unexpected application/bridge source-map drift")
    overlay=json.loads(OVERLAY.read_text(encoding="utf8"))
    services=overlay.get("services",{}) if isinstance(overlay,dict) else {}
    require(isinstance(services,dict),"invalid existing Compose overlay")
    require(services.get("site-mapper",{}).get("environment",{}).get(
            "MQTT_BROKER_URL")=="mqtt://lab-mosquitto:1883",
            "existing industrial MQTT broker changed")
    for name in ("site-mapper","modbus-tcp"):
        scoped=services.get(name,{})
        require(isinstance(scoped,dict) and
                isinstance(scoped.get("environment",{}),dict),
                "invalid "+name+" overlay")
        override=scoped.get("environment",{}).get("MODBUS_SOURCE_UNITS_JSON")
        if override is not None:
            require(source_map(override) in (am,PROPOSED),
                    "unexpected source override in "+name)
    return app,bridge,am,overlay


def stage(overlay,map_before,apply):
    for name in ("site-mapper","modbus-tcp"):
        service=overlay["services"].setdefault(name,{})
        service.setdefault("environment",{})["MODBUS_SOURCE_UNITS_JSON"]=json.dumps(
            PROPOSED,separators=(",",":"))
    desired=json.dumps(overlay,indent=2,ensure_ascii=True)+"\n"
    current=OVERLAY.read_text(encoding="utf8")
    print("ACTIVE ORIGINAL:",json.dumps(map_before,sort_keys=True))
    print("ADD:",json.dumps(ADDITIVE,sort_keys=True))
    if not apply:
        print("READ-ONLY PLAN: "+("already staged" if current==desired else "not yet staged"))
        return
    if current==desired:
        print("ALREADY STAGED, 0 changes")
        return
    now=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup=OVERLAY.with_name("existing-compose.json.before-lab-modbus-"+now)
    require(not backup.exists(),"private backup file already exists")
    shutil.copy2(OVERLAY,backup)
    backup.chmod(0o600)
    fd,tmp=tempfile.mkstemp(prefix="existing-compose.",suffix=".tmp",dir=OVERLAY.parent)
    try:
        with os.fdopen(fd,"w",encoding="utf8") as output:
            os.fchmod(output.fileno(),0o600)
            output.write(desired)
            output.flush()
            os.fsync(output.fileno())
        os.replace(tmp,OVERLAY)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
    print("CONFIG STAGED WITH PRIVATE BACKUP: "+str(backup))
    print("No services restarted; no original .env or existing.env edited")


def safe_deploy_config(original_app, original_bridge):
    """Resolve the exact active project and ensure the only env delta is Unit IDs.

    Both services are validated even when deploying only the bridge, so a
    future app recreation can safely adopt the already staged configuration.
    """
    final=json.loads(run(compose()+["config","--format","json"],
                         env=sanitized_environment()))
    require(final.get("name")==PROJECT,"Compose project differs")
    services=final.get("services",{})
    for name,node in (("site-mapper",original_app),("modbus-tcp",original_bridge)):
        conf=services.get(name)
        require(isinstance(conf,dict),"service missing: "+name)
        en={k:str(v) for k,v in conf.get("environment",{}).items()}
        require(source_map(en.get("MODBUS_SOURCE_UNITS_JSON"))==PROPOSED,
                "staged source map not additive: "+name)
        previous=env_of(node)
        unexpected=[k for k,v in en.items()
                    if k!="MODBUS_SOURCE_UNITS_JSON" and previous.get(k)!=v]
        require(not unexpected,
                "unexpected changes in "+name+": "+", ".join(unexpected))
        compare_mounts(node,conf,name)
    return services


def original_data_volumes():
    mongo,timescale=inspect(MONGO,targeted=False),inspect(
        PROJECT+"-timescaledb-1",targeted=False)
    require(any(m.get("Destination")=="/data/db" and
                m.get("Name")==PROJECT+"_site_mapper_mongo_data"
                for m in mongo.get("Mounts",[])),
            "original Mongo volume differs")
    require(any(m.get("Destination")=="/var/lib/postgresql/data" and
                m.get("Name")==PROJECT+"_site_mapper_timescale_data"
                for m in timescale.get("Mounts",[])),
            "original Timescale volume differs")


def bridge_only(original_app, original_bridge, live_app_map, backup):
    """No Site Mapper downtime: its durable historian continues to run.

    Bridge TCP state is transient and will repopulate from the next
    explicitly bound, accepted breaker readings. Never touches Mongo outbox.
    """
    safe_deploy_config(original_app,original_bridge)
    original_data_volumes()
    require(live_app_map in (ORIGINAL,PROPOSED),"application Unit map changed")
    active=source_map(env_of(original_bridge).get("MODBUS_SOURCE_UNITS_JSON"))
    if active==PROPOSED:
        print("BRIDGE ALREADY DEPLOYED: Units 1/2/3 preserved, LAB 4/5 active")
        print("Application Unit env may still be original; MQTT forwarding continues.")
        return
    require(active==ORIGINAL and live_app_map==ORIGINAL,
            "bridge-only applies only to the original 3-source baseline")
    if backup is None:
        print("BRIDGE-ONLY PRECHECK PASSED: staged map changes only gateway Unit IDs.")
        print("No Site Mapper restart; Mongo/Timescale outbox may remain active.")
        print("READ-ONLY: add --backup-dir to deploy only modbus-tcp")
        return
    verify_backup(backup)
    # Directly before restart, recheck active bridge/auth/paths and that app
    # still has original map. No Timescale/MQTT drain requirement because
    # Site Mapper is NOT restarted and continues processing durable queues.
    current_app,current_bridge,app_map,_ = inspect_core()
    require(app_map==ORIGINAL and source_map(
        env_of(current_bridge).get("MODBUS_SOURCE_UNITS_JSON"))==ORIGINAL,
        "live source mapping changed during bridge preflight")
    safe_deploy_config(current_app,current_bridge)
    print("DEPLOY: recreating ONLY modbus-tcp (--no-deps --no-build)",flush=True)
    run(compose()+["up","-d","--no-deps","--no-build",
                   "--force-recreate","modbus-tcp"],
        env=sanitized_environment(),timeout=1200)
    final_bridge=inspect(BRIDGE)
    require(source_map(env_of(final_bridge).get("MODBUS_SOURCE_UNITS_JSON"))==PROPOSED,
            "gateway source map not commissioned; inspect before sending FC03")
    latest_app=inspect(APP)
    require(source_map(env_of(latest_app).get("MODBUS_SOURCE_UNITS_JSON"))==ORIGINAL,
            "original app environment unexpectedly changed")
    print("BRIDGE DEPLOY CONFIRMED: Units 1/2/3 preserved; LAB Units 4/5 added.")
    print("Site Mapper NOT recreated: MQTT ingest and Timescale historian stayed running.")
    print("App Unit map remains original until its later separate controlled reload.")
    print("FC03 LAB 4/5 comparison still required; no Metasys certification implied.")


def deploy(original_app,original_bridge,live_map,backup):
    require(live_map==ORIGINAL or live_map==PROPOSED,
            "unexpected active application mapping")
    safe_deploy_config(original_app,original_bridge)
    original_data_volumes()
    depth,capture=queues()
    print("DELIVERY QUEUES:",json.dumps(depth),"captureSpool="+str(capture))
    require(depth["pending"]==0 and depth["retrying"]==0 and capture==0,
            "pending history/capture items: let publisher stop and queues drain")
    publisher_stopped()
    active_bridge=source_map(env_of(original_bridge).get("MODBUS_SOURCE_UNITS_JSON"))
    if live_map==PROPOSED and active_bridge==PROPOSED:
        print("ALREADY DEPLOYED: no restart needed")
        return
    if backup is None:
        print("PRECHECK PASSED: only source-map env values change for two services.")
        print("READ-ONLY: pass --deploy --backup-dir DIRECTORY after verifying backup")
        return
    verify_backup(backup)
    # Repeat durable-queue check immediately before taking either service down.
    depth,capture=queues()
    require(depth["pending"]==0 and depth["retrying"]==0 and capture==0,
            "delivery queue changed; refuse restart")
    publisher_stopped()
    print("DEPLOY: recreating ONLY modbus-tcp and site-mapper (--no-deps --no-build)")
    targets=["site-mapper"] if active_bridge==PROPOSED else ["modbus-tcp","site-mapper"]
    run(compose()+["up","-d","--no-deps","--no-build",
                   "--force-recreate",*targets],
        env=sanitized_environment(),timeout=1200)
    after_a,after_b=inspect(APP),inspect(BRIDGE)
    require(source_map(env_of(after_a).get("MODBUS_SOURCE_UNITS_JSON"))==PROPOSED and
            source_map(env_of(after_b).get("MODBUS_SOURCE_UNITS_JSON"))==PROPOSED,
            "postdeploy Unit mapping mismatch; do not publish until investigated")
    print("DEPLOY CONFIRMED: Units 1/2/3 retained; LAB Units 4/5 configured.")
    print("FC03 and UI/Metasys validation not yet certified.")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument("--stage",action="store_true",help="Back up and stage original Compose overlay ONLY")
    mode.add_argument("--deploy",action="store_true",
                      help="Recreate app/bridge only after all historian queues are zero")
    mode.add_argument("--bridge-only",action="store_true",
                      help="Recreate ONLY gateway, preserving live Site Mapper ingestion")
    parser.add_argument("--backup-dir",type=Path,
                        help="Verified post-commissioning Mongo backup, required for --deploy")
    args=parser.parse_args()
    app,bridge,live,overlay=inspect_core()
    if args.bridge_only:
        bridge_only(app,bridge,live,args.backup_dir)
    elif args.deploy:
        deploy(app,bridge,live,args.backup_dir)
    else:
        stage(overlay,live,args.stage)


if __name__=="__main__":
    try: main()
    except (OSError,RuntimeError,ValueError,KeyError,json.JSONDecodeError,
            subprocess.TimeoutExpired) as err:
        print(str(err),file=sys.stderr)
        sys.exit(1)
