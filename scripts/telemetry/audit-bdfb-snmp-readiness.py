#!/usr/bin/env python3
"""READ-ONLY SNMP readiness audit for the original Site Mapper Mongo/Compose stack.

This script does NOT commission OIDs, create POWER INPUT ports, change physical
shunts, touch MQTT/Modbus, or start/stop any Docker services.
Run: python3 scripts/telemetry/audit-bdfb-snmp-readiness.py
"""
from __future__ import annotations

import json
import subprocess
import sys

MONGO="appm-site-mapper-mongodb-1"
APP="appm-site-mapper-site-mapper-1"
DB_NAME="site_mapper_crud_acceptance_02"

JS = r"""
const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const names=['BDFB-01','BDFB-02','BDFB-03'];
const records=[];
const active=(x)=>x && x.lifecycle==='ACTIVE';
for (const name of names) {
  const devices=d.topology_nodes.find({kind:'DEVICE',deviceType:'BDFB',name,lifecycle:'ACTIVE'}).toArray();
  if (devices.length!==1) {
    records.push({name,deviceCount:devices.length,error:'EXPECTED_ONE_ACTIVE_BDFB_DEVICE'});
    continue;
  }
  const device=devices[0];
  const eq=d.topology_nodes.find({kind:'EQUIPMENT',deviceId:device.id,lifecycle:'ACTIVE'},
      {_id:0,id:1,name:1,equipmentType:1,accessPorts:1}).toArray();
  const panels=eq.filter(e=>e.equipmentType==='PANEL');
  const circuits=eq.filter(e=>e.equipmentType==='CIRCUIT_BREAKER');
  const portPairs=[];
  for (const owner of eq) for(const port of (owner.accessPorts??[])) {
    if(active(port) && port.portType==='POWER' && port.direction==='INPUT'
       && port.exposure==='EXTERNAL' && port.attributes?.snmpFeedInput===true) {
       portPairs.push({owner:owner.name,port});
    }
  }
  const ids=portPairs.map(x=>x.port.id);
  const bindingRows=ids.length?d.telemetry_bindings.find({
    protocol:'SNMP',targetType:'ACCESS_PORT',targetId:{$in:ids},lifecycle:'ACTIVE'
  },{_id:0,id:1,targetId:1,sourceIdentity:1,sourcePointId:1,metric:1,attributes:1}).toArray():[];
  const feeds=portPairs.map(({owner,port})=>{
    const map=bindingRows.filter(b=>b.targetId===port.id);
    const currents=map.filter(b=>b.metric==='CURRENT');
    const volts=map.filter(b=>b.metric==='VOLTAGE');
    return {
      name:port.name, owner, portId:port.id,
      feed:port.attributes?.feed??null,
      feedPosition:port.attributes?.feedPosition??null,
      independentConfirmed:port.attributes?.independentInputConfirmed===true,
      servedPanels:Array.isArray(port.attributes?.servedPanelIds)
        ?port.attributes.servedPanelIds.length:0,
      currentBindings:currents.length,
      voltageBindings:volts.length,
      currentSource:currents.length===1?currents[0].sourceIdentity:null,
      currentOid:currents.length===1?currents[0].sourcePointId:null,
      labOnly:map.some(b=>b.attributes?.commissioning==='SYNTHETIC_LAB_ONLY'),
    };
  });
  const profile=device.attributes?.bdfbHardwareProfile??null;
  const slots=profile==='ELTEK_BDCBB_CONFIG_2'?['A','B']:
    profile==='ELTEK_BDCBB_CONFIG_4'?['A1','A2','B1','B2']:[];
  const recorded=new Set(feeds.map(f=>
    profile==='ELTEK_BDCBB_CONFIG_2'?f.feed:f.feedPosition));
  records.push({
    name,deviceId:device.id,deviceCount:1,profile,
    panels:panels.length,breakers:circuits.length,
    expectedFeeds:slots.length,feedPorts:feeds.length,
    missingPositions:slots.filter(s=>!recorded.has(s)),
    bindings:bindingRows.length,
    feeds
  });
}
print('SNMP_AUDIT_JSON='+JSON.stringify(records));
"""

def run(args:list[str], *, stdin:str|None=None)->str:
    result=subprocess.run(args,input=stdin,encoding="utf-8",
                          capture_output=True,check=False,timeout=60)
    if result.returncode:
        raise RuntimeError(args[0]+" read-only inspection failed (exit="+
                           str(result.returncode)+"): "+
                           result.stderr.strip()[:250])
    return result.stdout


