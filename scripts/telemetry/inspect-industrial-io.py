#!/usr/bin/env python3
"""Read-only industrial I/O observer for the EXISTING Site Mapper Docker project.

RAW MQTT/SNMP = the JSON envelope stored at capture time, including unchanged
MQTT reported fields / decoded SNMP varbind values (SNMPv3 wire is encrypted).
NORMALIZED = signal history from the very same Mongo industrial event ID.
MODBUS RAW = actual MBAP request/response hex on loopback; NORMALIZED = decoded
FLOAT32 ABCD + UINT16 quality. Never writes a register or changes Docker config.
"""
import argparse
import json
import math
import re
import socket
import struct
import subprocess
import sys
import time
from datetime import datetime, timezone

DEFAULT_DB = "site_mapper_crud_acceptance_02"
MONGO = "appm-site-mapper-mongodb-1"
BRIDGE = "appm-site-mapper-modbus-tcp-1"
QUALITY = {
    0: "UNOBSERVED", 1: "VALID", 2: "STALE", 3: "INVALID",
    4: "UNKNOWN", 5: "OFFLINE",
}
DEFAULT_POINTS = [
    (1024, "MQTT voltage extension", "V"),
    (1027, "SNMP alarm", ""),
    (1030, "SNMP Eltek voltage", "V"),
    (1033, "SNMP Eltek current", "A"),
    (1036, "SNMP Eltek temperature", "degC"),
    (1039, "SNMP Eltek status", ""),
    (1042, "MQTT BFDB current", "A"),
    (1045, "MQTT BFDB power", "W"),
    (1048, "MQTT BFDB energy counter", "kWh"),
]

def run_docker(*args, timeout=20):
    p = subprocess.run(["docker", *args], text=True, capture_output=True,
                       timeout=timeout, check=False)
    if p.returncode:
        raise RuntimeError("docker " + " ".join(args[:2]) + " failed: " +
                           (p.stderr.strip() or "unknown error")[:240])
    return p.stdout.strip()

def event_snapshots(db_name):
    # A raw capture and its interpreted values are correlated by exactly one eventId.
    # No credentials or Docker environment values are requested.
    js = """
const d = db.getSiblingDB(%s);
const specs = [
  {name:"MQTT", query:{protocol:"MQTT"}},
  {name:"SNMP GET", query:{protocol:"SNMP", transport:"get"}},
  {name:"SNMP INFORM", query:{protocol:"SNMP", transport:{$in:["inform","trap"]}}}
];
const results = specs.map(({name,query}) => {
  const row = d.industrial_events.find(query).sort({receivedAt:-1}).limit(1).next();
  if (!row) return {name, missing:true};
  const envelope = JSON.parse(row.envelopeJson);
  const history = d.industrial_signal_history
    .find({eventId:row.eventId},{projection:{_id:0,signal:1}})
    .limit(4096).toArray().map(item => item.signal);
  return {name,eventId:row.eventId,envelope,history};
});
print(JSON.stringify({results}));
""" % json.dumps(db_name)
    raw = run_docker("exec", MONGO, "mongosh", "--quiet", "--eval", js, timeout=30)
    return json.loads(raw.splitlines()[-1])["results"]

