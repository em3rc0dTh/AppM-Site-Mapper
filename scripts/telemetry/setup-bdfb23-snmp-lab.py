#!/usr/bin/env python3
"""Original Site Mapper: synthetic SNMPv3 Config2 for BDFB-02 and BDFB-03.

Default: READ ONLY, check two LAB BDFBs and proposed four new services.
--apply-inventory --ack-synthetic-only: back up the original MongoDB first,
then atomically add ONLY LAB BDFB-02/03 Config2 A/B ports and SNMP OIDs.
--start-collectors --ack-synthetic-only: launch ONLY new agent/collector
services for 02 and 03 after the inventory is already fully commissioned.

No edits or restarts to Site Mapper, BDFB-01, Modbus, original Mongo/Timescale
containers, existing MQTT bindings, publishers, or historical measurements.
Never interpret simulation as physically verified shunt measurements.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
RUNTIME=ROOT/".runtime"/"industrial-lab"
PROJECT="appm-site-mapper"
MONGO=PROJECT+"-mongodb-1"
APP=PROJECT+"-site-mapper-1"
BRIDGE=PROJECT+"-modbus-tcp-1"
BASE=(
  ROOT/"docker-compose.telemetry.yml",
  ROOT/"docker-compose.industrial.yml",
  RUNTIME/"existing-compose.json",
)
OVERLAY=ROOT/"infra/lab/bfdb-snmp/original-stack-config2-bdfb23.yml"
JS=ROOT/"scripts/telemetry/commission-bdfb23-snmp-config2.mongosh.js"
ENV=(ROOT/".env",RUNTIME/"existing.env")
SERVICES=("snmp-lab-agent-02","snmp-lab-collector-02",
          "snmp-lab-agent-03","snmp-lab-collector-03")
ORIGINAL_UNITS={"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3,
                "LAB-BDFB-02":4,"LAB-BDFB-03":5}


def require(ok,reason):
    if not ok:
        raise RuntimeError("SNMP BDFB23 BLOCKED: "+reason)


def run(argv, *, env=None, input_text=None, timeout=90):
    try:
        p=subprocess.run(argv,input=input_text,text=True,capture_output=True,
                         timeout=timeout,env=env)
    except subprocess.TimeoutExpired:
        raise RuntimeError("SNMP BDFB23 BLOCKED: timed out during "+argv[0])
    if p.returncode:
        # Never print Compose's stderr or interpolated credentials.
        raise RuntimeError("SNMP BDFB23 BLOCKED: "+argv[0]+
                           " returned "+str(p.returncode))
    return p.stdout


def inspect(name):
    data=json.loads(run(["docker","inspect",name]))
    require(len(data)==1,"expected existing container "+name)
    obj=data[0]
    require(obj.get("State",{}).get("Running") is True,name+" not running")
    require(obj.get("Config",{}).get("Labels",{}).get("com.docker.compose.project")==PROJECT,
            name+" is not from original Compose project")
    return obj


def env_from(obj):
    return dict(x.split("=",1) for x in obj["Config"].get("Env",[]) if "=" in x)


def env_file(path):
    require(path.is_file() and not path.is_symlink(),
            "private .env.snmp absent or symlinked")
    result={}
    for line in path.read_text(encoding="utf8").splitlines():
        line=line.strip().removeprefix("export ")
        if not line or line.startswith("#") or "=" not in line:
            continue
        name,value=line.split("=",1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",name):
            value=value.strip()
            if len(value)>=2 and value[:1] in ("'",'"') and value[-1]==value[0]:
                value=value[1:-1]
            result[name]=value
    return result


def validate_checkout(path):
    checkout=path.expanduser().resolve()
    require(checkout.is_dir() and
            (checkout/"apps/snmp-emulator/Dockerfile").is_file() and
            (checkout/"apps/snmp-emulator/oid-profile.mjs").is_file(),
            "separate approved bfdb-telemetry-gateway checkout missing")
    remote=run(["git","-C",str(checkout),"remote","get-url","origin"]).strip().lower()
    require("thradexit/bfdb-telemetry-gateway" in remote,
            "external emulator Git origin not recognized")
    return checkout


def safe_env(private,checkout,app_env):
    require(private.get("SNMP_VERSION")=="3",
            "SNMPv3 authPriv required; SNMPv2c unsupported")
    require(private.get("SNMP_EMULATOR_PROFILE") in
            ("ELTEK_BDCBB_CONFIG_2","GENERIC_2_FEED"),
            "only synthetic Config2 profile approved")
    require(bool(private.get("SNMP_V3_USERNAME")) and
            all(len(private.get(k,""))>=8 for k in
                ("SNMP_V3_AUTH_KEY","SNMP_V3_PRIV_KEY")),
            "SNMPv3 auth/priv credentials missing")
    require(app_env.get("APP_ENV")=="development" and
            app_env.get("TELEMETRY_HISTORY_ENABLED")=="true",
            "only original development historian may receive synthetic SNMP")
    require(len(app_env.get("SNMP_INGEST_TOKEN",""))>=32,
            "original Site Mapper SNMP ingest token missing")
    env=dict(os.environ)
    for k in ("SNMP_V3_USERNAME","SNMP_V3_AUTH_KEY","SNMP_V3_PRIV_KEY"):
        env[k]=private[k]
    env["SNMP_INGEST_TOKEN"]=app_env["SNMP_INGEST_TOKEN"]
    env["BFDB_SNMP_LAB_CONTEXT"]=str(checkout)
    # Local .env values win over inherited shell variables; keep overrides
    # exclusively for the new SNMP secrets and BFDB build path.
    protected=set()
    for file in ENV:
        for line in file.read_text(encoding="utf8").splitlines():
            match=re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=",
                           line.strip())
            if match:protected.add(match.group(1))
    for name in protected-{
        "SNMP_V3_USERNAME","SNMP_V3_AUTH_KEY","SNMP_V3_PRIV_KEY","SNMP_INGEST_TOKEN",
        "BFDB_SNMP_LAB_CONTEXT"}:
        env.pop(name,None)
    return env


def compose():
    command=["docker","compose","--project-name",PROJECT,
             "--project-directory",str(ROOT)]
    for path in ENV: command.extend(["--env-file",str(path)])
    for path in (*BASE,OVERLAY): command.extend(["-f",str(path)])
    return command+["--profile","snmp-lab-additive"]


def verify_overlay(config,app,bridge):
    require(config.get("name")==PROJECT,"Compose project identity differs")
    services=config.get("services",{})
    require(all(name in services for name in SERVICES),
            "not all four LAB agent/collector services are present")
    required={
        "02":"EMU-DELTA-BFDB-02",
        "03":"EMU-DELTA-BFDB-03",
    }
    for n,source in required.items():
        for name in (f"snmp-lab-agent-{n}",f"snmp-lab-collector-{n}"):
            row=services[name]
            require(not row.get("ports"),"public/host SNMP ports forbidden")
            require(set(row.get("networks",{}))=={"default"},
                    "new SNMP service joined an unapproved network")
        agent=services[f"snmp-lab-agent-{n}"].get("environment",{})
        collector=services[f"snmp-lab-collector-{n}"].get("environment",{})
        require(agent.get("SNMP_EMULATOR_BFDB_ID")==f"BFDB-{n}" and
                agent.get("SNMP_EMULATOR_SOURCE_ID")==source and
                agent.get("SNMP_EMULATOR_PROFILE")=="ELTEK_BDCBB_CONFIG_2",
                "emulated source/profile identity mismatch for "+n)
        require(collector.get("SNMP_CONTROLLER_ID")==source and
                collector.get("SNMP_CONTROLLER_HOST")==f"snmp-lab-agent-{n}" and
                collector.get("SNMP_VERSION")=="3" and
                collector.get("SNMP_INGEST_TOKEN")==env_from(app)["SNMP_INGEST_TOKEN"],
                "collector identity/auth differs for "+n)
        require(collector.get("SNMP_INGEST_URL")==
                "http://site-mapper:3000/api/telemetry/snmp/ingest",
                "collector not targeting private original Site Mapper")
    bridge_map=json.loads(env_from(bridge).get("MODBUS_SOURCE_UNITS_JSON","{}"))
    require(bridge_map==ORIGINAL_UNITS,
            "original Modbus Unit mapping changed")
    # Strictly no existing service definition in this opt-in file.
    content=OVERLAY.read_text(encoding="utf8")
    for name in ("site-mapper","modbus-tcp","mongodb","timescaledb",
                 "telemetry-store","snmp-lab-agent-01","snmp-lab-collector-01"):
        require(not re.search(r"^  "+re.escape(name)+r":",content,re.M),
                "new overlay tries to change original service "+name)
    # Current site-mapper effective environment is not modified by this action.
    cfg=services.get("site-mapper",{}).get("environment",{})
    require(cfg.get("SNMP_INGEST_TOKEN")==env_from(app)["SNMP_INGEST_TOKEN"],
            "resolved Site Mapper token differs from running container")


def mongo_script(*,apply=False):
    env_flag=["-e","SITEMAPPER_SNMP_CONFIG2_MODE=apply",
              "-e","SITEMAPPER_SNMP_CONFIG2_ACK=LAB_SYNTHETIC_ONLY"] if apply else []
    return run(["docker","exec","-i",*env_flag,MONGO,"mongosh",
                "--quiet","--file","/dev/stdin"],
               input_text=JS.read_text(encoding="utf8"))


def archive_backup():
    folder=Path.home()/"site-mapper-backups"/(
        "snmp-bdfb23-"+datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    folder.mkdir(mode=0o700,parents=True,exist_ok=False)
    archive=folder/"mongodb-before-bdfb23.archive.gz"
    digest=hashlib.sha256()
    size=0
    with archive.open("wb") as handle:
        os.chmod(archive,0o600)
        proc=subprocess.Popen(
            ["docker","exec",MONGO,"mongodump","--db",
             "site_mapper_crud_acceptance_02","--archive","--gzip"],
            stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
        try:
            assert proc.stdout
            while True:
                chunk=proc.stdout.read(1024*1024)
                if not chunk:break
                handle.write(chunk); digest.update(chunk);size+=len(chunk)
            result=proc.wait(timeout=120)
        except Exception:
            proc.kill()
            proc.wait()
            raise
    require(result==0 and size>1024,
            "new Mongo backup failed; no DB writes attempted")
    checksums=folder/"SHA256SUMS"
    checksums.write_text(digest.hexdigest()+"  "+archive.name+"\n",encoding="ascii")
    checksums.chmod(0o600)
    recompute=hashlib.sha256()
    with archive.open("rb") as handle:
        for chunk in iter(lambda:handle.read(1024*1024),b""):
            recompute.update(chunk)
    require(recompute.hexdigest()==digest.hexdigest(),
            "backup SHA256 verification failed; no DB writes attempted")
    print("PRIVATE BACKUP VERIFIED: "+str(folder),flush=True)
    return folder


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument("--apply-inventory",action="store_true",
                      help="Back up Mongo then add 2 Config2 profiles, 4 ports, 8 lab OID bindings")
    mode.add_argument("--start-collectors",action="store_true",
                      help="Start only new 02/03 SNMP agents and collectors")
    parser.add_argument("--ack-synthetic-only",action="store_true",
                        help="Explicitly acknowledge fictional shunts, NOT field installation")
    parser.add_argument("--bfdb-repo",type=Path,
                        default=ROOT.parent/"bfdb-telemetry-gateway",
                        help="Existing external BFDB emulator checkout")
    args=parser.parse_args()
    action=args.apply_inventory or args.start_collectors
    require(action==args.ack_synthetic_only,
            "mutations require --ack-synthetic-only; preview needs no flags")
    for path in (*BASE,*ENV,OVERLAY,JS):
        require(path.is_file() and not path.is_symlink(),
                "required original file absent or symlinked: "+str(path))
    app=inspect(APP)
    bridge=inspect(BRIDGE)
    inspect(MONGO)
    # Confirm original two synthetic SNMP BDFB-01 containers are present and
    # healthy enough to inspect: no existing service changes are planned.
    for name in ("snmp-lab-agent-01","snmp-lab-collector-01"):
        inspect(PROJECT+"-"+name+"-1")
    repo=validate_checkout(args.bfdb_repo)
    private=env_file(repo/".env.snmp")
    env=safe_env(private,repo,env_from(app))
    config=json.loads(run(compose()+["config","--format","json"],env=env))
    verify_overlay(config,app,bridge)
    states=mongo_script()
    print(states.rstrip(),flush=True)
    ready=(states.count(" · READY ·")==2)
    committed=(states.count(" · ALREADY_READY ·")==2)
    require(ready or committed,
            "mixed or unexpected 02/03 lab SNMP inventory states")
    if not action:
        print("READ-ONLY PREFLIGHT PASS: Config2 A/B synthetic lab is safe to plan.")
        print("Next: --apply-inventory --ack-synthetic-only (fresh Mongo backup required)")
        return
    if args.apply_inventory:
        if committed:
            print("ALREADY READY: no Mongo edits and no new backup required")
            return
        archive_backup()
        # Re-run atomic Mongo preflight immediately before committed writes.
        states=mongo_script()
        require(states.count(" · READY ·")==2,
                "SNMP inventory drifted after backup; refusing writes")
        print(mongo_script(apply=True).rstrip())
        return
    require(committed,
            "SNMP inputs/OIDs must first be committed by --apply-inventory")
    existing=set(run(["docker","ps","-a","--format","{{.Names}}"]).splitlines())
    require(not ({PROJECT+"-"+s+"-1" for s in SERVICES}&existing),
            "SNMP 02/03 container names already exist; inspect rather than overwrite")
    print("DEPLOY: starting only four new synthetic SNMPv3 services",flush=True)
    run(compose()+["up","-d","--no-deps","--build",*SERVICES],
        env=env,timeout=1200)
    for s in SERVICES:
        inspect(PROJECT+"-"+s+"-1")
    print("SNMP BDFB-02/03 SERVICES STARTED: collect and verify actual 4-point polls.")
    print("BDFB-01, Site Mapper, MQTT/Modbus, Mongo and Timescale not recreated.")


if __name__=="__main__":
    try:main()
    except (OSError,RuntimeError,ValueError,KeyError,
            json.JSONDecodeError,subprocess.TimeoutExpired) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
