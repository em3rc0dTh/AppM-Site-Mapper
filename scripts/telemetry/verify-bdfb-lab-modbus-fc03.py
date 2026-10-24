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
import time

MONGO="appm-site-mapper-mongodb-1"
BRIDGE="appm-site-mapper-modbus-tcp-1"
MAP={"LAB-BDFB-02":4,"LAB-BDFB-03":5}
FIELDS=("U1","I1","P1","EP1")
PANELS=(1,2,3,4)
# Publisher emits one of four panels per source each five seconds:
# each individual panel is updated approximately every 20 seconds.
# The bridge considers holding registers stale at 30 seconds.
MAX_PANEL_AGE_SECONDS=27.0
MAX_SOURCE_AGE_SECONDS=15.0
MAX_VERIFICATION_SECONDS=55.0
POLL_SECONDS=2.0
FLOAT_TOLERANCES=(0.1,0.4,5.0,0.001)


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


def age_seconds(timestamp: str, *, now: dt.datetime | None = None) -> float:
    observed=dt.datetime.fromisoformat(timestamp.replace("Z","+00:00"))
    require(observed.tzinfo is not None, "observation without timezone")
    return ((now or dt.datetime.now(dt.timezone.utc))-observed).total_seconds()


def source_freshness(evidence: dict, serial: str) -> float:
    by_panel=evidence.get(serial, {})
    require(isinstance(by_panel,dict), "invalid MQTT source evidence for "+serial)
    samples=[item.get("receivedAt") for item in by_panel.values()
             if isinstance(item,dict) and isinstance(item.get("receivedAt"),str)]
    if not samples:
        return float("inf")
    return min(age_seconds(received) for received in samples)


def comparison(expected: tuple[float, ...], measured: tuple[float, ...]) -> bool:
    return all(math.isfinite(measurement) and
               abs(measurement-reference) <= threshold
               for measurement,reference,threshold
               in zip(measured,expected,FLOAT_TOLERANCES))


def verify_samples(*, budget_seconds: float = MAX_VERIFICATION_SECONDS,
                   poll_seconds: float = POLL_SECONDS) -> None:
    """Compare all 8 panels without trusting a single aging Mongo snapshot.

    The gateway only retains a measurement for 30 seconds, and each panel
    takes ~20 seconds to rotate back. A bounded refresh handles arrival
    between Mongo read and FC03 without widening the bridge freshness
    policy or accepting zeros/stale values as matches.
    """
    pending={(serial,panel) for serial in MAP for panel in PANELS}
    verified={}
    reasons={}
    deadline=time.monotonic()+budget_seconds
    iteration=0
    while pending:
        iteration+=1
        evidence=observations()
        current={serial:source_freshness(evidence,serial) for serial in MAP}
        for serial,panel in sorted(pending):
            age_source=current[serial]
            if not (-3<=age_source<=MAX_SOURCE_AGE_SECONDS):
                reasons[(serial,panel)]=(
                    f"source not LIVE (last persisted MQTT age={age_source:.1f}s)"
                )
                continue
            info=evidence.get(serial,{}).get(str(panel))
            if not info:
                reasons[(serial,panel)]="no persisted MQTT observation for panel"
                continue
            received=info.get("receivedAt")
            if not isinstance(received,str):
                reasons[(serial,panel)]="invalid MQTT timestamp"
                continue
            age=age_seconds(received)
            if not (-3<=age<=MAX_PANEL_AGE_SECONDS):
                reasons[(serial,panel)]=(
                    f"panel observation age={age:.1f}s (limit "
                    f"{MAX_PANEL_AGE_SECONDS:g}s)"
                )
                continue
            try:
                expected=tuple(float(info["values"][key]) for key in FIELDS)
                require(all(math.isfinite(x) for x in expected),
                        "nonfinite MQTT numeric value")
            except (TypeError,ValueError,KeyError) as error:
                reasons[(serial,panel)]="invalid MQTT measurements: "+type(error).__name__
                continue
            unit=MAP[serial]
            address=(panel-1)*24*8
            try:
                measured=read_fc03(unit,address,unit*100+panel)
            except (RuntimeError,OSError,socket.timeout) as error:
                reasons[(serial,panel)]=str(error)
                continue
            if not comparison(expected,measured):
                reasons[(serial,panel)]=(
                    f"FC03 does not match latest MQTT "
                    f"(sample age={age:.1f}s, expected={expected}, measured={measured})"
                )
                continue
            # A source can advance between the observation read and the FC03
            # request; this is acceptable only for the measured packet's
            # bounded freshness and numerical correspondence.
            verified[(serial,panel)]=(age,expected,measured)
            print(f"{serial} Unit {unit} P{panel}/C1 "
                  f"regs {address}..{address+7} MQTT={expected} FC03={measured} "
                  f"age={age:.1f}s MATCH",flush=True)
        pending.difference_update(verified)
        if not pending:
            break
        if time.monotonic()>=deadline:
            break
        if iteration==1:
            print("FC03: waiting for next panel rotation; "
                  "no writes or restarts",flush=True)
        time.sleep(min(poll_seconds,max(0,deadline-time.monotonic())))

    require(not pending,
            f"only {len(verified)}/8 panel samples matched before "
            f"{budget_seconds:g}s budget; outstanding: "+
            "; ".join(f"{serial} P{panel}: {reasons.get((serial,panel),'unknown')}"
                      for serial,panel in sorted(pending)))
    # Do not certify eight old observations from a sender that stopped
    # during our polling. The latest persisted MQTT event for EACH source
    # still needs to be live at the end of the FC03 acceptance.
    latest=observations()
    for serial in MAP:
        age=source_freshness(latest,serial)
        require(-3<=age<=MAX_SOURCE_AGE_SECONDS,
                f"{serial} source no longer LIVE at final acceptance: {age:.1f}s")
    print("FC03 PASS: 8/8 independent panel samples matched; "
          "both sources remain LIVE; original Unit IDs preserved.")
    print("Not a Metasys field interoperability certificate; "
          "read-only local gateway proof.")


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
    verify_samples()


if __name__=="__main__":
    try: main()
    except (RuntimeError,ValueError,OSError,KeyError,struct.error,
            json.JSONDecodeError,subprocess.TimeoutExpired) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
