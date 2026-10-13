import test from 'node:test';
import assert from 'node:assert/strict';
import { IndependentLiveReader } from './live.mjs';

const db = {
  collection(name) {
    return {
      find(query) {
        let data = name === 'topology_nodes'
          ? [
              { id: 'publisher', serialNumber: 'EMU-BFDB-01', kind: 'DEVICE', lifecycle: 'ACTIVE' },
              { id: 'breaker', kind: 'EQUIPMENT', equipmentType: 'CIRCUIT_BREAKER', lifecycle: 'ACTIVE' },
            ]
          : [
              { protocol: 'MQTT', sourceIdentity: 'EMU-BFDB-01', sourcePointId: '0_1_1', targetType: 'EQUIPMENT', targetId: 'breaker', metric: 'VOLTAGE', lifecycle: 'ACTIVE' },
              { protocol: 'MQTT', sourceIdentity: 'EMU-BFDB-01', sourcePointId: '0_1_1', targetType: 'EQUIPMENT', targetId: 'breaker', metric: 'CURRENT', lifecycle: 'ACTIVE' },
            ];
        if (query?.id?.$in) data = data.filter(item => query.id.$in.includes(item.id));
        return { limit() { return this; }, toArray: async () => data };
      },
    };
  },
};
const reader=new IndependentLiveReader(db);
function packet(serial,value,at=Date.now()){return Buffer.from(JSON.stringify({method:'update',sn:serial,timestamp:at/1000,reported:{'0_1_1':{U1:value,I1:'2.1'},'0_1_2':{U1:'99'}}}));}
test('maps only commissioned breaker points to independent live state',async()=>{
 const now=Date.now();
 assert.equal(await reader.accept('data/dev/EMU-BFDB-01',packet('EMU-BFDB-01','13.82',now),now),true);
 assert.equal(reader.rows(now).length,1);
 assert.equal(reader.rows(now)[0].voltageV,13.82);
 assert.equal(reader.rows(now)[0].currentA,2.1);
 assert.equal(reader.rows(now)[0].status,'LIVE');
 assert.equal(reader.rows(now+31000)[0].status,'STALE');
});
test('rejects spoofed sources, stale messages and uncommissioned points',async()=>{
 const now=Date.now();
 assert.equal(await reader.accept('data/dev/OTHER',packet('EMU-BFDB-01','99',now),now),false);
 assert.equal(await reader.accept('data/dev/EMU-BFDB-01',packet('EMU-BFDB-01','99',now-600000),now),false);
 assert.equal(reader.rows(now).length,1);
});
