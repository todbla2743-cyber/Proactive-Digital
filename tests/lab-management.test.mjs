import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const runtime = {};
vm.createContext(runtime);
vm.runInContext(fs.readFileSync(new URL('../lab-management.js', import.meta.url), 'utf8'), runtime);
const {validDate, validManagement, eligiblePlan, totals, makeClient} = runtime.LabManagementCore;
const plain = value => JSON.parse(JSON.stringify(value));
const at = '2026-10-02T12:00:00Z';
const fields = (extra = {}) => ({name:'Example project', description:'', contact:'', recordId:'', status:'none', amount:'', startDate:'', endDate:'', ...extra});

test('independent client has optional contact, description, amount and dates; no payments inferred', () => {
  const item = makeClient(null, fields(), 'mg_test', at);
  assert.equal(item.name, 'Example project');
  assert.deepEqual(plain(item.monthlyPlan), {status:'none', amount:null, startDate:null, endDate:null});
  assert.equal(item.recordId, null);
  assert.equal(item.payments, undefined);
  assert(validManagement({clients:[item], futureExtension:{preserve:true}}));
});

test('only explicitly active positive plans effective today count toward the isolated monthly total', () => {
  const variants = [
    {status:'none',amount:'200'}, {status:'upcoming',amount:'200',startDate:'2026-01-01'},
    {status:'paused',amount:'200'}, {status:'ended',amount:'200'}, {status:'active',amount:''},
    {status:'active',amount:'0'}, {status:'active',amount:'200',startDate:'2026-10-03'},
    {status:'active',amount:'200',endDate:'2026-10-01'},
    {status:'active',amount:'49.95'}, {status:'active',amount:'10.10',startDate:'2026-10-02',endDate:'2026-10-02'}
  ];
  const clients = variants.map((row, i) => makeClient(null, fields(row), 'mg_' + i, at));
  assert.deepEqual(plain(totals({clients}, '2026-10-02')), {clients:10, upcoming:1, active:2, monthly:60.05});
  assert(!eligiblePlan({status:'active',amount:'100'}, '2026-10-02'));
  assert(!eligiblePlan({status:'active',amount:-100}, '2026-10-02'));
  assert(!eligiblePlan({status:'active',amount:100,startDate:'bad'}, '2026-10-02'));
});

test('edits preserve unknown top-level and nested fields and existing history, without mutating input', () => {
  const initial = makeClient(null, fields({status:'upcoming',amount:'50'}), 'mg_keep', at);
  initial.custom = {keep:true}; initial.monthlyPlan.extension = {keep:true}; initial.history.unshift({legacy:true});
  const copy = JSON.stringify(initial);
  const edited = makeClient(initial, fields({status:'active',amount:'50',recordId:'rec_original'}), initial.id, '2026-10-03T12:00:00Z');
  assert.equal(JSON.stringify(initial), copy);
  assert.deepEqual(plain(edited.custom), {keep:true});
  assert.deepEqual(plain(edited.monthlyPlan.extension), {keep:true});
  assert.deepEqual(plain(edited.history.slice(0, 2)), plain(initial.history));
  assert.equal(edited.history.length, 3);
  assert.equal(edited.recordId, 'rec_original');
  assert.equal(edited.createdAt, initial.createdAt);
  const unusual = makeClient({...initial, history:{legacy:'keep exact'}}, fields(), initial.id, at);
  assert.deepEqual(plain(unusual.history), {legacy:'keep exact'});
});

test('validation prevents invalid dates, amounts, duplicates and unsupported plan statuses', () => {
  assert(validDate('2028-02-29'));
  assert(!validDate('2026-02-29'));
  assert(!validDate('2026-13-02'));
  for (const extra of [{name:'  '}, {amount:'-1'}, {amount:'12.345'}, {amount:'NaN'}, {amount:'1e3'}, {amount:'999999999999999999'}, {status:'assumed-active'}, {startDate:'2026-02-29'}, {startDate:'2026-10-03',endDate:'2026-10-02'}]) {
    assert.throws(() => makeClient(null, fields(extra), 'mg_bad', at));
  }
  const item = makeClient(null, fields(), 'mg_unique', at);
  assert(!validManagement({clients:[item,item]}));
  assert(!validManagement({clients:[{id:'mg_missing',name:'Example'}]}));
  assert(!validManagement({clients:[null]}));
  assert(!validManagement([]));
});
