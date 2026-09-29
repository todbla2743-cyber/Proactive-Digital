import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeHandler} from '../netlify/functions/lab-store.mts';
globalThis.Netlify={env:{get:()=>createHash('sha256').update('TEST-CODE').digest('hex')}};
const request=(body,code='TEST-CODE',headers={})=>new Request('https://lab.example/.netlify/functions/lab-store',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Access-Code':code,...headers},body:JSON.stringify(body)});
test('private workspace storage rejects missing/wrong access and foreign origins before any data access',async()=>{
 const handler=makeHandler(()=>{throw Error('must not open storage')});
 assert.equal((await handler(request({action:'load'},''))).status,401);
 assert.equal((await handler(request({action:'load'},'wrong'))).status,401);
 assert.equal((await handler(request({action:'load'},'TEST-CODE',{origin:'https://other.example'}))).status,403);
 assert.equal((await handler(new Request('https://lab.example/.netlify/functions/lab-store'))).status,405);
});
test('workspace save/load round-trip and preview isolation',async()=>{
 const stores=new Map();const names=[];
 const handler=makeHandler(options=>{assert.equal(options.consistency,'strong');names.push(options.name);if(!stores.has(options.name))stores.set(options.name,new Map());const data=stores.get(options.name);return{setJSON:async(k,v)=>data.set(k,v),get:async k=>data.get(k)||null};});
 const prod={deploy:{context:'production'}},preview={deploy:{context:'deploy-preview'}};
 assert.equal((await handler(request({action:'save',key:'project_notes',value:[{body:'Private decision'}]}),prod)).status,200);
 const live=await (await handler(request({action:'load'}),prod)).json();assert.equal(live.data.project_notes[0].body,'Private decision');
 const draft=await (await handler(request({action:'load'}),preview)).json();assert.deepEqual(draft.data,{});assert(names.includes('lab-workspace-v1-preview'));
 assert.equal((await handler(request({action:'save',key:'lab_sb_auth',value:{password:'test'}}),prod)).status,400);
});
test('storage outage never returns a false save confirmation',async()=>{
 const handler=makeHandler(()=>({setJSON:async()=>{throw Error('secret internal error')}}));
 const result=await handler(request({action:'save',key:'activity',value:[]}));assert.equal(result.status,503);assert(!(await result.text()).includes('secret internal error'));
});
