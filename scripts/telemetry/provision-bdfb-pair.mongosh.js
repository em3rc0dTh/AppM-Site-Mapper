/*
 * Site Mapper — targeted BFDB-02/BFDB-03 industrial SIMULATION fixture.
 *
 * Dry run:
 *   docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet \
 *     --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
 *
 * Atomic apply only after confirmed backup and preflight with zero conflicts:
 *   docker exec -i -e SITEMAPPER_PROVISION_MODE=apply \
 *     appm-site-mapper-mongodb-1 mongosh --quiet \
 *     --file /dev/stdin < scripts/telemetry/provision-bdfb-pair.mongosh.js
 *
 * This does NOT copy BDFB-01, alter original bindings, touch SNMP shunts,
 * change geometry, modify original users or rewrite Modbus configuration.
 * The source/position bindings are SIMULATED. Never use for field equipment.
 */
const DB_NAME = "site_mapper_crud_acceptance_02";
const ROOM_ID = "2edcffc1-f1ef-454a-a044-c622480002cc";
const ORIGINAL = {
  device: "157fcac1-cb34-44ad-b0e4-c127ad94999a",
  rack: "63b7c24c-6a36-4e28-92e6-db1268c43d15",
  name: "BDFB-01",
};
const PLAN = [
  {
    name: "BDFB-02", serial: "EMU-BFDB-02",
    rack: "5b53762f-cc60-4118-8dbc-94ef841882a4",
    rackName: "Rack-01-Bay-02", bay: "19dc1a19-cc45-4cd7-94a0-1223ff3794f9",
  },
  {
    name: "BDFB-03", serial: "EMU-BFDB-03",
    rack: "164fe884-28b0-4d80-b504-af92d0b80f15",
    rackName: "Rack-01-Bay-03", bay: "1d7033f4-d202-4952-8858-e200280a8c47",
  },
];
const mode = typeof process !== "undefined"
  ? process.env.SITEMAPPER_PROVISION_MODE || "plan" : "plan";
if (!["plan", "apply"].includes(mode)) throw new Error("Invalid provisioning mode");
const d = db.getSiblingDB(DB_NAME);
const now = new Date().toISOString();
const topo = d.topology_nodes, links = d.telemetry_bindings;
function guard(condition, message) {
  if (!condition) throw new Error("PREFLIGHT BLOCKED: " + message);
}
function entityId() {
  const match = String(UUID()).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  guard(Boolean(match), "UUID generator is unavailable");
  return match[0];
}
const base = (name, kind, parentId) => ({
  id:entityId(),name,kind,parentId,
  lifecycle:"ACTIVE",createdAt:now,updatedAt:now,
});
function createFixture(spec, placement) {
  const nodes = [], bindings = [];
  const device = {
    ...base(spec.name,"DEVICE",spec.rack), pinned:false, deviceType:"BDFB",
    serialNumber:spec.serial, category:"SYNTHETIC MQTT commissioning",
    rootEquipmentIds:[],
    attributes:{synthetic:true,sourceIdentity:spec.serial},
  };
  nodes.push(device);
  function part(parent, equipmentType, name, size, slot, pointPrefix) {
    const equipment = {
      ...base(name,"EQUIPMENT",parent.id),
      deviceId:device.id,equipmentType,
      parentEquipmentId:parent.kind==="DEVICE"?null:parent.id,
      childMode:size>0?"POSITIONAL":"DYNAMIC",
      children:size>0?Array(size).fill(null):[],
      accessPorts:[],pinned:false,
      attributes:{synthetic:true},
      ...(pointPrefix?{telemetryPointPrefix:pointPrefix}:{}),
    };
    if(equipmentType==="CIRCUIT_BREAKER") {
      equipment.accessPorts=[{
        id:equipment.id+":power-out",deviceId:device.id,equipmentId:equipment.id,
        name:"Power output",portType:"POWER",direction:"OUTPUT",
        exposure:"EXTERNAL",lifecycle:"ACTIVE",
      }];
    }
    if(parent.kind==="DEVICE")parent.rootEquipmentIds.push(equipment.id);
    else {
      guard(parent.childMode==="POSITIONAL","Parent must use positional slots");
      guard(Number.isInteger(slot)&&slot>=0&&slot<parent.children.length,"Invalid slot");
      guard(parent.children[slot]===null,"Slot already occupied");
      parent.children[slot]=equipment.id;
    }
    nodes.push(equipment);
    return equipment;
  }
  const chassis=part(device,"CHASSIS",spec.name+" · BDFB CHASSIS #1",1,undefined);
  const shelf=part(chassis,"SHELF",spec.name+" SHELF",2,0);
  let count=0;
  for(let frameIndex=0;frameIndex<2;frameIndex++){
    const f=String(frameIndex+1).padStart(2,"0");
    const frame=part(shelf,"FRAME",spec.name+"-SHELF-01-FRAME-"+f,2,frameIndex);
    for(let panelIndex=0;panelIndex<2;panelIndex++){
      const p=String(panelIndex+1).padStart(2,"0");
      const group=frameIndex*2+panelIndex+1;
      const panel=part(frame,"PANEL",frame.name+"-PANEL-"+p,24,panelIndex,"0_"+group);
      for(let position=1;position<=24;position++){
        const n=String(position).padStart(2,"0");
        const breaker=part(panel,"CIRCUIT_BREAKER",
          spec.name+"-PANEL-"+String(group).padStart(2,"0")+"-CB-"+n,0,position-1);
        const point="0_"+group+"_"+position;
        for(const metric of ["VOLTAGE","CURRENT","POWER","ENERGY"]){
          bindings.push({
            ...base("mqtt:"+spec.serial+":"+point+":"+metric,"BINDING",null),
            protocol:"MQTT",sourceIdentity:spec.serial,sourcePointId:point,
            metric,targetType:"EQUIPMENT",targetId:breaker.id,
            attributes:{synthetic:true,commissioning:"SITE_MAPPER_LAB"},
          });
        }
        count++;
      }
    }
  }
  const allocation=placement.allocation;
  chassis.rackPlacement={
    rackId:spec.rack,mode:"U_RANGE",
    startU:allocation.mountStartU,sizeU:allocation.physicalSizeU,
    ...(allocation.clearanceTopU?{clearanceTopU:allocation.clearanceTopU}:{}),
    ...(allocation.clearanceBottomU?{clearanceBottomU:allocation.clearanceBottomU}:{}),
  };
  bindings.push({
    ...base("mqtt:"+spec.serial+":SOURCE","BINDING",null),
    protocol:"MQTT",sourceIdentity:spec.serial,
    metric:"SOURCE",targetType:"DEVICE",targetId:device.id,
    attributes:{synthetic:true,commissioning:"SITE_MAPPER_LAB"},
  });
  return {nodes,bindings,chassis,device,count};
}

