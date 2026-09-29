import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../lab-workspace.js',import.meta.url),'utf8');
const runtime={};vm.createContext(runtime);vm.runInContext(source,runtime);
const {markdown,createSync,context}=runtime.LabWorkspaceCore;
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)}};
test('Markdown formats headings/lists/code while keeping HTML and unsafe links inert',()=>{
 const html=markdown('# Heading\n- **Bold** and `code`\n- [Good](https://example.com)\n<script>alert(1)</script>\n[Bad](javascript:alert(1))\n```html\n<img src=x onerror=alert(1)>\n```');
 assert.match(html,/<h4>Heading<\/h4>/);assert.match(html,/<ul><li><strong>Bold/);assert.match(html,/<code>code<\/code>/);
 assert.match(html,/rel="noopener noreferrer"/);assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(!html.includes('href="javascript:'));
 assert(!markdown('[x](https://example.com/"onmouseover="alert)').includes('href="https://example.com/"'));
});
test('failed cloud saves remain pending across reload, then retry successfully',async()=>{
 const local=storage();const statuses=[];const bad=createSync({storage:local,write:async()=>{throw Error('denied')},status:(...s)=>statuses.push(s)});
 await bad.save('project_notes',[{body:'Important'}]);assert(bad.hasPending());assert.equal(statuses.at(-1)[0],'error');
 const written=[];const retry=createSync({storage:local,write:async(k,v)=>written.push([k,v]),status:()=>{}});
 assert.equal(retry.overlay({project_notes:[]}).project_notes[0].body,'Important');
 await retry.flush();assert(!retry.hasPending());assert.equal(written[0][1][0].body,'Important');
});
test('a newer edit during an in-flight save is sent last and cannot be cleared early',async()=>{
 const writes=[];let release;const first=new Promise(resolve=>release=resolve);
 const queue=createSync({storage:storage(),status:()=>{},write:async(k,v)=>{writes.push(v);if(writes.length===1)await first;}});
 const saving=queue.save('activity','old');await queue.save('activity','new');release();await saving;
 assert.deepEqual(writes,['old','new']);assert(!queue.hasPending());
});
test('active project notes survive beyond recent chat memory and completed activities stay distinct',()=>{
 const text=context([{title:'Old decision',project:'MRA',body:'Keep this',updatedAt:'2026-09-01',archived:false},{title:'Retired',body:'Do not use',archived:true}], [{project:'Tribe',title:'Test notification',date:'2026-09-29',status:'open',details:'Not yet verified',due:'',owner:''}]);
 assert(text.includes('Keep this'));assert(!text.includes('Do not use'));assert(text.includes('Not yet verified'));assert(text.includes('Due: Not set'));
});
test('summary uses the original conversation identity even when New Chat resets state',async()=>{
 const html=fs.readFileSync(new URL('../lab.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('async function summarizeCurrentChat()'),html.indexOf('function buildMemoryContext()'));
 let finish;const response=new Promise(r=>finish=r);
 const ctx={apiKey:true,currentChatId:'sept',chatHistory:[{role:'user',content:'September recap'},{role:'assistant',content:'Recorded'}],savedChats:[{id:'sept',title:'September activity'}],memorySummaries:[],LAB_AI_GATEWAY:'/api',fetch:()=>response,saveChatState(){},generateChatTitle:()=>'',console};
 vm.createContext(ctx);vm.runInContext(fn,ctx);const pending=ctx.summarizeCurrentChat();ctx.currentChatId=null;ctx.chatHistory=[];
 finish({json:async()=>({content:[{text:'September notes'}]})});await pending;
 assert.equal(ctx.memorySummaries[0].chatId,'sept');assert.equal(ctx.memorySummaries[0].title,'September activity');
});
