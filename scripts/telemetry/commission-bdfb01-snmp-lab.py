#!/usr/bin/env python3
"""Fail-closed, additive SNMPv3 laboratory for the already-configured BDFB-01.

Default: strict read-only preflight; --apply --ack-synthetic-only starts ONLY
snmp-lab-agent-01 and snmp-lab-collector-01. Never recreates the original
Site Mapper app, Modbus, Mongo, Timescale, or any original publisher.

Requires a separate local thradexIT/bfdb-telemetry-gateway checkout with a
private SNMPv3 credentials file (.env.snmp). The controller is SYNTHETIC,
not a physically verified Delta/Eltek controller.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
RUNTIME=ROOT/".runtime"/"industrial-lab"
PROJECT="appm-site-mapper"
MONGO=PROJECT+"-mongodb-1"
APP=PROJECT+"-site-mapper-1"
BRIDGE=PROJECT+"-modbus-tcp-1"
LAB_COMPOSE=ROOT/"infra/lab/bfdb-snmp/original-stack-config2-bdfb01.yml"
ACTIVE_FILES=[ROOT/"docker-compose.telemetry.yml",ROOT/"docker-compose.industrial.yml",
              RUNTIME/"existing-compose.json"]
ACTIVE_ENV=[ROOT/".env",RUNTIME/"existing.env"]
SOURCE="EMU-DELTA-BFDB-01"
BDFB="BDFB-01"
NEED_OIDS={
    ("CURRENT","1.3.6.1.4.1.8072.9999.2026.48.1.1.0"),
    ("CURRENT","1.3.6.1.4.1.8072.9999.2026.48.1.2.0"),
    ("VOLTAGE","1.3.6.1.4.1.8072.9999.2026.48.2.1.0"),
    ("VOLTAGE","1.3.6.1.4.1.8072.9999.2026.48.2.2.0"),
}
NEW_SERVICES=("snmp-lab-agent-01","snmp-lab-collector-01")

def fail(reason: str):
    raise RuntimeError("SNMP ADDITIVE PREFLIGHT BLOCKED: "+reason)

def need(value,reason):
    if not value: fail(reason)

def run(argv: list[str], *, env: dict[str,str]|None=None, timeout=75)->str:
    try:
        done=subprocess.run(argv,capture_output=True,text=True,env=env,timeout=timeout)
    except subprocess.TimeoutExpired as error:
        fail("command timed out: "+argv[0])
    if done.returncode:
        # NEVER include output from Compose; it might contain interpolated
        # credentials or the private SNMPv3 environment.
        fail("command returned exit "+str(done.returncode)+": "+argv[0])
    return done.stdout.strip()

def inspect(name: str)->dict:
    rows=json.loads(run(["docker","inspect",name]))
    need(len(rows)==1,"missing or ambiguous container "+name)
    node=rows[0]
    need(node.get("State",{}).get("Running") is True,name+" not running")
    labels=node.get("Config",{}).get("Labels",{})
    need(labels.get("com.docker.compose.project")==PROJECT,
         name+" belongs to another Compose project")
    return node

def environs(node:dict)->dict[str,str]:
    return dict(s.split("=",1) for s in node.get("Config",{}).get("Env",[]) if "=" in s)

def read_env(path:Path)->dict[str,str]:
    need(path.is_file() and not path.is_symlink(),
         "approved local SNMPv3 .env.snmp is missing or symlinked")
    pairs={}
    for line in path.read_text(encoding="utf8").splitlines():
        line=line.strip()
        if not line or line.startswith("#"): continue
        if line.startswith("export "):line=line[7:]
        if "=" not in line: continue
        key,val=line.split("=",1)
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*",key):
            val=val.strip()
            if len(val)>=2 and val[0] in "'\"" and val[-1]==val[0]:
                val=val[1:-1]
            pairs[key]=val
    return pairs

def repo_path(path:Path)->Path:
    real=path.expanduser().resolve()
    need(real.is_dir(),"BFDB SNMP emulator checkout not found: "+str(real))
    need((real/"apps/snmp-emulator/Dockerfile").is_file()
         and (real/"apps/snmp-emulator/oid-profile.mjs").is_file(),
         "BFDB emulator checkout does not contain the approved SNMP implementation")
    # Do not accidentally consume a malicious injected SNMP build context.
    remote=run(["git","-C",str(real),"remote","get-url","origin"])
    need("thradexIT/bfdb-telemetry-gateway" in remote.lower().replace(
         "thradexit","thradexIT").lower(),
         "BFDB checkout origin is not thradexIT/bfdb-telemetry-gateway")
    return real

def mongo_preflight():
    js=r"""