const original=topo.findOne({id:ORIGINAL.device});
const originalRack=topo.findOne({id:ORIGINAL.rack});
guard(original?.kind==="DEVICE"&&original.deviceType==="BDFB" &&
      original.name===ORIGINAL.name&&original.parentId===ORIGINAL.rack,
      "Original BDFB-01 has changed; do not alter any other equipment");
guard(originalRack?.kind==="CONTAINER_RACK"&&Array.isArray(originalRack.cas),
      "Original BDFB rack CAS unavailable");
guard(Array.isArray(original.rootEquipmentIds)&&original.rootEquipmentIds.length===1,
      "Original BDFB does not have exactly one root chassis");
const originalAllocation=originalRack.cas.find(r=>
  r.state==="EQUIPPED"&&r.occupantId===original.rootEquipmentIds[0]);
guard(Boolean(originalAllocation)&&Number.isInteger(originalAllocation.mountStartU)
      &&Number.isInteger(originalAllocation.physicalSizeU),
      "Cannot safely infer existing BDFB rack mounting geometry");
const input={
  mountStartU:originalAllocation.mountStartU,
  physicalSizeU:originalAllocation.physicalSizeU,
  clearanceTopU:originalAllocation.clearanceTopU || 0,
  clearanceBottomU:originalAllocation.clearanceBottomU || 0,
};
const start=input.mountStartU-input.clearanceBottomU;
const end=input.mountStartU+input.physicalSizeU-1+input.clearanceTopU;
guard(start>=1&&end>=start,"Invalid original placement geometry");
const workloads=[];
for(const spec of PLAN){
  const rack=topo.findOne({id:spec.rack});
  guard(rack?.kind==="CONTAINER_RACK"&&rack.variant==="RACK"&&
    rack.name===spec.rackName&&rack.lifecycle==="ACTIVE",spec.name+" rack mismatch");
  const position=topo.findOne({id:rack.parentId});
  guard(position?.kind==="POSITION"&&position.parentId===spec.bay,
        spec.name+" rack parent position/bay mismatch");
  const bay=topo.findOne({id:spec.bay});
  guard(bay?.kind==="CONTAINER_CLUSTER_BAY"&&bay.lifecycle==="ACTIVE"&&
    bay.parentId===ROOM_ID,spec.name+" room/bay mismatch");
  guard(Number.isInteger(rack.totalU)&&rack.totalU>=end,
    spec.name+" rack cannot fit the original BDFB mounting range");
  guard(Array.isArray(rack.cas)&&rack.cas.length===1 &&
    rack.cas[0].state==="AVAILABLE"&&rack.cas[0].startU===1 &&
    rack.cas[0].endU===rack.totalU,
    spec.name+" requires completely free, canonical rack CAS");
  guard(topo.countDocuments({parentId:rack.id,lifecycle:"ACTIVE"})===0,
    spec.name+" target rack has installed device or inventory records");
  guard(topo.countDocuments({serialNumber:spec.serial,lifecycle:"ACTIVE"})===0,
    spec.name+" source serial already assigned: "+spec.serial);
  const preexisting=links.find({
    protocol:"MQTT",sourceIdentity:spec.serial,lifecycle:"ACTIVE",
  }).toArray();
  const collision=preexisting.map(b=>{
    const target=topo.findOne({id:b.targetId});
    return {
      bindingId:b.id,metric:b.metric,sourcePointId:b.sourcePointId||null,
      targetId:b.targetId,targetName:target?.name||"NOT FOUND",
      targetKind:target?.kind||"NOT FOUND",
    };
  });
  workloads.push({spec,rack,collision});
}
print("\nSITE MAPPER SIMULATED COMMISSIONING");
print("mode="+mode+" | DB="+DB_NAME+
      " | source chassis geometry="+JSON.stringify(input));