def display_snapshot(row, max_signals):
    name = row["name"]
    print("\n" + "=" * 25 + " " + name + " " + "=" * 25)
    if row.get("missing"):
        print("No hay captura persistida para esta categoría.")
        return
    envelope = row["envelope"]
    print("Fuente:", envelope.get("sourceIdentity"),
          "| Transporte:", envelope.get("transport"),
          "| Recibido:", envelope.get("receivedAt"))
    print("Event ID:", row["eventId"])
    print("[RAW CAPTURADO · MQTT JSON / SNMP VARBINDS]")
    raw = {"protocol": envelope.get("protocol"),
           "sourceIdentity": envelope.get("sourceIdentity"),
           "transport": envelope.get("transport"),
           "topic": envelope.get("topic"),
           "notificationOid": envelope.get("notificationOid"),
           "receivedAt": envelope.get("receivedAt"),
           "raw": envelope.get("raw")}
    print(json.dumps({k:v for k,v in raw.items() if v is not None},
                     ensure_ascii=False, indent=2))
    print("[NORMALIZED · señales del MISMO evento]")
    history = row.get("history", [])
    print("Señales:", len(history), "| mostrando:", min(len(history), max_signals))
    for s in history[:max_signals]:
        key = s.get("mibName") or s.get("key") or "?"
        unit = s.get("unit") or ""
        val = s.get("value")
        shown = str(val) if val is not None else "—"
        extras = []
        for field in ("quality","kind","alarmState","enumLabel","interpretation"):
            if s.get(field) is not None:
                extras.append(field + "=" + str(s[field]))
        print(" ", key, "| RAW:", repr(s.get("rawValue")),
              "=>", shown, unit, "|", ", ".join(extras))
    if len(history) > max_signals:
        print("  ... use --max-signals", len(history), "para ver todas")
    print("NOTA: RAW SNMP muestra varbinds decodificados tras SNMPv3 authPriv,"
          " NO el datagrama UDP cifrado.")

def get_registry():
    try:
        obj = json.loads(run_docker("exec", BRIDGE, "cat", "/data/registry.json"))
        points = obj.get("points")
        if isinstance(points, list):
            return points, obj.get("version")
    except (RuntimeError, json.JSONDecodeError):
        pass
    return None, None

def recv_exact(sock, amount):
    buf = b""
    while len(buf) < amount:
        piece = sock.recv(amount - len(buf))
        if not piece:
            raise RuntimeError("Respuesta Modbus incompleta")
        buf += piece
    return buf

def fc03(host, port, unit, address, count):
    txn = ((address * 7 + unit) % 65535) + 1
    request = struct.pack(">HHHBBHH",txn,0,6,unit,3,address,count)
    with socket.create_connection((host,port),timeout=4) as sock:
        sock.settimeout(4)
        sock.sendall(request)
        header = recv_exact(sock,7)
        transaction, protocol, length, received_unit = struct.unpack(">HHHB",header)
        if transaction != txn or protocol != 0 or received_unit != unit or length > 254:
            raise RuntimeError("Encabezado MBAP no coincide")
        body = recv_exact(sock,length-1)
    reply = header + body
    if not body:
        raise RuntimeError("Modbus sin PDU")
    if body[0] == 0x83:
        return request, reply, None, f"Excepción Modbus {body[1] if len(body)>1 else '?'}"
    if body[0] != 3 or len(body) < 2 or body[1] != count*2 or len(body[2:]) != count*2:
        raise RuntimeError("FC03 / longitud inesperada")
    return request, reply, body[2:], None

def show_fc03(host,port,unit,address,count,description,eng_unit,extended=True):
    try:
        sent, received, data, failure = fc03(host,port,unit,address,count)
        print("  [RAW TX · FC03] ",sent.hex(" "))
        print("  [RAW RX · FC03] ",received.hex(" "))
        if failure:
            print("  [NORMALIZED]   ",failure)
            return
        if extended:
            value = struct.unpack(">f",data[:4])[0]
            quality = struct.unpack(">H",data[4:6])[0]
            readable = f"{value:.5g}" if math.isfinite(value) else "NaN / SIN VALOR VÁLIDO"
            print(f"  [NORMALIZED]   {description}: {readable} {eng_unit} "
                  f"| quality={quality} ({QUALITY.get(quality,'DESCONOCIDA')}) "
                  f"| dataAddress={address} | reference={40001+address}")
        else:
            metrics=("Voltage V","Current A","Power W","Energy kWh")
            for i, metric in enumerate(metrics):
                value = struct.unpack(">f",data[i*4:i*4+4])[0]
                print(f"  [NORMALIZED]   Circuito 1 · {metric}: "
                      f"{value:.5g} | address={address+i*2} (sin registro quality legacy)")
    except (OSError,ValueError,RuntimeError,struct.error) as err:
        print("  ERROR lectura Modbus:",err)

