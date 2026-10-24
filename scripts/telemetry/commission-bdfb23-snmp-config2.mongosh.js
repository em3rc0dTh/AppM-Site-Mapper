/*
 * Existing ORIGINAL Site Mapper Mongo: synthetic SNMP Config2 A/B for LAB BDFB-02/03.
 * Default READ ONLY. Requires running Mongo RS and exact existing LAB ownership.
 * APPLY must be called only via commission-bdfb23-snmp-config2.py, which first
 * captures and checksums a fresh Mongo backup. No physical verification claims.
 *
 * This script does not alter BDFB-01, original EMU MQTT publishers,
 * 192 existing LAB breakers, their MQTT bindings, Modbus, or Timescale history.
 */
const DB_NAME='site_mapper_crud_acceptance_02';
const MODE=process.env.SITEMAPPER_SNMP_CONFIG2_MODE||'plan';
const ACK=process.env.SITEMAPPER_SNMP_CONFIG2_ACK||'';
if (!['plan','apply'].includes(MODE)) throw Error('MODE must be plan/apply');
if (MODE==='apply' && ACK!=='LAB_SYNTHETIC_ONLY') throw Error('Explicit LAB_SYNTHETIC_ONLY acknowledgement required');
const SLOTS=['A','B'];
const TARGETS=[
  {name:'BDFB-02',serial:'LAB-BDFB-02',source:'EMU-DELTA-BFDB-02'},
  {name:'BDFB-03',serial:'LAB-BDFB-03',source:'EMU-DELTA-BFDB-03'}
];
const origSource='EMU-DELTA-BFDB-01';
const origDevice='BDFB-01';
const root='1.3.6.1.4.1.8072.9999.2026.48';
function check(ok,reason) {if(!ok)throw Error('SNMP CONFIG2 BLOCKED: '+reason);}
const expectedOid=(slot,metric)=>{
  const ix=slot==='A'?1:2;
  return root+'.'+(metric==='CURRENT'?1:2)+'.'+ix+'.0';
};
const portId=(source,slot)=>'lab:snmp:'+source+':'+slot;
const bindingId=(source,slot,metric)=>portId(source,slot)+':'+metric;
function active(q){return q?.lifecycle==='ACTIVE';}
function collect(dbh){
  const nodes=dbh.topology_nodes,bindings=dbh.telemetry_bindings;
  const original=nodes.find({kind:'DEVICE',deviceType:'BDFB',
    name:origDevice,lifecycle:'ACTIVE'}).toArray();
  check(original.length===1,'original BDFB-01 missing/duplicated');
  const origSnmp=bindings.find({protocol:'SNMP',sourceIdentity:origSource,
    lifecycle:'ACTIVE'}).toArray();
  check(origSnmp.length===4 && origSnmp.every(x=>
    x.attributes?.commissioning==='SYNTHETIC_LAB_ONLY'),
    'original BDFB-01 SNMP binding fingerprint changed');
  const staged=[];
  for(const target of TARGETS){
    const devices=nodes.find({kind:'DEVICE',name:target.name,deviceType:'BDFB',
      serialNumber:target.serial,lifecycle:'ACTIVE'}).toArray();
    check(devices.length===1,target.name+' must identify exactly one LAB Device');
    const device=devices[0];
    check(device.attributes?.synthetic===true,
      target.name+' synthetic provenance missing');
    check(Array.isArray(device.rootEquipmentIds)&&device.rootEquipmentIds.length===1,
      target.name+' must own one CHASSIS');
    const chassis=nodes.findOne({id:device.rootEquipmentIds[0],
      kind:'EQUIPMENT',equipmentType:'CHASSIS',deviceId:device.id,lifecycle:'ACTIVE'});
    check(chassis && chassis.parentId===device.id &&
      chassis.parentEquipmentId===null && Array.isArray(chassis.accessPorts),
      target.name+' original CHASSIS shape changed');
    const equip=nodes.find({kind:'EQUIPMENT',deviceId:device.id,
      lifecycle:'ACTIVE'}).toArray();
    const panels=equip.filter(x=>x.equipmentType==='PANEL');
    const breakers=equip.filter(x=>x.equipmentType==='CIRCUIT_BREAKER');
    check(panels.length===4&&breakers.length===96,
      target.name+' must preserve four panels and 96 breakers');
    const byPrefix=new Map(panels.map(p=>[p.telemetryPointPrefix,p]));
    check(byPrefix.size===4&&[1,2,3,4].every(n=>byPrefix.has('0_'+n)),
      target.name+' panel MQTT prefixes are not exact 0_1 through 0_4');
    const mqtt=bindings.find({protocol:'MQTT',sourceIdentity:target.serial,
      lifecycle:'ACTIVE'}).toArray();
    check(mqtt.length===385 && mqtt.filter(x=>x.metric==='SOURCE').length===1,
      target.name+' existing 385 MQTT bindings have drifted');
    const incoming=equip.flatMap(owner=>(owner.accessPorts||[]).filter(p=>
      active(p)&&p.attributes?.snmpFeedInput===true));
    const prior=bindings.find({protocol:'SNMP',sourceIdentity:target.source,
      lifecycle:'ACTIVE'}).toArray();
    const profile=device.attributes?.bdfbHardwareProfile??null;
    const empty=profile===null&&incoming.length===0&&prior.length===0;
    const expectedPorts=SLOTS.map(slot=>{
      const panelsForSide=(slot==='A'?[1,2]:[3,4]).map(n=>byPrefix.get('0_'+n).id);
      return {
        id:portId(target.source,slot),deviceId:device.id,
        equipmentId:chassis.id,name:'INPUT-SHUNT-'+slot,
        portType:'POWER',direction:'INPUT',exposure:'EXTERNAL',
        protocol:'SNMP',lifecycle:'ACTIVE',
        attributes:{
          feed:slot,snmpFeedInput:true,independentInputConfirmed:false,
          servedPanelIds:panelsForSide
        }
      };
    });
    const expectedBindings=expectedPorts.flatMap(port=>
      ['CURRENT','VOLTAGE'].map(metric=>({
        id:bindingId(target.source,port.attributes.feed,metric),
        protocol:'SNMP',sourceIdentity:target.source,
        sourcePointId:expectedOid(port.attributes.feed,metric),
        metric,unit:metric==='CURRENT'?'A':'V',
        targetType:'ACCESS_PORT',targetId:port.id,
        attributes:{commissioning:'SYNTHETIC_LAB_ONLY',
          bdfbDeviceId:device.id,equipmentId:chassis.id,feedName:port.name}
      })));
    const matched=profile==='ELTEK_BDCBB_CONFIG_2' &&
      incoming.length===2 && prior.length===4 &&
      expectedPorts.every(p=>{
        const existing=incoming.find(x=>x.id===p.id);
        return existing && existing.equipmentId===chassis.id &&
          existing.deviceId===device.id && existing.name===p.name &&
          existing.portType==='POWER'&&existing.direction==='INPUT'&&
          existing.exposure==='EXTERNAL' && existing.protocol==='SNMP'&&
          JSON.stringify(existing.attributes)===JSON.stringify(p.attributes);
      }) && expectedBindings.every(w=>{
        const x=prior.find(b=>b.id===w.id);
        return x && x.protocol===w.protocol &&
          x.sourceIdentity===w.sourceIdentity && x.sourcePointId===w.sourcePointId &&
          x.metric===w.metric && x.unit===w.unit &&
          x.targetType===w.targetType && x.targetId===w.targetId &&
          JSON.stringify(x.attributes)===JSON.stringify(w.attributes);
      });
    check(empty||matched,target.name+
      ' has partial or conflicting SNMP state (refusing overwrites)');
    check(!equip.some(owner=>owner.id!==chassis.id && (owner.accessPorts||[]).some(p=>
      active(p)&&p.portType==='POWER'&&p.direction==='INPUT'&&
      p.attributes?.snmpFeedInput===true)),
      target.name+' SNMP input unexpectedly owned outside CHASSIS');
    // Protect against a previously claimed synthetic OID/port elsewhere.
    for(const b of expectedBindings){
      const claimed=bindings.find({protocol:'SNMP',sourceIdentity:b.sourceIdentity,
        metric:b.metric,sourcePointId:b.sourcePointId,lifecycle:'ACTIVE'}).toArray();
      check((empty&&claimed.length===0) ||
        (matched&&claimed.length===1&&claimed[0].id===b.id),
        target.name+' SNMP OID is already claimed');
      const byId=bindings.find({id:b.id}).toArray();
      check((empty&&byId.length===0) ||
        (matched&&byId.length===1&&byId[0].targetId===b.targetId),
        target.name+' binding ID collision');
    }
    if(empty) {
      for(const p of expectedPorts) check(!chassis.accessPorts.some(existing=>
        active(existing) && (existing.id===p.id||existing.name===p.name)),
        target.name+' CHASSIS access port conflict');
    }
    staged.push({target,device,chassis,ports:expectedPorts,
      bindings:expectedBindings,state:matched?'ALREADY_READY':'READY'});
  }
  return staged;
}
const state=collect(db.getSiblingDB(DB_NAME));
for(const item of state)
  print(item.target.name+' · SNMP synthetic Config2 A/B · '+
    item.state+' · 4 panels · 96 untouched breakers · 2 feeds · 4 OIDs');
