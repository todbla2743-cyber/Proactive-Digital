import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeHandler} from '../netlify/functions/lab-store.mts';
globalThis.Netlify={env:{get:key=>key==='LAB_ACCESS_CODE_SHA256'?createHash('sha256').update('TEST-CODE').digest('hex'):undefined}};
const req=body=>new Request('https://lab.example/.netlify/functions/lab-store',{method:'POST',headers:{'X-Lab-Access-Code':'TEST-CODE'},body:JSON.stringify(body)});
test('isolated management collection round trips without writes to existing collections',async()=>{
 const values=new Map([['records',{value:[{id:'legacy',dealValue:500}],updatedAt:'2026-09-01'}]]),writes=[];
 const handler=makeHandler(()=>({get:async key=>values.get(key),setJSON:async(key,value)=>{writes.push(key);values.set(key,value)}}));
 const management={clients:[{id:'care-1',name:'Synthetic Client',planStatus:'upcoming',startDate:null}]};
 assert.equal((await handler(req({action:'save',key:'management',value:management}))).status,200);
 const loaded=await (await handler(req({action:'load'}))).json();
 assert.deepEqual(loaded.data.management,management);assert.deepEqual(loaded.data.records,[{id:'legacy',dealValue:500}]);assert.deepEqual(writes,['management']);
 assert.equal((await handler(req({action:'save',key:'design_fusion_orders',value:[]}))).status,400);
});
