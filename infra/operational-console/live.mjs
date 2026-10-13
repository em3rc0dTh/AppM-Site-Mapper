import mqtt from 'mqtt';

const metrics={VOLTAGE:['U1','voltageV'],CURRENT:['I1','currentA'],POWER:['P1','powerW'],ENERGY:['EP1','energyKwh']};

export class IndependentLiveReader {
  constructor(database,{topicPrefix='data/dev/',maxAgeMs=30000}={}){
    this.database=database;this.topicPrefix=topicPrefix;this.maxAgeMs=maxAgeMs;
    this.state=new Map();this.client=null;this.connected=false;
  }
  async accept(topic,buffer,now=Date.now()){
    if(!topic.startsWith(this.topicPrefix)||buffer.length>262144)return false;
    const serial=topic.slice(this.topicPrefix.length);
    if(!serial||/[\/#\u0000-\u001f]/.test(serial))return false;
    let packet;
    try{packet=JSON.parse(buffer.toString('utf8'))}catch{return false}
    if(!packet||packet.method!=='update'||packet.sn!==serial||
       !packet.reported||typeof packet.reported!=='object'||Array.isArray(packet.reported))return false;
    const timestamp=Number(packet.timestamp);
    if(!Number.isFinite(timestamp)||timestamp<=0||Math.abs(now-timestamp*1000)>300000)return false;
    const [owners,bindings]=await Promise.all([
      this.database.collection('topology_nodes').find({serialNumber:serial,lifecycle:'ACTIVE',kind:{$in:['DEVICE','EQUIPMENT']}}).limit(2).toArray(),
      this.database.collection('telemetry_bindings').find({protocol:'MQTT',sourceIdentity:serial,lifecycle:'ACTIVE',targetType:'EQUIPMENT',sourcePointId:{$exists:true}}).limit(1000).toArray()
    ]);
    if(owners.length!==1||bindings.length===0)return false;
    const byPoint=new Map();
    for(const binding of bindings){
      if(!metrics[binding.metric])continue;
      const key=binding.sourcePointId;
      const value=byPoint.get(key)||{targetId:binding.targetId,allowed:new Set()};
      if(value.targetId!==binding.targetId){byPoint.delete(key);continue}
      value.allowed.add(binding.metric);byPoint.set(key,value);
    }
    const targetIds=[...new Set([...byPoint.values()].map(x=>x.targetId))];
    const targets=await this.database.collection('topology_nodes').find({id:{$in:targetIds},kind:'EQUIPMENT',equipmentType:'CIRCUIT_BREAKER',lifecycle:'ACTIVE'}).limit(500).toArray();
    const valid=new Set(targets.map(x=>x.id));
    let accepted=false;
    for(const [point,raw] of Object.entries(packet.reported)){
      const binding=byPoint.get(point);
      if(!binding||!valid.has(binding.targetId)||!raw||typeof raw!=='object'||Array.isArray(raw))continue;
      const key=serial+'\0'+point+'\0'+binding.targetId;
      const prev=this.state.get(key)||{source:serial,rawPoint:point,breakerId:binding.targetId};
      const next={...prev,receivedAt:new Date(now).toISOString()};
      let changed=false;
      for(const metric of binding.allowed){
        const [wire,field]=metrics[metric];
        if(!(wire in raw))continue;
        const n=typeof raw[wire]==='number'?raw[wire]:typeof raw[wire]==='string'&&raw[wire].trim()?Number(raw[wire]):NaN;
        if(Number.isFinite(n)){next[field]=n;changed=true}
      }
      if(changed){this.state.set(key,next);accepted=true}
    }
    if(this.state.size>5000){
      for(const [key,val] of this.state)if(now-Date.parse(val.receivedAt)>600000)this.state.delete(key);
    }
    return accepted;
  }
  rows(now=Date.now()){
    return [...this.state.values()].map(x=>({...x,status:now-Date.parse(x.receivedAt)<=this.maxAgeMs?'LIVE':'STALE'}));
  }
  start(url,{username,password,topicFilter='data/dev/#'}={}){
    if(!url)return;
    const endpoint=new URL(url);
    if(!['mqtt:','mqtts:'].includes(endpoint.protocol))throw Error('MQTT_BROKER_URL must be mqtt or mqtts');
    if(process.env.NODE_ENV==='production'&&(endpoint.protocol!=='mqtts:'||!username||!password))throw Error('MQTT_TLS_AUTH_REQUIRED');
    this.client=mqtt.connect(url,{username,password,clientId:'site-mapper-console-'+Math.random().toString(36).slice(2),reconnectPeriod:1500,connectTimeout:5000,clean:true});
    this.client.on('connect',()=>{this.connected=true;this.client.subscribe(topicFilter,{qos:1});});
    this.client.on('close',()=>{this.connected=false;});
    this.client.on('error',()=>{this.connected=false;});
    this.client.on('message',(topic,payload)=>{void this.accept(topic,payload).catch(()=>{});});
  }
  close(){this.client?.end(true);}
}