const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const dev=d.topology_nodes.find({kind:'DEVICE',deviceType:'BDFB',
  name:'BDFB-01',lifecycle:'ACTIVE'}).toArray();
let result={devices:dev.length};
if(dev.length===1){
 const e=d.topology_nodes.find({kind:'EQUIPMENT',deviceId:dev[0].id,
   lifecycle:'ACTIVE'}).toArray();
 const ports=e.flatMap(o=>(o.accessPorts||[]).filter(p=>p.lifecycle==='ACTIVE' &&
   p.portType==='POWER' && p.direction==='INPUT' && p.exposure==='EXTERNAL' &&
   p.attributes?.snmpFeedInput===true));
 const portIds=ports.map(p=>p.id);
 const bindings=d.telemetry_bindings.find({protocol:'SNMP',lifecycle:'ACTIVE',
   sourceIdentity:'EMU-DELTA-BFDB-01',targetType:'ACCESS_PORT',
   targetId:{$in:portIds}}).toArray();
 result={
   devices:1,profile:dev[0].attributes?.bdfbHardwareProfile??null,
   panels:e.filter(x=>x.equipmentType==='PANEL').length,
   breakers:e.filter(x=>x.equipmentType==='CIRCUIT_BREAKER').length,
   ports:ports.map(p=>({
     id:p.id,feed:p.attributes?.feed??null,
     physicalConfirmed:p.attributes?.independentInputConfirmed===true,
     servedPanels:p.attributes?.servedPanelIds?.length??0,
   })),
   bindings:bindings.map(b=>({
     targetId:b.targetId,metric:b.metric,oid:b.sourcePointId,
     labOnly:b.attributes?.commissioning==='SYNTHETIC_LAB_ONLY'
   }))
 };
}
print('SNMP_PREFLIGHT='+JSON.stringify(result));"""
    result=run(["docker","exec",MONGO,"mongosh","--quiet","--eval",js])
    output=[s.split("SNMP_PREFLIGHT=",1)[1] for s in result.splitlines()
            if "SNMP_PREFLIGHT=" in s]
    need(len(output)==1,"unable to inspect original BDFB-01 SNMP inventory")
    proof=json.loads(output[0])
    need(proof.get("devices")==1 and proof.get("profile")=="ELTEK_BDCBB_CONFIG_2",
         "original BDFB-01 must have exactly one Config2 BDFB Device")
    need(proof["panels"]==4 and proof["breakers"]==3,
         "original BDFB-01 panels/breakers changed")
    ports=proof["ports"]
    need(len(ports)==2 and {p["feed"] for p in ports}=={"A","B"},
         "original two independent candidate feed positions missing")
    need(all(p["servedPanels"]==2 and not p["physicalConfirmed"] for p in ports),
         "physical feed inventory has changed; no longer a synthetic-only case")
    bindings=proof["bindings"]
    need(len(bindings)==4 and
         {(p["metric"],p["oid"]) for p in bindings}==NEED_OIDS and
         {p["targetId"] for p in bindings}=={p["id"] for p in ports} and
         all(p["labOnly"] for p in bindings),
         "source SNMP bindings differ from the four approved synthetic OIDs")
    for port in ports:
        scoped=[b for b in bindings if b["targetId"]==port["id"]]
        need(len(scoped)==2 and {x["metric"] for x in scoped}=={"CURRENT","VOLTAGE"},
             "each physical input needs exactly one synthetic current and voltage OID")
    print("ORIGINAL BDFB-01 OK: 4 panels, 3 breakers, Config2 A/B, "
          "4 lab-only SNMP OIDs; physical shunts NOT certified")

def compose_command():
    cmd=["docker","compose","--project-name",PROJECT,
         "--project-directory",str(ROOT)]
    for f in ACTIVE_ENV:cmd.extend(["--env-file",str(f)])
    for f in (*ACTIVE_FILES,LAB_COMPOSE):cmd.extend(["-f",str(f)])
    return cmd+["--profile","snmp-lab-additive"]

def vetted_environment(snmp_values:dict, bfdb:Path, existing:dict)->dict[str,str]:
    keys=("SNMP_V3_USERNAME","SNMP_V3_AUTH_KEY","SNMP_V3_PRIV_KEY")
    need(snmp_values.get("SNMP_VERSION")=="3",
         "only SNMPv3 authPriv is supported by additive laboratory")
    need(snmp_values.get("SNMP_EMULATOR_PROFILE") in
         ("ELTEK_BDCBB_CONFIG_2","GENERIC_2_FEED"),
         "BFDB private profile must be Config2 or exact two-feed equivalent")
    need(bool(snmp_values.get("SNMP_V3_USERNAME")) and
         all(len(snmp_values.get(x,""))>=8 for x in keys[1:]),
         "SNMPv3 authPriv credentials are incomplete")
    need(len(existing.get("SNMP_INGEST_TOKEN",""))>=32,
         "running Site Mapper has no valid SNMP ingest token")
    need(existing.get("APP_ENV")=="development",
         "only original local development app is authorized")
    need(existing.get("TELEMETRY_HISTORY_ENABLED")=="true",
         "historical SNMP batch writer is disabled")
    env=dict(os.environ)
    # Override only the opt-in lab secrets, never change application's
    # effective SNMP_INGEST_TOKEN when generating the new service config.
    for key in keys:env[key]=snmp_values[key]
    env["SNMP_INGEST_TOKEN"]=existing["SNMP_INGEST_TOKEN"]
    env["BFDB_SNMP_LAB_CONTEXT"]=str(bfdb)
    return env

def compare_before_after(proposed:dict, current_app:dict, current_bridge:dict):
    services=proposed.get("services",{})
    need(isinstance(services,dict),"invalid overlay service structure")
    need(set(NEW_SERVICES).issubset(services),
         "overlay missing SNMP lab services")
    app_env={k:str(v) for k,v in services.get("site-mapper",{}).get(
        "environment",{}).items()}
    real=environs(current_app)
    need(app_env.get("SNMP_INGEST_TOKEN")==real["SNMP_INGEST_TOKEN"],
         "SNMP collector token differs from original running app")
    # Existing Modbus bridge remains commissioned for five sources:
    # the application can legitimately retain its previous three-source env.
    bridge=environs(current_bridge)
    bridge_units=json.loads(bridge.get("MODBUS_SOURCE_UNITS_JSON","{}"))
    expected={"EMU-BFDB-01":1,"EMU-BFDB-02":2,"EMU-BFDB-03":3,
              "LAB-BDFB-02":4,"LAB-BDFB-03":5}
    need(bridge_units==expected,"certified original+LAB Modbus map drifted")
    need(not any(services[n].get("ports") for n in NEW_SERVICES),
         "SNMP laboratory must not publish any host port")
    need(all(services[n].get("networks",{}).keys()=={"default"}
             for n in NEW_SERVICES),
         "SNMP laboratory must use only existing private default network")
    need(services["snmp-lab-agent-01"].get("environment",{}).get(
        "SNMP_EMULATOR_PROFILE")=="ELTEK_BDCBB_CONFIG_2",
         "synthetic hardware profile mismatch")
    need(services["snmp-lab-collector-01"].get("environment",{}).get(
        "SNMP_CONTROLLER_ID")==SOURCE,"collector source identity changed")
    need(services["snmp-lab-collector-01"].get("environment",{}).get(
        "SNMP_INGEST_URL")=="http://site-mapper:3000/api/telemetry/snmp/ingest",
         "collector no longer targets private original Site Mapper")
    # No overrides for any pre-existing service are allowed in this
    # opt-in SNMP overlay (this comparison is against source content).
    content=LAB_COMPOSE.read_text(encoding="utf-8")
    need(not re.search(r"(?m)^  (?:site-mapper|modbus-tcp|mongodb|timescaledb|telemetry-store):",
                       content),
         "additive SNMP YAML is unexpectedly overriding existing services")

def ensure_new_names_unused():
    existing=set(run(["docker","ps","-a","--format","{{.Names}}"]).splitlines())
    collisions={PROJECT+"-"+name+"-1" for name in NEW_SERVICES}&existing
    need(not collisions,"SNMP lab containers already exist; inspect them before reuse")

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bfdb-repo",type=Path,
                        default=ROOT.parent/"bfdb-telemetry-gateway",
                        help="Approved existing checkout of thradexIT/bfdb-telemetry-gateway")
    parser.add_argument("--apply",action="store_true",
                        help="Create only the two new opt-in SNMPv3 lab containers")
    parser.add_argument("--ack-synthetic-only",action="store_true",
                        help="Acknowledge readings are fictional SNMP shunts, not physical field evidence")
    args=parser.parse_args()
    need(not args.ack_synthetic_only or args.apply,
         "--ack-synthetic-only is used only with --apply")
    for file in (*ACTIVE_FILES,*ACTIVE_ENV,LAB_COMPOSE):
        need(file.is_file() and not file.is_symlink(),
             "missing original project Compose file or environment: "+str(file))
    app=inspect(APP)
    bridge=inspect(BRIDGE)
    inspect(MONGO)
    bfdb=repo_path(args.bfdb_repo)
    values=read_env(bfdb/".env.snmp")
    env=vetted_environment(values,bfdb,environs(app))
    mongo_preflight()
    require_oid=values.get("SNMP_EMULATOR_PROFILE","")
    print("EMULATOR: "+str(bfdb)+" | SNMPv3 authPriv Config2 | source "+SOURCE)
    out=run(compose_command()+["config","--format","json"],env=env)
    config=json.loads(out)
    need(config.get("name")==PROJECT,"resolved Compose project identity changed")
    compare_before_after(config,app,bridge)
    ensure_new_names_unused()
    print("SNMP BDFB-01 PREFLIGHT PASS: two new isolated lab services only.")
    print("Current Site Mapper, Timescale, MongoDB, MQTT, Modbus stay running.")
    if not args.apply:
        print("READ ONLY — run --apply --ack-synthetic-only to start synthetic agent+collector")
        return
    need(args.ack_synthetic_only,
         "explicit --ack-synthetic-only is required to start a simulated feed")
    print("START: snmp-lab-agent-01 + snmp-lab-collector-01 (no dependencies)",flush=True)
    run(compose_command()+["up","-d","--no-deps","--build",*NEW_SERVICES],
        env=env,timeout=1200)
    for name in NEW_SERVICES:
        inspect(PROJECT+"-"+name+"-1")
    print("SNMP LAB BDFB-01 STARTED: collector polls synthetic A/B only.")
    print("Inspect docker logs and refresh BDFB-01 Inputs/Charts. No field SNMP certified.")

if __name__=="__main__":
    try:main()
    except (RuntimeError,OSError,ValueError,KeyError,
            subprocess.TimeoutExpired,json.JSONDecodeError) as e:
        print(str(e),file=sys.stderr);sys.exit(1)
