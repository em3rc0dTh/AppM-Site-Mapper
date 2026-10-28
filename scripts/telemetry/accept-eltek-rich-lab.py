#!/usr/bin/env python3
"""Read-only industrial acceptance on a disposable Site Mapper + BFDB Docker lab.

This script never configures hardware, writes DB rows, merges code or performs
SNMP SET/Modbus writes. A passed lab is NOT real Eltek/Metasys certification.
"""
import argparse
import json
import math
import socket
import struct
import subprocess
import sys
import time

PREFIX = "site-mapper-industrial-lab"
SOURCE = "EMU-SNMP-QDF-01"
VOLTAGE_OID = "1.3.6.1.4.1.12148.10.10.5.5.0"
FUSE_STATUS_OID = "1.3.6.1.4.1.12148.10.15.18.8.1.2.1"
BOOST_OID = "1.3.6.1.4.1.12148.10.10.15.2.0"

def invoke(container, *args):
    result = subprocess.run(["docker", "exec", PREFIX + "-" + container + "-1", *args],
                            capture_output=True, text=True, timeout=35, check=False)
    if result.returncode:
        raise RuntimeError(container + " read failed (exit " + str(result.returncode) + ")")
    return result.stdout.strip()

def mongo_snapshot():
    script = """
const d=db.getSiblingDB('appm_site_mapper');
const source='EMU-SNMP-QDF-01';
const q={sourceIdentity:source,protocol:'SNMP'};
const row=k=>d.industrial_signals.findOne({...q,'signal.key':k})?.signal;
const volume=d.industrial_signals.countDocuments(q);
const synthetic=d.industrial_signals.countDocuments({...q,'signal.key':{$regex:'^1\\\\.3\\\\.6\\\\.1\\\\.4\\\\.1\\\\.8072\\\\.9999\\\\.2026\\\\.54\\\\.'}});
const raw=[row('1.3.6.1.4.1.12148.10.10.5.5.0'),
           row('1.3.6.1.4.1.12148.10.15.18.8.1.2.1'),
           row('1.3.6.1.4.1.12148.10.10.15.2.0')];
print(JSON.stringify({catalog:volume,synthetic,receivedEvents:d.industrial_events.countDocuments(q),
  raw:raw.map(v=>v?.lastObservation?.rawValue??v?.rawValue??null),
  known:raw.map(v=>Boolean(v))}));
"""
    text = invoke("mongodb", "mongosh", "--quiet", "--eval", script)
    return json.loads(text.splitlines()[-1])

def timescale_snapshot():
    sql = """
SELECT json_build_object(
 'historical', COUNT(DISTINCT signal_id),
 'raw_present', COUNT(DISTINCT signal_id) FILTER (WHERE sample ? 'rawValue'),
 'raw_zero', COUNT(*) FILTER (WHERE sample->>'rawValue' = '0'),
 'voltage_5389', COUNT(*) FILTER (
   WHERE sample->>'key' = '1.3.6.1.4.1.12148.10.10.5.5.0'
     AND sample->>'rawValue' = '5389'),
 'unknown', COUNT(DISTINCT signal_id) FILTER (WHERE quality = 'UNKNOWN')
)::text
FROM industrial_observations
WHERE source_identity = 'EMU-SNMP-QDF-01' AND protocol = 'SNMP';
"""
    text = invoke("timescaledb", "psql", "-U", "site_mapper", "-d",
                  "site_mapper_telemetry", "-t", "-A", "-c", sql)
    return json.loads(text.splitlines()[-1])

def modbus_fc03(unit=1, offset=1030):
    request=struct.pack(">HHHBBHH", 417, 0, 6, unit, 3, offset, 3)
    with socket.create_connection(("127.0.0.1", 1503), timeout=5) as sock:
        sock.settimeout(5)
        sock.sendall(request)
        payload=b""
        while len(payload)<13:
            chunk=sock.recv(13-len(payload))
            if not chunk:
                break
            payload+=chunk
    if len(payload)!=13 or payload[:2]!=request[:2] or payload[7]!=3 or payload[8]!=6:
        raise RuntimeError("Invalid Modbus FC03 MBAP/length")
    return {"voltage":struct.unpack(">f",payload[9:13])[0], "quality":None}

def modbus_three_registers():
    request=struct.pack(">HHHBBHH",417,0,6,1,3,1030,3)
    with socket.create_connection(("127.0.0.1",1503),timeout=5) as sock:
        sock.settimeout(5)
        sock.sendall(request)
        data=b""
        while len(data)<15:
            chunk=sock.recv(15-len(data))
            if not chunk:
                raise RuntimeError("Short Modbus TCP frame")
            data+=chunk
    if len(data)!=15 or data[0:2]!=request[0:2] or data[6]!=1 or data[7]!=3 or data[8]!=6:
        raise RuntimeError("Modbus FC03 response mismatch")
    return {"voltage":struct.unpack(">f",data[9:13])[0],
            "quality":struct.unpack(">H",data[13:15])[0]}

def receiver_diagnostics():
    raw=invoke("snmp-traps","cat","/data/traps/diagnostics.json")
    return json.loads(raw)

def acceptance(expected, duration):
    deadline=time.monotonic()+duration
    last={}
    while time.monotonic()<deadline:
        try:
            mongo=mongo_snapshot()
            history=timescale_snapshot()
            bridge=modbus_three_registers()
            receiver=receiver_diagnostics()
            counters=receiver.get("counters",{})
            last={"mongo":mongo,"timescale":history,"modbus":bridge,
                  "receiver":{"pending":receiver.get("pending"),
                              "queueFull":counters.get("trap.queue.full",0),
                              "spoolFailed":counters.get("trap.spool.failed",0),
                              "tooLarge":counters.get("trap.payload.too_large",0),
                              "committed":counters.get("trap.delivery.committed",0)}}
            if any(last["receiver"][k] for k in ("queueFull","spoolFailed","tooLarge")):
                raise RuntimeError("Receiver silently lost SNMP captures")
            passed=(mongo["catalog"]>=expected and
                    mongo["synthetic"]>=max(0,expected-15) and
                    mongo["receivedEvents"]>=math.ceil(expected/16) and
                    mongo["raw"]==[5389,4,0] and
                    history["historical"]>=expected and
                    history["raw_present"]>=expected and
                    history["raw_zero"]>0 and
                    history["voltage_5389"]>0 and
                    history["unknown"]>0 and
                    math.isclose(bridge["voltage"],53.89,rel_tol=0,abs_tol=0.02) and
                    bridge["quality"]==1)
            if passed:
                print(json.dumps({"result":"LAB_PASS","hardwareCertified":False,**last},
                                 indent=2))
                return True
        except (OSError,RuntimeError,ValueError,json.JSONDecodeError) as error:
            last["temporaryError"]=str(error)[:180]
            if "silently lost" in str(error):
                break
        time.sleep(6)
    print(json.dumps({"result":"LAB_FAIL","hardwareCertified":False,**last},indent=2),file=sys.stderr)
    return False

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--expected",type=int,default=5407)
    parser.add_argument("--timeout",type=int,default=600)
    args=parser.parse_args()
    if not 15<=args.expected<=10000 or not 30<=args.timeout<=1200:
        parser.error("Expected 15..10000 and timeout 30..1200")
    sys.exit(0 if acceptance(args.expected,args.timeout) else 1)
