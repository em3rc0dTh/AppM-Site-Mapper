#!/usr/bin/env python3
"""Read-only Modbus FC03 acceptance for LAB Unit ID 4/5.

Compare first breaker of all 4 MQTT panels against actual FLOAT32 ABCD
Modbus holding registers on 127.0.0.1:1503. No writes, no FC06/FC16,
no Modbus configuration or database changes. Must run with LAB publishers
continuously active. Concurrent publication can move source values; a
mismatch prompts immediate re-check rather than destructive correction.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import socket
import struct
import subprocess
import sys

MONGO="appm-site-mapper-mongodb-1"
BRIDGE="appm-site-mapper-modbus-tcp-1"
MAP={"LAB-BDFB-02":4,"LAB-BDFB-03":5}
FIELDS=("U1","I1","P1","EP1")


def require(ok,what):
    if not ok: raise RuntimeError("FC03 FAILED: "+what)


def docker(container,program,*args):
    result=subprocess.run(["docker","exec",container,program,*args],
                          text=True,capture_output=True,timeout=45,check=False)
    require(result.returncode==0,container+" read-only query failed")
    return result.stdout.strip()


def read_exact(sock,length):
    data=b""
    while len(data)<length:
        chunk=sock.recv(length-len(data))
        require(bool(chunk),"incomplete Modbus response")
        data+=chunk
    return data


def read_fc03(unit,address,transaction):
    request=struct.pack(">HHHBBHH",transaction,0,6,unit,3,address,8)
    with socket.create_connection(("127.0.0.1",1503),timeout=3) as client:
        client.settimeout(3)
        client.sendall(request)
        header=read_exact(client,7)
        tx,protocol,length,unit_read=struct.unpack(">HHHB",header)
        require(tx==transaction and protocol==0 and unit_read==unit,
                "unexpected Modbus MBAP identity")
        require(2<=length<=254,"invalid Modbus body length")
        body=read_exact(client,length-1)
    if body[0]==0x83:
        raise RuntimeError("FC03 exception on Unit "+str(unit)+
                           " offset "+str(address)+" code "+
                           str(body[1] if len(body)>1 else "?"))
    require(body[0]==3 and len(body)==18 and body[1]==16,
            "unexpected FC03 register count")
    return struct.unpack(">ffff",body[2:])


def observations():
    js="""
const d=db.getSiblingDB('site_mapper_crud_acceptance_02');
const sources=['LAB-BDFB-02','LAB-BDFB-03'];
const result={};
for(const source of sources){
  const rows=d.industrial_events.find({
    protocol:'MQTT',sourceIdentity:source,
  }).sort({receivedAt:-1}).limit(16).toArray();
  const byPanel={};
  for(const row of rows){
    let env;
    try{env=JSON.parse(row.envelopeJson);}catch{continue;}
    const points=env.raw?.reported??{};
    for(let panel=1;panel<=4;panel++){
      const point='0_'+panel+'_1';
      if(!(panel in byPanel)&&points[point]){
        byPanel[panel]={point,receivedAt:row.receivedAt,
          values:points[point]};
      }
    }
  }
  result[source]=byPanel;
}
print(JSON.stringify(result));
"""
    return json.loads(docker(MONGO,"mongosh","--quiet","--eval",js).splitlines()[-1])


def main():
    print("SITE MAPPER / LAB 4&5 MODBUS FC03 · READ ONLY",flush=True)
    map_code="""const m=JSON.parse(process.env.MODBUS_SOURCE_UNITS_JSON||'{}');
console.log(JSON.stringify(m));"""
    bridge_map=json.loads(docker(BRIDGE,"node","-e",map_code).splitlines()[-1])
    require(all(bridge_map.get(serial)==unit for serial,unit in MAP.items()),
            "LAB Modbus 4/5 source identity not deployed")
    require(all(bridge_map.get(k)==u for k,u in
                (("EMU-BFDB-01",1),("EMU-BFDB-02",2),("EMU-BFDB-03",3))),
            "original Units 1/2/3 have been changed")
    evidence=observations()
    valid=0
    for serial,unit in MAP.items():
        for panel in range(1,5):
            info=evidence.get(serial,{}).get(str(panel))
            require(info is not None,serial+" missing MQTT panel "+str(panel))
            when=dt.datetime.fromisoformat(info["receivedAt"].replace("Z","+00:00"))
            age=(dt.datetime.now(dt.timezone.utc)-when).total_seconds()
            require(-3<=age<=25,serial+" panel "+str(panel)+
                    " sample stale: "+str(round(age,1))+"s; run publisher")
            expected=tuple(float(info["values"][key]) for key in FIELDS)
            address=(panel-1)*24*8
            measured=read_fc03(unit,address,unit*100+panel)
            differences=[abs(x-y) for x,y in zip(measured,expected)]
            # Values from a concurrently updated 5s synthetic publisher can
            # differ slightly; use a reasonable comparison for live snapshots,
            # not a replacement for stable wire-capture certification.
            tolerances=(0.1,0.4,5.0,0.001)
            matched=all(math.isfinite(v) and delta<=t for v,delta,t
                        in zip(measured,differences,tolerances))
            print(f"{serial} Unit {unit} P{panel}/C1 "
                  f"regs {address}..{address+7} MQTT={expected} FC03={measured} "
                  f"age={age:.1f}s "+("MATCH" if matched else "MISMATCH"))
            valid+=int(matched)
    require(valid==8,"only "+str(valid)+"/8 panel sample blocks matched")
    print("FC03 PASS: 8/8 independent panel samples matched; original Unit IDs preserved.")
    print("Not a Metasys field interoperability certificate; read-only local gateway proof.")


if __name__=="__main__":
    try: main()
    except (RuntimeError,ValueError,OSError,KeyError,struct.error,
            json.JSONDecodeError,subprocess.TimeoutExpired) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
