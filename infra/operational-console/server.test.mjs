import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './server.mjs';

const fixtures={
  topology_nodes:[
    {id:'net',kind:'NETWORK',name:'Network',parentId:null,lifecycle:'ACTIVE'},
    {id:'site',kind:'SITE',name:'Site Lima',parentId:'net',lifecycle:'ACTIVE'},
    {id:'rack',kind:'CONTAINER_RACK',name:'Rack A',parentId:'site',lifecycle:'ACTIVE'},
    {id:'dev',kind:'DEVICE',name:'BDFB 01',parentId:'rack',lifecycle:'ACTIVE'},
    {id:'breaker',kind:'EQUIPMENT',name:'Breaker 1',parentId:'dev',deviceId:'dev',lifecycle:'ACTIVE',
      accessPorts:[{id:'ap-out',name:'Output',direction:'OUTPUT'}]},
    {id:'receiver',kind:'EQUIPMENT',name:'Load',parentId:'dev',deviceId:'dev',lifecycle:'ACTIVE',
      accessPorts:[{id:'ap-in',name:'Input',direction:'INPUT'}]},
  ],
  power_paths:[{id:'pp',sourceAccessPortId:'ap-out',targetAccessPortId:'ap-in',feed:'A',lifecycle:'ACTIVE'}],
  telemetry_bindings:[{id:'bind',sourceIdentity:'EMU-01',sourcePointId:'0_1_1',metric:'VOLTAGE',targetId:'breaker',targetType:'EQUIPMENT',lifecycle:'ACTIVE'}],
};
function fakeDB() { return { collection(name) { return { find() { return { sort() { return this; }, limit() { return this; }, toArray: async () => fixtures[name] || [] }; } }; } }; }
async function runServer() {
  const server=await createServer({database:fakeDB(),login:async()=>new Response('{}',{status:200,headers:{'set-cookie':'appm_session=unit-test-cookie; HttpOnly'}})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {server,base:'http://127.0.0.1:'+server.address().port};
}
test('denies anonymous inventory, PowerPath, telemetry binding and mutations',async()=>{
 const {server,base}=await runServer();
 try{for(const path of ['/api/table?view=inventory','/api/table?view=power','/api/table?view=bindings','/api/export?view=inventory'])assert.equal((await fetch(base+path)).status,401);
 assert.equal((await fetch(base+'/api/mutate',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 }finally{await new Promise(r=>server.close(r))}
});
test('authorized account can inspect hierarchy and exact cross-Equipment PowerPath',async()=>{
 const {server,base}=await runServer();
 try{
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'op@test',password:'valid'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const json=async path=>(await (await fetch(base+path,{headers:{cookie}})).json());
 const inventory=await json('/api/table?view=inventory');
 assert.equal(inventory.rows.find(x=>x.id==='breaker').site,'Site Lima');
 assert.match(inventory.rows.find(x=>x.id==='breaker').path,/Network.*Site Lima.*BDFB 01.*Breaker 1/);
 const power=await json('/api/table?view=power');
 assert.equal(power.rows[0].sourcePortId,'ap-out');
 assert.equal(power.rows[0].targetEquipment,'Load');
 assert.equal((await json('/api/table?view=bindings')).rows[0].rawPoint,'0_1_1');
 const csv=await fetch(base+'/api/export?view=power',{headers:{cookie}});
 assert.equal(csv.status,200);assert.match(await csv.text(),/ap-out/);
 }finally{await new Promise(r=>server.close(r))}
});
test('blocks spatial mutations even for authenticated operator and invalid origin',async()=>{
 const {server,base}=await runServer();
 try{
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 const cookie=login.headers.get('set-cookie').split(';')[0];
 let bad=await fetch(base+'/api/mutate',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({operation:'topology',kind:'SITE',name:'Unsafe'})});
 assert.equal(bad.status,400);assert.equal((await bad.json()).error,'SPATIAL_CREATION_FORBIDDEN');
 bad=await fetch(base+'/api/mutate',{method:'POST',headers:{cookie,origin:'https://external.invalid','content-type':'application/json'},body:'{}'});
 assert.equal(bad.status,403);
 }finally{await new Promise(r=>server.close(r))}
});
