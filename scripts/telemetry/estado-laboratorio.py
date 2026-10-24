#!/usr/bin/env python3
"""Estado industrial Site Mapper en español · SOLO LECTURA.

Ejecutar: python3 scripts/telemetry/estado-laboratorio.py
No inicia, detiene, reconstruye ni modifica ninguna base de datos.
"""
from __future__ import annotations
import json
import subprocess
import urllib.error
import urllib.request

PROJECT="appm-site-mapper"
EXPECTED={
  "Web / Site Mapper":"site-mapper",
  "MongoDB / inventario y usuarios":"mongodb",
  "TimescaleDB / historial":"timescaledb",
  "Telemetry Store":"telemetry-store",
  "Modbus TCP / FC03":"modbus-tcp",
  "MQTT broker de laboratorio":"lab-mosquitto",
  "SNMP agente BDFB-01":"snmp-lab-agent-01",
  "SNMP colector BDFB-01":"snmp-lab-collector-01",
  "SNMP agente BDFB-02":"snmp-lab-agent-02",
  "SNMP colector BDFB-02":"snmp-lab-collector-02",
  "SNMP agente BDFB-03":"snmp-lab-agent-03",
  "SNMP colector BDFB-03":"snmp-lab-collector-03",
}

def main():
    try:
        result=subprocess.run(
            ["docker","ps","-a",
             "--filter",f"label=com.docker.compose.project={PROJECT}",
             "--format","{{json .}}"],
            text=True,capture_output=True,timeout=25,check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("ERROR: Docker no está disponible. Abre Docker Desktop y comprueba WSL.")
        return 1
    if result.returncode:
        print("ERROR: Docker no responde. Comprueba Docker Desktop / permisos.")
        return 1
    containers={}
    for line in result.stdout.splitlines():
        try:
            c=json.loads(line)
            containers[c["Names"]]=(c.get("State",""),c.get("Status",""))
        except (ValueError,KeyError):
            continue
    print("SITE MAPPER · ESTADO DEL LABORATORIO (solo lectura)")
    print("------------------------------------------------------")
    for title,service in EXPECTED.items():
        name=f"{PROJECT}-{service}-1"
        state=containers.get(name)
        status=("ACTIVO" if state and state[0]=="running" else
                "DETENIDO" if state else "NO CREADO")
        print(f"{title:36s}  {status}")
    print("\nSitio web: http://localhost:3000/login")
    try:
        with urllib.request.urlopen(
            urllib.request.Request("http://127.0.0.1:3000/api/health"),
            timeout=3) as response:
            print(f"HTTP /api/health: {response.status} (solo prueba disponibilidad web)")
    except (urllib.error.URLError, TimeoutError):
        print("HTTP /api/health: SIN RESPUESTA")
    print("\nInterpretación:")
    print("- ACTIVO = contenedor ejecutándose; NO certifica lectura reciente.")
    print("- SNMP BDFB-02/03 NO CREADO = aún no se ha activado ese laboratorio.")
    print("- Para comprobar datos LIVE abre el inspector o consulta los logs del colector.")
    print("- No uses 'docker compose down -v' para resolver servicios detenidos.")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
