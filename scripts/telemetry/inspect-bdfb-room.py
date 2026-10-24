#!/usr/bin/env python3
"""Read-only inventory of original Site Mapper BDFB bays, racks and MQTT bindings.

Uses only docker exec + mongosh find/aggregate. Does not mutate site_mapper,
Docker containers, volumes, secrets or telemetry bindings. Do not auto-assign
rack IDs solely from visual blueprints.
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict

MONGO = "appm-site-mapper-mongodb-1"
DEFAULT_DB = "site_mapper_crud_acceptance_02"


def inventory(db):
    js = """
const d = db.getSiblingDB(%s);
const nodes = d.topology_nodes.find(
  {lifecycle:"ACTIVE"},
  {_id:0,id:1,parentId:1,name:1,kind:1,variant:1,serialNumber:1,
   deviceType:1,rootEquipmentIds:1,cas:1,coordinate:1}
).toArray().map(n => {
  // The CAS array is canonical for RACK nodes, but historical records may
  // contain an object-shaped CAS and non-rack records may also carry one.
  // Do not silently assume malformed/legacy CAS means a rack is available.
  const rack = n.kind === "CONTAINER_RACK" && n.variant === "RACK";
  const ranges = rack && Array.isArray(n.cas) ? n.cas : null;
  const casShape = !rack ? "not_applicable" :
    Array.isArray(n.cas) ? "array" :
    n.cas == null ? "missing" :
    typeof n.cas === "object" ? "object" : typeof n.cas;
  return {
    id:n.id,parentId:n.parentId,name:n.name,kind:n.kind,variant:n.variant,
    serialNumber:n.serialNumber,deviceType:n.deviceType,coordinate:n.coordinate,
    rootEquipmentCount:Array.isArray(n.rootEquipmentIds) ? n.rootEquipmentIds.length : 0,
    casShape,
    casEquipped:ranges ? ranges.filter(c => c?.state === "EQUIPPED").length : null,
    casReserved:ranges ? ranges.filter(c => c?.state === "RESERVED").length : null
  };
});
const bindingCounts = d.telemetry_bindings.aggregate([
  {$match:{lifecycle:"ACTIVE",protocol:"MQTT"}},
  {$group:{_id:{source:"$sourceIdentity",targetType:"$targetType"},
    count:{$sum:1}}},
  {$sort:{"_id.source":1}}
]).toArray().map(x=>({
  source:x._id.source,targetType:x._id.targetType,count:x.count
}));
print(JSON.stringify({nodes,bindingCounts}));
""" % json.dumps(db)
    result = subprocess.run(
        ["docker","exec",MONGO,"mongosh","--quiet","--eval",js],
        text=True,capture_output=True,timeout=45,check=False,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip()[:400] or "mongosh failed")
    return json.loads(result.stdout.strip().splitlines()[-1])


def report(data, room_name, as_json):
    nodes = data["nodes"]
    by_id = {n["id"]: n for n in nodes}
    children = defaultdict(list)
    for n in nodes:
        children[n.get("parentId")].append(n)
    for siblings in children.values():
        siblings.sort(key=lambda n: (n["kind"],n["name"]))

    def descendants(root):
        stack = [root]
        while stack:
            current = stack.pop()
            yield current
            stack.extend(reversed(children[current["id"]]))

    rooms = [n for n in nodes if n["kind"] == "ROOM_SUBSTRUCTURE"
             and room_name.casefold() in n["name"].casefold()]
    if not rooms:
        raise RuntimeError("No se encontró una sala activa que contenga "
                           +repr(room_name))
    overview=[]
    for room in rooms:
        territory=list(descendants(room))
        racks=[n for n in territory if n["kind"]=="CONTAINER_RACK"
               and n.get("variant")=="RACK"]
        clusters=[n for n in territory if n["kind"]=="CONTAINER_CLUSTER_BAY"]
        positions=[n for n in territory if n["kind"]=="POSITION"]
        devices=[n for n in territory if n["kind"]=="DEVICE"]
        rack_rows=[]
        for rack in racks:
            below=list(descendants(rack))
            rack_devices=[n for n in below if n["kind"]=="DEVICE"]
            bdfbs=[n for n in rack_devices if n.get("deviceType")=="BDFB"]
            current=rack
            ancestry=[]
            while current.get("parentId") in by_id:
                current=by_id[current["parentId"]]
                ancestry.append({"id":current["id"],"name":current["name"],
                                 "kind":current["kind"]})
                if current["id"]==room["id"]: break
            rack_rows.append({
              "id":rack["id"],"name":rack["name"],
              "bay":next((x for x in ancestry
                  if x["kind"]=="CONTAINER_CLUSTER_BAY"),None),
              "position":next((x for x in ancestry
                  if x["kind"]=="POSITION"),None),
              "casShape":rack.get("casShape"),
              "casEquipped":rack["casEquipped"],
              "casReserved":rack["casReserved"],
              "devices":rack_devices,
              "bdfbs":bdfbs,
              "candidate":(
                  rack.get("casShape") == "array"
                  and not bdfbs
                  and rack["casEquipped"] == 0
                  and rack["casReserved"] == 0
                  and not rack_devices
              ),
            })
        overview.append({
            "room":{"id":room["id"],"name":room["name"]},
            "clusters":[{"id":c["id"],"name":c["name"],"variant":c["variant"]}
                        for c in clusters],
            "positions":[{"id":p["id"],"name":p["name"],
                          "coordinate":p["coordinate"]} for p in positions],
            "racks":rack_rows,
            "deviceCount":len(devices),
        })

    if as_json:
        print(json.dumps({"rooms":overview,"mqttBindingCounts":data["bindingCounts"]},
                         ensure_ascii=False,indent=2))
        return

    for item in overview:
        room=item["room"]
        print("\nSALA:",room["name"],"| id:",room["id"])
        print("Clusters/bahías:",len(item["clusters"]),"| posiciones:",
              len(item["positions"]),"| racks:",len(item["racks"]),
              "| dispositivos:",item["deviceCount"])
        for c in item["clusters"]:
            print("  CLUSTER/BAY",c["name"],"| id:",c["id"],
                  "| variante:",c.get("variant"))
        for r in item["racks"]:
            print("\n  RACK:",r["name"],"| id:",r["id"])
            print("   BAY:",r["bay"]["name"] if r["bay"] else "SIN BAY",
                  "| posición:",r["position"]["name"] if r["position"] else "SIN POSICIÓN")
            if r.get("casShape") != "array":
                print("   CAS NO CANÓNICO:",r.get("casShape"),
                      "· no se considerará rack disponible sin revisión")
            else:
                print("   Ocupación CAS:",r["casEquipped"],"equipados;",
                      r["casReserved"],"reservados")
            for d in r["devices"]:
                print("   DEVICE:",d["name"],"| id:",d["id"],
                      "| tipo:",d.get("deviceType"),
                      "| serial:",d.get("serialNumber","—"),
                      "| rootEquipment:",d.get("rootEquipmentCount",0))
            if r["candidate"]:
                print("   CANDIDATO PARA REVISAR (sin BDFB ni CAS equipado)")
            elif r["bdfbs"]:
                print("   BDFB EXISTENTE: NO MODIFICAR")
            else:
                print("   REQUIERE REVISIÓN de ocupación y capacidad")
    print("\nMQTT BINDINGS ACTIVOS POR FUENTE (no modificar automáticamente):")
    for x in data["bindingCounts"]:
        print(" ",x["source"],"|",x["targetType"],"|",x["count"])
    print("\nSolo diagnóstico. No se insertó ni cambió ninguna entidad.")


def main():
    parser=argparse.ArgumentParser(description="Inventario read-only de rack/BDFB")
    parser.add_argument("--db",default=DEFAULT_DB)
    parser.add_argument("--room",default="SALA DE TRANSMISIONES")
    parser.add_argument("--json",action="store_true",help="Salida JSON")
    args=parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_]{1,100}",args.db):
        parser.error("Nombre de base inválido")
    try:
        report(inventory(args.db),args.room,args.json)
    except (ValueError,RuntimeError,subprocess.TimeoutExpired,KeyError) as exc:
        print("ERROR:",exc,file=sys.stderr)
        sys.exit(1)


if __name__=="__main__":
    main()
