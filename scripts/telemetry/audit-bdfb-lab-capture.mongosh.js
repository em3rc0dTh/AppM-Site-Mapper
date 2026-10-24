/*
 * Strict READ-ONLY end-to-end industrial LAB capture/point coverage audit.
 *
 * docker exec -i appm-site-mapper-mongodb-1 mongosh --quiet --file /dev/stdin \
 *   < scripts/telemetry/audit-bdfb-lab-capture.mongosh.js
 *
 * Reads original MongoDB only. No seeds, updates, index changes or app restarts.
 * A VALID historical observation does not certify that a source is currently
 * LIVE. Modbus and Timescale evidence remain separate acceptance gates.
 */
const DB = "site_mapper_crud_acceptance_02";
const PRIMARY = {
  id: "157fcac1-cb34-44ad-b0e4-c127ad94999a",
  serial: "EMU-BFDB-10",
  rack: "63b7c24c-6a36-4e28-92e6-db1268c43d15",
};
const SOURCES = [
  {
    serial: "LAB-BDFB-02", name: "BDFB-02",
    rack: "5b53762f-cc60-4118-8dbc-94ef841882a4",
  },
  {
    serial: "LAB-BDFB-03", name: "BDFB-03",
    rack: "164fe884-28b0-4d80-b504-af92d0b80f15",
  },
];
const ORIGINAL_SOURCE_BINDINGS = [
  {
    serial: "EMU-BFDB-02",
    id: "auto:mqtt:bb137f93188ec2f23b90b1c40f940d1cc4ce8adb6526e1934c2e9f4936e0dbe8",
    targetId: "540efb3c-d6a8-4633-b6d3-3dc719f511c5",
  },
  {
    serial: "EMU-BFDB-03",
    id: "auto:mqtt:88cffc3d56c7eea4e6dc31b457d72eb20bc77d5a040cbe9190c2abba7579a9b0",
    targetId: "4e9b6c5a-ffc8-4d06-84b2-34845b6cdfaa",
  },
];
const METRIC_FIELDS = [
  ["VOLTAGE", "U1", "V"],
  ["CURRENT", "I1", "A"],
  ["POWER", "P1", "W"],
  ["ENERGY", "EP1", "kWh"],
];
const d = db.getSiblingDB(DB);
const topology = d.topology_nodes;
const bindings = d.telemetry_bindings;
const history = d.industrial_events;
const signals = d.industrial_signals;
let errors = 0;
const MAX_ISSUES = 16;
function report(condition, explanation) {
  if (condition) return true;
  errors++;
  if (errors <= MAX_ISSUES) print("FAIL " + explanation);
  return false;
}
function expectedKey(point, field) {
  return "/reported/" + point + "/" + field;
}
function sampleOkay(row, source, point, key, kind, targetId, expectedUnit) {
  if (!row?.signal) return false;
  const s = row.signal;
  return row.sourceIdentity === source && row.protocol === "MQTT" &&
    s.sourceIdentity === source && s.key === key &&
    s.targetId === targetId && s.kind === kind &&
    s.quality === "VALID" && s.interpretation === "PROFILE" &&
    (expectedUnit === undefined ? (s.enumLabel === "ONLINE" && s.value === 1)
      : (s.unit === expectedUnit && typeof s.value === "number" &&
         Number.isFinite(s.value)));
}
const original = topology.findOne({id:PRIMARY.id});
report(Boolean(original && original.serialNumber === PRIMARY.serial &&
    original.parentId === PRIMARY.rack && original.kind === "DEVICE" &&
    original.deviceType === "BDFB"),
    "Original BDFB-01 device identity changed");
report(topology.countDocuments({deviceId:PRIMARY.id,
  kind:"EQUIPMENT",equipmentType:"CIRCUIT_BREAKER",lifecycle:"ACTIVE"}) === 3,
  "Original BDFB-01 breaker inventory changed from 3");