if(MODE==='plan'){
  print('PLAN ONLY · no writes; apply requires a new verified Mongo backup.');
} else {
  check(state.every(s=>s.state==='READY') ||
    state.every(s=>s.state==='ALREADY_READY'),
    'mixed commissioning state, manual review required');
  if(state.every(s=>s.state==='ALREADY_READY')) {
    print('ALREADY COMMITTED · 0 writes');
  } else {
    const session=db.getMongo().startSession();
    try {
      session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
      const tx=session.getDatabase(DB_NAME);
      const next=collect(tx);
      check(next.every(s=>s.state==='READY'),
        'concurrent commissioning occurred during transaction');
      const now=new Date().toISOString();
      for(const item of next){
        const result=tx.topology_nodes.updateOne({
          id:item.device.id,lifecycle:'ACTIVE',
          updatedAt:item.device.updatedAt,
        },{$set:{
          attributes:{...item.device.attributes,bdfbHardwareProfile:'ELTEK_BDCBB_CONFIG_2'},
          updatedAt:now
        }});
        check(result.matchedCount===1,
          item.target.name+' Device changed concurrently');
        const ports=item.chassis.accessPorts.concat(item.ports);
        const ch=tx.topology_nodes.updateOne({
          id:item.chassis.id,lifecycle:'ACTIVE',
          updatedAt:item.chassis.updatedAt,
        },{$set:{accessPorts:ports,updatedAt:now}});
        check(ch.matchedCount===1,
          item.target.name+' CHASSIS changed concurrently');
        const docs=item.bindings.map(w=>({...w,lifecycle:'ACTIVE',
          createdAt:now,updatedAt:now}));
        tx.telemetry_bindings.insertMany(docs,{ordered:true});
      }
      session.commitTransaction();
      print('SNMP CONFIG2 COMMITTED · 2 LAB devices + 4 new A/B ports + '+
        '8 SNMP synthetic-only bindings; no existing bindings modified');
    } catch(e){
      try{session.abortTransaction();}catch(_){}
      throw e;
    } finally {session.endSession();}
  }
}
