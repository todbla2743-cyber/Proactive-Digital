import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime={};vm.createContext(runtime);
vm.runInContext(fs.readFileSync(new URL('../lab-workspace.js',import.meta.url),'utf8'),runtime);
const {filterActivities,updateActivity,context}=runtime.LabWorkspaceCore;
const plain=value=>JSON.parse(JSON.stringify(value));
const at='2026-10-02T12:00:00.000Z';
const old={id:'old',project:'Alpha',title:'Prior-month follow-up',date:'2026-09-15',status:'waiting',owner:'Owner',due:null,details:'Original evidence',createdAt:'2026-09-15T09:00:00Z',source:{url:'https://example.com/evidence'},statusHistory:[{status:'waiting',at:'2026-09-15T09:00:00Z'}]};

test('default Activity view includes all open months and hides completed/archived history',()=>{
 const items=[old,{...old,id:'new',date:'2026-10-02',status:'in_progress'},{...old,id:'done',status:'done'},{...old,id:'archived',status:'archived'}];
 assert.deepEqual(plain(filterActivities(items).map(a=>a.id)),['new','old']);
 assert.deepEqual(plain(filterActivities(items,{month:'2026-09'}).map(a=>a.id)),['old']);
 assert.equal(filterActivities(items,{status:'all'}).length,4);
 assert.equal(filterActivities(items,{status:'done'})[0].id,'done');
 assert.equal(filterActivities(items,{status:'archived'})[0].id,'archived');
 assert.equal(filterActivities(items,{project:'  ALPHA  '}).length,2);
 assert.equal(filterActivities(items,{project:'other'}).length,0);
 assert.equal(items[0],old,'filtering must not reorder the source array');
});

test('explicit next action, priority and nullable due preserve legacy data and history',()=>{
 const before=JSON.stringify(old);
 const changed=updateActivity(old,{id:'old',nextAction:'Verify the delivery receipt',priority:'high',due:''},at);
 assert.equal(changed.due,null);
 assert.equal(changed.nextAction,'Verify the delivery receipt');
 assert.equal(changed.priority,'high');
 assert.equal(changed.details,'Original evidence');
 assert.deepEqual(plain(changed.source),old.source);
 assert.equal(changed.createdAt,old.createdAt);
 assert.deepEqual(plain(changed.statusHistory),old.statusHistory);
 assert.equal(JSON.stringify(old),before,'editing must not mutate the previous record');
 const newItem=updateActivity(undefined,{id:'new',date:'2026-10-02',status:'open',due:'',priority:''},at);
 assert.equal(newItem.due,null);
 assert.equal(newItem.nextAction,'');
 assert.equal(newItem.priority,'normal');
 assert.equal(newItem.createdAt,at);
 assert.deepEqual(plain(newItem.statusHistory),[{status:'open',at}]);
});

test('complete, reopen and complete again append transitions and preserve prior completion history',()=>{
 const completed=updateActivity({...old,due:'2026-10-01'},{status:'done'},at);
 assert.equal(completed.due,'2026-10-01','status-only changes preserve an existing deadline');
 assert.equal(completed.completedAt,at);
 assert.equal(completed.statusHistory.length,2);
 const repeated=updateActivity(completed,{status:'done'},'2026-10-02T12:01:00.000Z');
 assert.equal(repeated.completedAt,at);
 assert.equal(repeated.statusHistory.length,2);
 const reopened=updateActivity(completed,{status:'in_progress'},'2026-10-03T12:00:00.000Z');
 assert.equal(reopened.completedAt,at);
 assert.equal(reopened.statusHistory.length,3);
 const completedAgain=updateActivity(reopened,{status:'done'},'2026-10-04T12:00:00.000Z');
 assert.equal(completedAgain.completedAt,'2026-10-04T12:00:00.000Z');
 assert.deepEqual(plain(completedAgain.statusHistory.map(entry=>entry.status)),['waiting','done','in_progress','done']);
 assert.equal(old.statusHistory.length,1);
 const legacyDone={...old,status:'done',statusHistory:undefined,completedAt:'2026-09-20T12:00:00.000Z'};
 const legacyReopened=updateActivity(legacyDone,{status:'open'},at);
 const legacyRecompleted=updateActivity(legacyReopened,{status:'done'},'2026-10-04T12:00:00.000Z');
 assert.deepEqual(plain(legacyRecompleted.statusHistory.map(entry=>[entry.status,entry.at])),[
  ['done','2026-09-20T12:00:00.000Z'],['open',at],['done','2026-10-04T12:00:00.000Z']
 ]);
});

test('AI activity context includes explicit action and priority without manufacturing a due date',()=>{
 const text=context([],[{...old,nextAction:'Ask for delivery evidence',priority:'high'}]);
 assert.match(text,/Next action: Ask for delivery evidence/);
 assert.match(text,/Priority: high/);
 assert.match(text,/Due: Not set/);
 assert.match(text,/Original evidence/);
 const legacy=context([],[old]);
 assert.match(legacy,/Priority: normal/);
 assert.match(legacy,/Next action: Not set/);
});

test('legacy entries without dates/status remain visible and usable in AI context',()=>{
 const undated={id:'undated',project:'Legacy',title:'Imported follow-up',date:null,due:null,details:'Keep original history'};
 const missingDate={id:'missing-date',project:'Legacy',title:'Older follow-up'};
 assert.deepEqual(plain(filterActivities([undated,missingDate,old]).map(a=>a.id)),['old','undated','missing-date']);
 assert.equal(filterActivities([undated,missingDate],{month:'2026-10'}).length,0);
 const text=context([],[undated,missingDate,old]);
 assert.match(text,/\[Date not recorded\] Legacy: Imported follow-up \| open/);
 assert.match(text,/\[Date not recorded\] Legacy: Older follow-up \| open/);
 assert.doesNotMatch(text,/undefined|null/);
});