def collect():
    output=run(["docker","exec","-i",MONGO,"mongosh","--quiet",
                "--file","/dev/stdin"],stdin=JS)
    prefix="SNMP_AUDIT_JSON="
    matches=[line[len(prefix):] for line in output.splitlines() if line.startswith(prefix)]
    if len(matches)!=1: raise RuntimeError("Expected exactly one SNMP Mongo audit record")
    return json.loads(matches[0])


def flags():
    nodes=json.loads(run(["docker","inspect",APP]))
    if len(nodes)!=1 or not nodes[0].get("State",{}).get("Running"):
        raise RuntimeError("Existing Site Mapper application is not running")
    labels=nodes[0].get("Config",{}).get("Labels",{})
    if labels.get("com.docker.compose.project")!="appm-site-mapper":
        raise RuntimeError("Unexpected original Compose project identity")
    env=dict(field.split("=",1) for field in nodes[0].get("Config",{}).get("Env",[])
             if "=" in field)
    return {
        "APP_ENV":env.get("APP_ENV","UNSET"),
        "SNMP_LAB_ENABLED":env.get("SNMP_LAB_ENABLED","UNSET"),
        "TELEMETRY_HISTORY_ENABLED":env.get("TELEMETRY_HISTORY_ENABLED","UNSET"),
        "SNMP_INGEST_TOKEN_configured":len(env.get("SNMP_INGEST_TOKEN",""))>=32
    }


def main()->int:
    print("SITE MAPPER / BDFB SNMP READINESS · READ ONLY",flush=True)
    print("Targets: original appm-site-mapper project, existing Mongo database "+DB_NAME)
    state=flags()
    print("APP CONFIG (presence only; no secrets): "+json.dumps(state,sort_keys=True))
    containers=run(["docker","ps","--format","{{.Names}}"]).splitlines()
    collectors=[name for name in containers if "snmp-collector" in name]
    print("RUNNING SNMP COLLECTORS: "+
          (", ".join(collectors) if collectors else "none observed"))
    print("Note: separately hosted agents/collectors may not appear in local docker ps.")
    data=collect()
    problems=0
    for row in data:
        name=row["name"]
        if row.get("error"):
            problems+=1
            print(name+" ERROR "+row["error"]+" activeDevices="+str(row["deviceCount"]))
            continue
        print("\n"+name+" | selectedProfile="+str(row["profile"] or "NOT SELECTED")+
              " | panels="+str(row["panels"])+" | breakers="+str(row["breakers"])+
              " | inputPorts="+str(row["feedPorts"])+"/"+
              (str(row["expectedFeeds"]) if row["expectedFeeds"] else "NOT DEFINED")+
              " | activeSnmpBindings="+str(row["bindings"]))
        if row["missingPositions"]:
            print("  MISSING FEED INPUT POSITIONS: "+", ".join(row["missingPositions"]))
        for feed in row["feeds"]:
            print("  "+str(feed["feedPosition"] or feed["feed"] or "?")+
                  " "+feed["name"]+
                  " | confirmedPhysical="+str(feed["independentConfirmed"])+
                  " | linkedPanels="+str(feed["servedPanels"])+
                  " | OID CURRENT="+str(feed["currentBindings"])+
                  " VOLTAGE="+str(feed["voltageBindings"])+
                  " | source="+str(feed["currentSource"] or "UNMAPPED")+
                  (" | SYNTHETIC LAB" if feed["labOnly"] else ""))
        if not row["profile"] or row["feedPorts"]!=row["expectedFeeds"] or (
                row["profile"] and row["missingPositions"]):
            problems+=1
        if any(f["currentBindings"]!=1 or f["voltageBindings"]>1 for f in row["feeds"]):
            problems+=1
    print("\nRESULT: "+(
          "SNMP INVENTORY / COMMISSIONING GAPS DETECTED"
          if problems else "SNMP BINDING INVENTORY STRUCTURALLY PRESENT"
    ))
    print("This audit does not prove live SNMP GET, historical samples, shunt physical")
    print("wiring, vendor OIDs, or field certification. It does not write to any service.")
    return 0


if __name__=="__main__":
    try: raise SystemExit(main())
    except (OSError,RuntimeError,ValueError,KeyError,subprocess.TimeoutExpired) as error:
        print("SNMP READ-ONLY AUDIT BLOCKED: "+str(error),file=sys.stderr)
        raise SystemExit(1)
