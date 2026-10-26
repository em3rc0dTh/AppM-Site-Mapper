#!/usr/bin/env python3
"""Reanudar SOLO los contenedores Docker ya creados del laboratorio ORIGINAL.

Ejecutar normalmente sin argumentos para PLAN DE SOLO LECTURA.
--start-stopped --ack-resume-existing: usa exclusivamente 'docker start'
en los contenedores existentes, sin nuevos servicios, builds, cambios de
Compose, MongoDB, TimescaleDB ni topología. No levanta el publicador MQTT
que corre aparte en WSL. Úsese solo en un entorno autorizado.
"""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
import time

PROJECT="appm-site-mapper"
SERVICES=(
  ("mongodb","Mongo / usuarios e inventario"),
  ("timescaledb","Timescale / historia"),
  ("lab-mosquitto","Broker MQTT laboratorio"),
  ("telemetry-store","API de historial"),
  ("modbus-tcp","Gateway Modbus"),
  ("site-mapper","Aplicación Site Mapper"),
  ("snmp-lab-agent-01","SNMP BDFB-01 agente"),
  ("snmp-lab-collector-01","SNMP BDFB-01 colector"),
  ("snmp-lab-agent-02","SNMP BDFB-02 agente"),
  ("snmp-lab-collector-02","SNMP BDFB-02 colector"),
  ("snmp-lab-agent-03","SNMP BDFB-03 agente"),
  ("snmp-lab-collector-03","SNMP BDFB-03 colector"),
)


def require(ok,why):
    if not ok:raise RuntimeError("REANUDACIÓN BLOQUEADA: "+why)


def docker(*args):
    p=subprocess.run(("docker",*args),text=True,capture_output=True,timeout=45)
    require(p.returncode==0,"Docker no responde o no tiene permisos")
    return p.stdout.strip()


def inspect(name):
    p=subprocess.run(("docker","inspect",name),
                     text=True,capture_output=True,timeout=25)
    if p.returncode:
        return None
    values=json.loads(p.stdout)
    require(len(values)==1,name+": inspección ambigua")
    v=values[0]
    labels=v.get("Config",{}).get("Labels",{})
    require(labels.get("com.docker.compose.project")==PROJECT and
            labels.get("com.docker.compose.service")==
            name.removeprefix(PROJECT+"-").removesuffix("-1"),
            name+" pertenece a otro proyecto o servicio")
    return v


def require_data_continuity(existing):
    for service,path,volume in (
        ("mongodb","/data/db",PROJECT+"_site_mapper_mongo_data"),
        ("timescaledb","/var/lib/postgresql/data",
         PROJECT+"_site_mapper_timescale_data"),
    ):
        node=existing.get(service)
        require(node is not None,
                "la base original "+service+" no existe; no crear otra")
        mounts=node.get("Mounts",[])
        require(any(m.get("Destination")==path and
                    m.get("Type")=="volume" and m.get("Name")==volume
                    for m in mounts),
                service+" cambió de volumen original; no reanudar")


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-stopped",action="store_true",
                        help="Arrancar únicamente contenedores existentes detenidos")
    parser.add_argument("--ack-resume-existing",action="store_true",
                        help="Reconocer que solo se reanudan servicios de esta instalación")
    args=parser.parse_args()
    require(args.start_stopped==args.ack_resume_existing,
            "para reanudar utiliza ambos --start-stopped --ack-resume-existing")
    rows={}
    print("SITE MAPPER · LABORATORIO EXISTENTE · "+
          ("REANUDACIÓN" if args.start_stopped else "PLAN DE SOLO LECTURA"))
    for service,description in SERVICES:
        name=f"{PROJECT}-{service}-1"
        node=inspect(name)
        rows[service]=node
        status=("NO EXISTE" if node is None else
                "ACTIVO" if node.get("State",{}).get("Running") else "DETENIDO")
        print(f"  {description:34s} {status}")
    require_data_continuity(rows)
    require(rows["site-mapper"] is not None and
            rows["modbus-tcp"] is not None,
            "falta la instalación persistente original")
    if not args.start_stopped:
        print("Sin cambios. Para arrancar los existentes detenidos:")
        print("python3 scripts/telemetry/reanudar-laboratorio-existente.py "
              "--start-stopped --ack-resume-existing")
        return
    for service,_ in SERVICES:
        node=rows[service]
        if node is None or node.get("State",{}).get("Running"):
            continue
        name=f"{PROJECT}-{service}-1"
        print("Iniciando existente: "+name,flush=True)
        docker("start",name)
        # Healthy Docker services may need startup time before dependents.
        if service in ("mongodb","timescaledb"):
            deadline=time.monotonic()+75
            while time.monotonic()<deadline:
                latest=inspect(name)
                health=latest.get("State",{}).get("Health",{}).get("Status")
                if health=="healthy" or (health is None and
                   latest.get("State",{}).get("Running")):
                    break
                time.sleep(2)
            else:
                raise RuntimeError("Servicio base no saludable: "+name+
                                   ". No se inician dependencias restantes.")
    print("Contenedores ya existentes procesados. No se ha creado ningún contenedor.")
    print("Comprueba estado, login, MQTT LIVE y logs SNMP por separado.")


if __name__=="__main__":
    try:main()
    except (RuntimeError,ValueError,OSError,subprocess.TimeoutExpired) as e:
        print(str(e),file=sys.stderr)
        raise SystemExit(1)