for(const x of workloads){
  print("\n"+x.spec.name+" -> "+x.spec.rackName+
    " ("+x.spec.rack+") -> "+x.spec.serial);
  print("Model: 1 chassis, 1 shelf, 2 frames, 4 panels, "+
        "96 INSTALLLED synthetic breaker positions, 385 MQTT bindings");
  print("Existing MQTT bindings for this source: "+x.collision.length);
  for(const link of x.collision) print("  CONFLICT/CHECK: "+JSON.stringify(link));
}
if(mode==="plan"){
  print("\nPLAN ONLY. No writes performed.");
  if(workloads.some(x=>x.collision.length))
    print("BLOCKED FOR APPLY: existing MQTT bindings must be reviewed"+
          " before any new source routing is commissioned.");
  else print("No source-binding conflicts found. Atomic apply would be permitted "+
             "after verifying backups.");
} else {
  guard(workloads.every(x=>x.collision.length===0),
    "Existing MQTT bindings found. Refusing automatic reassignment; "+
    "inspect listed targets and explicitly commission the source mapping first.");
  const documents=[],bindings=[],casWrites=[];
  for(const x of workloads){
    const fx=createFixture(x.spec,{allocation:input});
    documents.push(...fx.nodes);
    bindings.push(...fx.bindings);
    const prefix=[];
    if(start>1)prefix.push({
      id:x.rack.cas[0].id,startU:1,endU:start-1,state:"AVAILABLE",
    });
    const equipped={
      id:entityId(),startU:start,endU:end,state:"EQUIPPED",
      occupantId:fx.chassis.id,mountStartU:input.mountStartU,
      physicalSizeU:input.physicalSizeU,
      ...(input.clearanceTopU?{clearanceTopU:input.clearanceTopU}:{}),
      ...(input.clearanceBottomU?{clearanceBottomU:input.clearanceBottomU}:{}),
    };
    const suffix=end<x.rack.totalU?[{
      id:entityId(),startU:end+1,endU:x.rack.totalU,state:"AVAILABLE",
    }]:[];
    casWrites.push({rack:x.rack,cas:[...prefix,equipped,...suffix]});
  }
  const session=db.getMongo().startSession();
  try{
    session.startTransaction({readConcern:{level:"snapshot"},writeConcern:{w:"majority"}});
    const td=session.getDatabase(DB_NAME);
    for(const p of casWrites){
      const result=td.topology_nodes.updateOne({
        id:p.rack.id,updatedAt:p.rack.updatedAt,
      },{$set:{cas:p.cas,updatedAt:now}});
      guard(result.matchedCount===1,
        "Concurrent rack mutation detected ("+p.rack.name+")");
    }
    td.topology_nodes.insertMany(documents,{ordered:true});
    td.telemetry_bindings.insertMany(bindings,{ordered:true});
    session.commitTransaction();
    print("APPLY COMMITTED: "+documents.length+" topology documents, "+
       bindings.length+" synthetic MQTT bindings, 2 rack CAS allocations.");
    print("Original BDFB-01, historical telemetry and SNMP shunts unchanged.");
  } catch(error){
    try{session.abortTransaction();}catch(_ignored){}
    throw error;
  } finally{session.endSession();}
}
