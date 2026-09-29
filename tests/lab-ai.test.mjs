import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler from '../netlify/functions/lab-ai.mts';
const env = { OPENAI_API_KEY: 'test-not-a-real-key', LAB_ACCESS_CODE_SHA256: createHash('sha256').update('TEST-CODE').digest('hex') };
globalThis.Netlify = { env: { get: name => env[name] } };
const realFetch = globalThis.fetch;
function request(body, code = 'TEST-CODE', extra = {}) {
 return new Request('https://lab.example/.netlify/functions/lab-ai', { method:'POST', headers: { 'Content-Type':'application/json', 'X-Lab-Access-Code':code, ...extra }, body:JSON.stringify(body) });
}
function mockResponse(overrides = {}) { return Response.json({ model:'gpt-6.1-sol', status:'completed', output:[{type:'message',content:[{type:'output_text',text:'Test response.'}]}], usage:{input_tokens:12,output_tokens:9,total_tokens:21}, ...overrides }); }
test.afterEach(() => { globalThis.fetch = realFetch; delete env.OPENAI_BASE_URL; });
test('anonymous and incorrect access codes cannot spend API credit', async () => {
 globalThis.fetch = () => { throw new Error('Must not call provider'); };
 for(const code of ['', 'WRONG']) assert.equal((await handler(request({messages:[{role:'user',content:'Hello'}]},code))).status,401);
 assert.equal((await handler(request({action:'authenticate'},'test-code'))).status,200);
 assert.equal((await handler(request({action:'authenticate'},'TEST-CODE',{Origin:'https://other.example'}))).status,403);
});
test('health reports model configuration without revealing credentials', async () => {
 const r=await handler(new Request('https://lab.example/.netlify/functions/lab-ai'));
 const text=await r.text(); assert(!text.includes(env.OPENAI_API_KEY)); assert(!text.includes(env.LAB_ACCESS_CODE_SHA256)); assert(text.includes('gpt-6.1-sol'));
});
test('chat preserves text/image/PDF inputs and uses the bounded main model', async () => {
 let payload;
 globalThis.fetch=async (url,opts)=>{ assert.equal(url,'https://api.openai.com/v1/responses'); payload=JSON.parse(opts.body); return mockResponse(); };
 const response=await handler(request({model:'gpt-6-astra',max_tokens:100000,system:'Be helpful.',messages:[{role:'user',content:[{type:'text',text:'Read these.'},{type:'image',source:{type:'base64',media_type:'image/png',data:'YWJj'}},{type:'document',filename:'brief.pdf',source:{type:'base64',media_type:'application/pdf',data:'YWJj'}}]}]}));
 assert.equal(response.status,200); assert.equal(payload.model,'gpt-6.1-sol'); assert.equal(payload.max_output_tokens,8192); assert.equal(payload.store,false);
 assert.deepEqual(payload.reasoning,{effort:'low'}); assert.equal(payload.input[0].content[1].image_url,'data:image/png;base64,YWJj'); assert.equal(payload.input[0].content[2].filename,'brief.pdf');
 assert.equal((await response.json()).content[0].text,'Test response.');
});
test('light tasks route to Luna, honor gateway base URL, and count real searches', async()=>{
 env.OPENAI_BASE_URL='https://gateway.example'; let payload;
 globalThis.fetch=async(url,opts)=>{assert.equal(url,'https://gateway.example/v1/responses');payload=JSON.parse(opts.body);return mockResponse({model:'gpt-6-luna',output:[{type:'web_search_call'},{type:'web_search_call'},{type:'message',content:[{type:'output_text',text:'Result.',annotations:[{type:'url_citation',url:'https://example.com',title:'Source'}]}]}]});};
 const r=await handler(request({model:'fast',max_tokens:300,tools:[{type:'web_search_20250305',max_uses:99}],messages:[{role:'user',content:'Research.'}]})); const data=await r.json();
 assert.equal(payload.model,'gpt-6-luna'); assert.equal(payload.max_tool_calls,3); assert.equal(payload.tools[0].type,'web_search'); assert.equal(payload.tool_choice,'required'); assert.equal(data.usage.server_tool_use.web_search_requests,2); assert.equal(data.citations.length,1);
});
test('invalid input is rejected before provider call and upstream errors are sanitized',async()=>{
 globalThis.fetch=()=>{throw new Error('Must not call provider');};
 assert.equal((await handler(request({messages:[]}))).status,400);
 assert.equal((await handler(request({messages:[{role:'system',content:'Hello'}]}))).status,400);
 assert.equal((await handler(request({messages:[{role:'user',content:'x'.repeat(4000001)}]}))).status,413);
 globalThis.fetch=async()=>Response.json({error:{code:'insufficient_quota',message:'sensitive upstream detail'}},{status:429});
 const r=await handler(request({messages:[{role:'user',content:'Hi'}]})); assert.equal(r.status,429); const data=await r.json(); assert.match(data.error.message,/credits/); assert(!data.error.message.includes('sensitive'));
});
test('no-text output becomes a recoverable error instead of a false success',async()=>{
 globalThis.fetch=async()=>mockResponse({status:'incomplete',output:[]});
 assert.equal((await handler(request({messages:[{role:'user',content:'Hi'}]}))).status,502);
});
