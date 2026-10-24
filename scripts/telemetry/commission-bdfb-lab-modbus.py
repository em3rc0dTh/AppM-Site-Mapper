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


def inspect(name):
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
    expected=[str(p) for p in FILES]
    # Containers within the SAME existing project may have been recreated at
    # different times: mongodb/Timescale/bridge can still carry the base or
    # base+industrial Compose labels, while the app carries all three files.
    # Accept ONLY an ordered prefix of these exact approved paths (no extra
    # compose file, alternate checkout, changed project or arbitrary suffix).
    approved=[expected[:i] for i in (1,2,3)]
    require(actual in approved,
            "unapproved Compose provenance for "+name+
            " (file count="+str(len(actual))+"); expected an approved base-to-overlay prefix")
    if name==APP:
        require(actual==expected,
                "Site Mapper must have been recreated from the active existing-stack overlay")
    if name==BRIDGE:
        require(len(actual)>=2,
                "Modbus bridge did not originate from industrial Compose overlay")
    print("COMPOSE PROVENANCE OK "+service+" | approved files="+
          str(len(actual))+" | project="+PROJECT)
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
    require(am==bm and am in (ORIGINAL,PROPOSED),"running source map changed")
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


def deploy(original_app,original_bridge,live_map,backup):
    require(live_map==ORIGINAL or live_map==PROPOSED,"unexpected active mapping")
    final=json.loads(run(compose()+["config","--format","json"],
                         env=sanitized_environment()))
    require(final.get("name")==PROJECT,"Compose project differs")
    services=final.get("services",{})
    for name,node in (("site-mapper",original_app),("modbus-tcp",original_bridge)):
        conf=services.get(name)
        require(isinstance(conf,dict),"service missing: "+name)
        env={k:str(v) for k,v in conf.get("environment",{}).items()}
        require(source_map(env.get("MODBUS_SOURCE_UNITS_JSON"))==PROPOSED,
                "staged source map not additive: "+name)
        before=env_of(node)
        unexpected=[k for k,v in env.items()
                    if k!="MODBUS_SOURCE_UNITS_JSON" and before.get(k)!=v]
        require(not unexpected,"unexpected changes in "+name+": "+", ".join(unexpected))
        compare_mounts(node,conf,name)
    # Existing persistence must never be replaced by an implicitly fresh DB.
    mongo,timescale=inspect(MONGO),inspect(PROJECT+"-timescaledb-1")
    require(any(m.get("Destination")=="/data/db" and
                m.get("Name")==PROJECT+"_site_mapper_mongo_data"
                for m in mongo.get("Mounts",[])),"original Mongo volume differs")
    require(any(m.get("Destination")=="/var/lib/postgresql/data" and
                m.get("Name")==PROJECT+"_site_mapper_timescale_data"
                for m in timescale.get("Mounts",[])),"original Timescale volume differs")
    depth,capture=queues()
    print("DELIVERY QUEUES:",json.dumps(depth),"captureSpool="+str(capture))
    require(depth["pending"]==0 and depth["retrying"]==0 and capture==0,
            "pending history/capture items: let publisher stop and queues drain")
    publisher_stopped()
    if live_map==PROPOSED:
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
    run(compose()+["up","-d","--no-deps","--no-build",
                   "--force-recreate","modbus-tcp","site-mapper"],
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
    mode.add_argument("--deploy",action="store_true",help="Recreate ONLY app and bridge, after strict preflight")
    parser.add_argument("--backup-dir",type=Path,
                        help="Verified post-commissioning Mongo backup, required for --deploy")
    args=parser.parse_args()
    app,bridge,live,overlay=inspect_core()
    if args.deploy:
        deploy(app,bridge,live,args.backup_dir)
    else:
        stage(overlay,live,args.stage)


if __name__=="__main__":
    try: main()
    except (OSError,RuntimeError,ValueError,KeyError,json.JSONDecodeError,
            subprocess.TimeoutExpired) as err:
        print(str(err),file=sys.stderr)
        sys.exit(1)