def display_modbus(host,port,units,include_legacy):
    reg, ver = get_registry()
    print("\n" + "="*22 + " MODBUS TCP · RESPUESTAS REALES " + "="*22)
    print(f"Gateway {host}:{port} | FC03 read-only | manifest: {ver if ver is not None else 'no accesible'}")
    if reg is None:
        print("AVISO: registro publicado no accesible; se usan offsets del ejemplo versionado."
              " Verifique direcciones reales antes de usar en Metasys.")
    for unit in units:
        print("\n--- Unit ID", unit, "---")
        points = [(p["address"],p.get("description","Punto"),p.get("unit",""))
                  for p in reg or [] if p.get("unitId")==unit]
        if not points:
            points = DEFAULT_POINTS
        for address, description, eng_unit in sorted(points):
            if not isinstance(address,int) or address < 1024 or address > 65533:
                continue
            print(f"{address}..{address+2}: {description}")
            show_fc03(host,port,unit,address,3,description,eng_unit)
        if include_legacy:
            print("LEGACY · Circuito 1 · registros 0..7 (4 x FLOAT32)")
            show_fc03(host,port,unit,0,8,"Circuito 1","",extended=False)
    print("IMPORTANTE: Metasys aún no consultó estos registros; estas son lecturas"
          " efectuadas por este observador (equivalentes al cliente FC03).")

def main():
    parser=argparse.ArgumentParser(description="Inspección RAW/NORMALIZED, sin escrituras")
    parser.add_argument("--mode",choices=["all","mqtt","snmp","modbus"],default="all")
    parser.add_argument("--db",default=DEFAULT_DB)
    parser.add_argument("--host",default="127.0.0.1")
    parser.add_argument("--port",type=int,default=1503)
    parser.add_argument("--units",default="1",help="Ej. 1 o 1,2,3")
    parser.add_argument("--max-signals",type=int,default=12,help="Señales normalizadas visibles por evento")
    parser.add_argument("--legacy",action="store_true",help="Incluir circuito 1, offsets 0..7")
    parser.add_argument("--follow",action="store_true",help="Repetir periódicamente; CTRL+C para salir")
    parser.add_argument("--interval",type=int,default=15,help="Segundos entre rondas --follow")
    args=parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_]{1,100}",args.db):
        parser.error("Nombre de base inválido")
    try:
        units=[int(v) for v in args.units.split(",")]
    except ValueError:
        parser.error("--units debe contener IDs numéricos separados por comas")
    if not units or len(units)>10 or any(not 1<=unit<=247 for unit in units):
        parser.error("Unit IDs válidos: 1..247, máximo 10 por ejecución")
    if not (1<=args.max_signals<=4096 and 3<=args.interval<=3600 and 1<=args.port<=65535):
        parser.error("max-signals 1..4096, interval 3..3600, port 1..65535")
    latest={}
    try:
        while True:
            print("\n=== OBSERVACIÓN UTC",datetime.now(timezone.utc).isoformat(),"===",
                  flush=True)
            if args.mode in ("all","mqtt","snmp"):
                try:
                    for row in event_snapshots(args.db):
                        if args.mode=="mqtt" and row["name"]!="MQTT": continue
                        if args.mode=="snmp" and row["name"]=="MQTT": continue
                        key=row["name"]
                        if args.follow and row.get("eventId")==latest.get(key): continue
                        latest[key]=row.get("eventId")
                        display_snapshot(row,args.max_signals)
                except (RuntimeError,ValueError,KeyError,json.JSONDecodeError) as error:
                    print("ERROR lectura Mongo:",str(error)[:350])
            if args.mode in ("all","modbus"):
                display_modbus(args.host,args.port,units,args.legacy)
            if not args.follow: return
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nObservador finalizado, sin modificar el laboratorio.")

if __name__=="__main__":
    main()