for (const entry of ORIGINAL_SOURCE_BINDINGS) {
  const link = bindings.findOne({id:entry.id});
  const parent = topology.findOne({id:entry.targetId});
  report(Boolean(link && link.protocol === "MQTT" &&
    link.sourceIdentity === entry.serial && link.metric === "SOURCE" &&
    link.targetType === "EQUIPMENT" && link.targetId === entry.targetId &&
    link.lifecycle === "ACTIVE" && parent?.deviceId === PRIMARY.id &&
    parent.serialNumber === entry.serial && parent.lifecycle === "ACTIVE"),
    "Original " + entry.serial + " source binding/ownership changed");
}
print("=== SITE MAPPER · LAB BDFB INDUSTRIAL CAPTURE AUDIT (READ-ONLY) ===");
for (const x of SOURCES) {
  const device = topology.findOne({kind:"DEVICE",deviceType:"BDFB",
    serialNumber:x.serial, name:x.name,lifecycle:"ACTIVE"});
  if (!report(Boolean(device && device.parentId === x.rack),
      x.serial+" Device/rack not present")) continue;
  const breakerCount = topology.countDocuments({kind:"EQUIPMENT",
    equipmentType:"CIRCUIT_BREAKER",deviceId:device.id,lifecycle:"ACTIVE"});
  report(breakerCount===96,x.serial+" expected 96 installed synthetic breakers");
  const sourceBindings = bindings.find({protocol:"MQTT",
    sourceIdentity:x.serial,lifecycle:"ACTIVE"}).toArray();
  report(sourceBindings.length === 385,
    x.serial+" expected 385 active bindings; got "+sourceBindings.length);
  const source = sourceBindings.filter(b=>b.metric==="SOURCE" &&
    !b.sourcePointId && b.targetType==="DEVICE" && b.targetId===device.id);
  report(source.length===1,x.serial+" source binding mismatch");
  const byBinding = new Map();
  for (const b of sourceBindings) {
    if (!b.sourcePointId) continue;
    const name = b.sourcePointId+"/"+b.metric;
    report(!byBinding.has(name),x.serial+" duplicate MQTT binding "+name);
    byBinding.set(name,b);
  }
  const rows = signals.find({sourceIdentity:x.serial,protocol:"MQTT"},
    {_id:0,sourceIdentity:1,protocol:1,signal:1}).toArray();
  const observed = new Map();
  for (const row of rows) {
    if (row.signal?.key) observed.set(row.signal.key,row);
  }
  let matched = 0, validMetrics = 0, validStates = 0;
  const seenBreakers=new Set();
  const panelCoverage=[];
  for(let panel=1;panel<=4;panel++) {
    let panelValid=0;
    for(let index=1;index<=24;index++) {
      const point="0_"+panel+"_"+index;
      const mappings=METRIC_FIELDS.map(([metric])=>
        byBinding.get(point+"/"+metric));
      const targetId=mappings[0]?.targetId;
      const allBound=mappings.length===4 && mappings.every(b=>
        b && b.targetType==="EQUIPMENT" && b.targetId===targetId);
      const breaker=targetId?topology.findOne({id:targetId}):null;
      const good=allBound && breaker?.kind==="EQUIPMENT" &&
        breaker.equipmentType==="CIRCUIT_BREAKER" &&
        breaker.deviceId===device.id && breaker.lifecycle==="ACTIVE";
      if(!report(Boolean(good),x.serial+" invalid breaker point "+point))continue;
      seenBreakers.add(targetId);
      let circuitValid=0;
      for(const [metric,wire,unit] of METRIC_FIELDS) {
        const key=expectedKey(point,wire);
        if(sampleOkay(observed.get(key),x.serial,point,key,
          "measurement",targetId,unit)){
          validMetrics++;
          circuitValid++;
        } else {
          report(false,x.serial+" not PROFILE/VALID "+key);
        }
      }
      const stateKey=expectedKey(point,"state");
      if(sampleOkay(observed.get(stateKey),x.serial,point,stateKey,
        "state",targetId,undefined)){
        validStates++;
        circuitValid++;
      } else {
        report(false,x.serial+" not PROFILE/VALID "+stateKey);
      }
      if(circuitValid===5){ matched++;panelValid++; }
    }
    panelCoverage.push("P"+panel+"="+panelValid+"/24");
  }
  report(seenBreakers.size===96,x.serial+" breakers aren't 96 distinct targets");
  report(matched===96,x.serial+" expected 96 fully valid panel circuits");
  const eventCount=history.countDocuments({protocol:"MQTT",sourceIdentity:x.serial});
  const latest=history.find({protocol:"MQTT",sourceIdentity:x.serial},
    {_id:0,eventId:1,receivedAt:1}).sort({receivedAt:-1}).limit(1).toArray()[0];
  report(eventCount>=4,x.serial+" expected at least four persisted MQTT events");
  const last=latest?.receivedAt;
  const age=typeof last==="string"?Math.round((Date.now()-Date.parse(last))/1000):null;
  const current=age!==null&&age>=0&&age<=90;
  print(x.name+" | raw events="+eventCount+" | industrial catalog="+rows.length+
    " | 4-metric VALID="+validMetrics+"/384"+
    " | ONLINE/VALID="+validStates+"/96"+
    " | fully verified circuits="+matched+"/96");
  print("  "+panelCoverage.join(" ")+" | last event="+(last??"never")+
    " | age="+(age===null?"unknown":age+"s")+
    " | recent<=90s="+(current?"YES":"NO"));
  if (!current)
    print("  NOTE: older VALID observations are historical, not proof of current LIVE.");
}
print("RESULT: "+(errors===0?"PASS — full historical 2x96 circuit capture coverage":
  "FAIL — "+errors+" discrepancy(s), no writes")+" | Modbus/Timescale/UI not certified");
if(errors>0)quit(2);
