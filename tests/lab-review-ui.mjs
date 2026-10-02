// JSDOM_MODULE=/tmp/lab-qa/node_modules/jsdom/lib/api.js node tests/lab-review-ui.mjs
// Runs the generated HTML in parser order using real unchanged Lab modules.
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildLabReview} from '../scripts/build-lab-review.mjs';
const {JSDOM,VirtualConsole}=await import(process.env.JSDOM_MODULE||'jsdom');
const dir=await mkdtemp(join(tmpdir(),'lab-review-ui-'));
const result=await buildLabReview({distDir:dir,context:'deploy-preview'});
const html=await readFile(result.htmlPath,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const allowed=new Set(['lab-workspace.js','lab-pipeline-editor.js','lab-management.js','lab-order-review.js']);
const assets=[],failures=[];
// Inline only allowlisted local script bytes. No jsdom network loader is enabled.
const executableHTML=html.replace(/<script src="([^"]+)"[^>]*><\/script>/g,(tag,src)=>{
  const name=src.split('?')[0].slice(1);assets.push(name);
  if(name==='lab-review-harness.js')return '<script>'+readFileSync(result.harnessPath,'utf8')+'</script>';
  if(allowed.has(name))return '<script>'+readFileSync(new URL('../'+name,import.meta.url),'utf8')+'</script>';
  failures.push('Unexpected network asset: '+src);return '';
});
async function boot(path='/lab-review.html') {
  const errors=[];let realStorage;
  const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(executableHTML,{
    url:'https://preview.example'+path,runScripts:'dangerously',virtualConsole:console,
    beforeParse(w){
      realStorage=w.localStorage;realStorage.setItem('lab_records','DO NOT READ REAL DATA');realStorage.setItem('owner-sentinel','unchanged');
      w.setInterval=()=>0;w.alert=message=>errors.push('Unexpected alert: '+message);w.confirm=()=>false;
      w.fetch=()=>{throw Error('Native network must never run');};
    }
  });
  for(let count=0;count<200&&!dom.window.document.documentElement.dataset.labReviewReady;count++)await tick();
  assert.equal(dom.window.document.documentElement.dataset.labReviewReady,'true',errors.join('\n'));
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
  return {dom,w:dom.window,$:id=>dom.window.document.getElementById(id),realStorage};
}
try{
  // A missing/failed bootstrap must not let the original modules read real caches.
  const withoutHarness=html.replace(/<script src="[^"]+"[^>]*><\/script>/g,(tag,src)=>'');
  let unsafeStorageReads=0;
  const failedBoot=new JSDOM(withoutHarness,{url:'https://preview.example/lab.html',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(w){
    Object.defineProperty(w,'localStorage',{configurable:true,get(){unsafeStorageReads++;throw Error('Native storage must not be read');}});
    w.setInterval=()=>0;
  }});
  assert.equal(unsafeStorageReads,0);assert(!failedBoot.window.document.getElementById('app').classList.contains('visible'));
  failedBoot.window.close();
  const {dom,w,$,realStorage}=await boot();
  const snapshot=()=>plain(w.LabWorkspace.snapshot());
  assert.equal($('login-screen').style.display,'none');assert($('app').classList.contains('visible'));
  assert.equal(realStorage.getItem('lab_records'),'DO NOT READ REAL DATA');assert.equal(realStorage.length,2);
  assert.equal(w.localStorage,w.LabReview.storage);assert.notEqual(w.localStorage,realStorage);
  assert.deepEqual(assets.sort(),['lab-review-harness.js',...allowed].sort());
  assert.match($('lab-review-banner').textContent,/SYNTHETIC DATA/);
  assert.match($('mg-summary').textContent,/\$65\.00 USD \/ month/);assert.match($('mg-summary').textContent,/1 upcoming/);
  assert(snapshot().management.clients.every(item=>item.monthlyPlan.startDate===null&&item.monthlyPlan.endDate===null));
  assert.equal($('ws-month').value,'');assert.match($('ws-activity-list').textContent,/Prior-month open follow-up/);
  assert.doesNotMatch($('ws-activity-list').textContent,/Completed synthetic work/);
  // Real care editor: cancel then save; the synthetic endpoint accepts the actual queued write.
  w.document.querySelector('[data-mg-edit]').click();$('mg-name').value='Discarded draft';$('mg-cancel').click();
  assert.equal(snapshot().management.clients[0].name,'Example Active Care');
  w.document.querySelector('[data-mg-edit]').click();$('mg-description').value='Edited fixture description';
  $('mg-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(snapshot().management.clients[0].description,'Edited fixture description');
  assert.equal(w.LabReview.snapshot().management.clients[0].description,'Edited fixture description');
  // Real activity editor, preservation, all-dates filter, and completion handling.
  w.document.querySelector('[data-edit-activity="review-older-open"]').click();
  assert.equal($('ws-activity-due').value,'');$('ws-activity-nextAction').value='Review updated fixture';
  $('ws-activity-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  assert.equal(snapshot().activity.find(item=>item.id==='review-older-open').nextAction,'Review updated fixture');
  assert.equal(snapshot().activity.find(item=>item.id==='review-older-open').due,null);
  // Real pipeline detail editor retains the record's sales value/status.
  w.document.querySelector('[data-lab-edit-record="review-proposal"]').click();
  $('lp-notes').value='Edited synthetic pipeline notes';
  $('lab-record-editor').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
  const record=JSON.parse(w.localStorage.getItem('lab_records')).find(item=>item.id==='review-proposal');
  assert.equal(record.notes,'Edited synthetic pipeline notes');assert.equal(record.status,'proposal');assert.equal(record.dealValue,450);
  // Review is seeded after initialization and never calls Supabase.
  [...w.document.querySelectorAll('.nav-tab')].find(el=>el.textContent==='Order review').click();
  assert.match($('lor-status').textContent,/1 possible test orders among 2 loaded orders/);
  assert.match($('lor-list').textContent,/Sample Customer/);
  assert.equal(w.eval('_db'),null);
  // Both static and newly inserted external links are inert. Native form submission is disabled.
  const admin=w.document.querySelector('.df-admin-btn');assert.equal(admin.getAttribute('href'),null);assert.equal(admin.getAttribute('aria-disabled'),'true');
  const link=w.document.createElement('a');link.href='https://example.com';w.document.body.append(link);await tick();
  assert.equal(link.getAttribute('href'),null);assert.equal(w.open('https://example.com'),null);
  assert.equal((await w.fetch('/.netlify/functions/lab-ai',{method:'POST',body:'{}'})).status,403);
  assert.equal((await w.fetch('https://example.com')).status,403);
  assert.throws(()=>new w.XMLHttpRequest(),/disabled/);
  assert.equal(w.navigator.sendBeacon('/anything','body'),false);
  assert(w.document.querySelector('input[type=file]').disabled);
  assert.equal(realStorage.getItem('owner-sentinel'),'unchanged');assert.equal(realStorage.length,2);
  assert(w.LabReview.requests.some(request=>request.url==='/.netlify/functions/lab-store'&&request.action==='save'));
  dom.window.close();
  // Alternate /lab alias starts a fresh fixture; no preview edit survives reload.
  const fresh=await boot('/lab.html');
  assert.equal(plain(fresh.w.LabWorkspace.snapshot()).management.clients[0].description,'Synthetic monthly care example. Dates are intentionally unknown.');
  fresh.dom.window.close();
  console.log('Lab review UI passed: generated page/parser boot, no live storage/network, synthetic care/activity/pipeline edits, seeded order review, blocked links/forms, and reset on reload at both paths.');
}finally{await rm(dir,{recursive:true,force:true});}
