// Run with JSDOM_MODULE pointing to a temporary jsdom installation, as documented
// for tests/lab-workspace-ui.mjs. All storage and fetch calls are local/mocked.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const html=fs.readFileSync(new URL('../lab.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://lab.example/lab.html',runScripts:'outside-only'});
const w=dom.window;w.setInterval=()=>0;w.alert=message=>{throw Error(message)};w.confirm=()=>false;
w.eval=source=>vm.runInContext(source,dom.getInternalVMContext());
w.fetch=async()=>({ok:true,json:async()=>({configured:true,access_configured:true,model:'test'})});
w.localStorage.setItem('lab_sb_migrated','1');
const legacy={id:'legacy',project:'Project Alpha',title:'Prior-month follow-up',date:'2026-09-01',status:'waiting',due:null,owner:'Todd',details:'Keep the original evidence',sourceUrl:'https://example.com/evidence',statusHistory:[{status:'waiting',at:'2026-09-01T12:00:00Z'}]};
w.localStorage.setItem('lab_activity',JSON.stringify([legacy,{...legacy,id:'done',title:'Completed history',status:'done',completedAt:'2026-09-02T12:00:00Z'}]));
for(const script of w.document.querySelectorAll('script:not([src])'))w.eval(script.textContent);
w.eval(fs.readFileSync(new URL('../lab-workspace.js',import.meta.url),'utf8'));
w.eval('initApp()');
const $=id=>w.document.getElementById(id);
const submit=()=> $('ws-activity-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const rows=()=>JSON.parse(w.localStorage.getItem('lab_activity'));
const edit=id=>w.document.querySelector('[data-edit-activity="'+id+'"]').click();
const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('input'));};

assert.equal($('ws-month').value,'');assert.equal($('ws-status-filter').value,'open');
assert.match($('ws-activity-list').textContent,/Prior-month follow-up/);
assert.doesNotMatch($('ws-activity-list').textContent,/Completed history/);
assert.match($('ws-activity-list').textContent,/Due: Not set/);
assert.match($('ws-activity-list').textContent,/normal priority/);
edit('legacy');assert.equal($('ws-activity-due').value,'');
$('ws-activity-nextAction').value='Unsaved edit';$('ws-activity-priority').value='high';
$('ws-activity-cancel').click();submit();
assert.deepEqual(rows()[0],legacy,'Cancel plus a late submit must not mutate stored activity');
edit('legacy');assert.equal($('ws-activity-nextAction').value,'');
$('ws-activity-nextAction').value='Verify the notification';$('ws-activity-priority').value='high';submit();submit();
assert.equal(rows().length,2,'repeated edits must not duplicate activity');
const saved=rows().find(a=>a.id==='legacy');
assert.equal(saved.due,null);assert.equal(saved.nextAction,'Verify the notification');
assert.equal(saved.priority,'high');assert.equal(saved.details,legacy.details);
assert.equal(saved.sourceUrl,legacy.sourceUrl);assert.deepEqual(saved.statusHistory,legacy.statusHistory);
assert.match(w.eval('buildMemoryContext()'),/Next action: Verify the notification/);

$('ws-add-activity').click();$('ws-activity-project').value='Project Beta';
$('ws-activity-title').value='New next step';$('ws-activity-date').value='2026-10-02';
$('ws-activity-nextAction').value='Send a test';submit();submit();
assert.equal(rows().length,3,'repeated new submits must create only one record');
assert.equal(rows()[0].due,null);assert.equal(rows()[0].priority,'normal');
const newId=rows()[0].id;
// A local write failure must leave the draft available and retry the same ID.
$('ws-add-activity').click();$('ws-activity-project').value='Project Gamma';
$('ws-activity-title').value='Retry without duplication';
const retryId=$('ws-activity-id').value;
const nativeSetItem=w.Storage.prototype.setItem;
w.Storage.prototype.setItem=function(key,value){if(key==='lab_activity')throw Error('Quota exceeded');return nativeSetItem.call(this,key,value);};
const beforeFailedSave=JSON.stringify(rows());submit();submit();
assert.equal(JSON.stringify(rows()),beforeFailedSave);
assert.equal($('ws-activity-form').hidden,false);
assert.equal($('ws-activity-id').value,retryId);
w.Storage.prototype.setItem=nativeSetItem;submit();submit();
assert.equal(rows().filter(a=>a.id===retryId).length,1);

change('ws-month','2026-10');assert.doesNotMatch($('ws-activity-list').textContent,/Prior-month/);
$('ws-all-dates').click();assert.match($('ws-activity-list').textContent,/Prior-month/);
change('ws-project-filter',' beta ');assert.doesNotMatch($('ws-activity-list').textContent,/Prior-month/);
$('ws-open-work').click();assert.equal($('ws-project-filter').value,'');

const completeButton=w.document.querySelector('[data-complete-activity="'+newId+'"]');
completeButton.click();
const completion=rows().find(a=>a.id===newId);assert.equal(completion.status,'done');
const afterCompletion=JSON.stringify(rows());
$('ws-activity-list').onclick({target:completeButton});
assert.equal(JSON.stringify(rows()),afterCompletion,'repeated completion must not append history or write again');
assert.doesNotMatch($('ws-activity-list').textContent,/New next step/);
change('ws-status-filter','done');assert.match($('ws-activity-list').textContent,/New next step/);
edit(newId);$('ws-activity-status').value='in_progress';submit();
$('ws-open-work').click();assert.match($('ws-activity-list').textContent,/Last completed:/);
assert.equal(rows().find(a=>a.id===newId).completedAt,completion.completedAt);
assert.deepEqual(rows().find(a=>a.id===newId).statusHistory.map(h=>h.status),['open','done','in_progress']);

// Untrusted data must remain text in both explicit action and legacy details.
edit(newId);$('ws-activity-nextAction').value='<img src=x onerror=alert(1)>';submit();
assert.equal($('ws-activity-list').querySelector('img'),null);
const snapshot=JSON.parse(JSON.stringify(w.LabWorkspace.snapshot()));
w.LabWorkspace.restore(snapshot);assert.deepEqual(rows(),snapshot.activity);
await new Promise(resolve=>setTimeout(resolve,0));
assert.match($('workspace-save-text').textContent,/cloud save pending/);
console.log('Activity UI passed: cross-month defaults, optional dates, legacy preservation, cancel, repeated save/complete, filters, reopening history, context, escaping, backup round-trip, offline queue.');
w.close();
