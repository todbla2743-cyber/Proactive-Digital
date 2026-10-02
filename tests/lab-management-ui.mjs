// JSDOM_MODULE=/tmp/lab-qa/node_modules/jsdom/lib/api.js node tests/lab-management-ui.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const {JSDOM} = await import(process.env.JSDOM_MODULE || 'jsdom');
const html = fs.readFileSync(new URL('../lab.html', import.meta.url), 'utf8');
const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const record = {id:'rec_fixture', name:'Existing sales project', status:'won', statusHistory:[], touches:[], payments:[{amount:120, paid:true}], recurringValue:999, dealValue:120, notes:'Keep existing sales untouched'};
function harness({cache, pending, otherPending = {}, failCloud = false} = {}) {
  const dom = new JSDOM(html, {url:'https://lab.example/lab.html', runScripts:'outside-only'});
  const w = dom.window, writes = [], state = {failCloud, cloud:{records:[record], project_notes:[], activity:[]}};
  w.setInterval = () => 0;
  w.alert = text => {throw new Error(text);};
  w.confirm = () => false;
  w.eval = script => vm.runInContext(script, dom.getInternalVMContext());
  w.localStorage.setItem('lab_sb_migrated','1');
  w.localStorage.setItem('lab_migrated_v2','true');
  w.localStorage.setItem('lab_records', JSON.stringify([record]));
  w.localStorage.setItem('lab_clients', JSON.stringify([{id:'old-client', name:'Original installment client', payments:[{amount:120,paid:true}]}]));
  if (cache) w.localStorage.setItem('lab_management', JSON.stringify(cache));
  if (pending || Object.keys(otherPending).length) w.localStorage.setItem('lab_pending_writes', JSON.stringify({...otherPending, ...(pending ? {management:{revision:123,value:pending}} : {})}));
  w.fetch = async (url, options = {}) => {
    if (String(url).includes('/lab-store')) {
      const body = JSON.parse(options.body);
      if (body.action === 'load') {
        if (state.failLoad) throw new Error('Offline load');
        const data = plain(state.cloud);
        if (state.deferLoad) await state.deferLoad;
        return {ok:true,json:async () => ({ok:true,data})};
      }
      writes.push(plain(body));
      if (state.failCloud) throw new Error('Offline');
      state.cloud[body.key] = plain(body.value);
      return {ok:true,json:async () => ({ok:true,key:body.key})};
    }
    return {ok:true,json:async () => ({configured:true,access_configured:true,model:'test-model'})};
  };
  for (const script of w.document.querySelectorAll('script:not([src])')) w.eval(script.textContent);
  w.eval(source('lab-workspace.js'));
  w.eval(source('lab-management.js'));
  w.eval('initApp()');
  const $ = id => w.document.getElementById(id);
  const submit = () => $('mg-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  const snapshot = () => plain(w.LabWorkspace.snapshot().management);
  return {w, $, submit, snapshot, state, writes, close:() => w.close()};
}

const app = harness();
const {w, $, submit, snapshot, state, writes} = app;
const originalRecords = w.eval('JSON.stringify(RECORDS)'), originalClients = w.localStorage.getItem('lab_clients');
assert.equal(snapshot().clients.length, 0);
assert.equal(writes.filter(write => write.key === 'management').length, 0, 'empty startup does not write management');
assert.equal($('lab-management').parentElement.id, 'panel-clients');
assert($('mg-add').disabled, 'first visit waits for authoritative cloud load');
await w.eval('SB.load()');
assert(!$('mg-add').disabled);
$('mg-add').click(); $('mg-name').value = 'Same client'; submit(); submit();
assert.equal(snapshot().clients.length, 1, 'repeated submit does not duplicate the record');
assert.equal(snapshot().clients[0].monthlyPlan.amount, null);
assert.equal(snapshot().clients[0].monthlyPlan.startDate, null);
assert.equal(snapshot().clients[0].monthlyPlan.endDate, null);
$('mg-add').click(); $('mg-name').value = 'Same client'; $('mg-plan-status').value = 'upcoming'; $('mg-amount').value = '75'; $('mg-start').value = '2020-01-01'; $('mg-record').value = record.id; submit();
assert.equal(snapshot().clients.length, 2, 'same-name clients remain distinct');
assert.notEqual(snapshot().clients[0].id, snapshot().clients[1].id);
assert.equal(snapshot().clients[1].recordId, record.id);
assert.match($('mg-summary').textContent, /\$0\.00 USD \/ month/);
assert.match($('mg-summary').textContent, /1 upcoming/);
const secondId = snapshot().clients[1].id;
w.document.querySelectorAll('[data-mg-edit]')[1].click(); $('mg-name').value = 'Discard this'; $('mg-cancel').click(); submit();
assert.equal(snapshot().clients[1].name, 'Same client');
w.document.querySelectorAll('[data-mg-edit]')[1].click(); $('mg-plan-status').value = 'active'; submit();
assert.equal(snapshot().clients[1].id, secondId);
assert.match($('mg-summary').textContent, /\$75\.00 USD \/ month/);
$('mg-search').value = 'no matching client'; $('mg-search').dispatchEvent(new w.Event('input'));
assert.match($('mg-list').textContent, /No client \/ project records match/);
assert.match($('mg-summary').textContent, /\$75\.00 USD \/ month/, 'filter does not change collection totals');
$('mg-search').value = ''; $('mg-search').dispatchEvent(new w.Event('input'));

// Unknown data and history survive an edit; escaped names/contacts never become DOM markup.
const extended = snapshot(); extended.custom = {keep:true}; extended.clients[0].futureField = {keep:true}; extended.clients[0].history.unshift({source:'old-history'}); extended.clients[0].monthlyPlan.extra = 'keep';
w.LabWorkspace.restore({management:extended});
w.document.querySelector('[data-mg-edit]').click(); $('mg-name').value = '<img src=x onerror=alert(1)>'; $('mg-contact').value = '<script>bad()</script>'; submit();
assert.equal($('mg-list').querySelector('img'), null);
assert.equal($('mg-list').querySelector('script'), null);
assert.deepEqual(snapshot().custom, {keep:true});
assert.deepEqual(snapshot().clients[0].futureField, {keep:true});
assert.equal(snapshot().clients[0].monthlyPlan.extra, 'keep');
assert.equal(snapshot().clients[0].history[0].source, 'old-history');
const beforeOldBackup = snapshot(); w.LabWorkspace.restore({project_notes:[], activity:[]});
assert.deepEqual(snapshot(), beforeOldBackup, 'old backups without management do not clear it');
assert.throws(() => w.LabWorkspace.restore({management:{clients:[null]}}), /invalid/);
assert.deepEqual(snapshot(), beforeOldBackup);
const backup = plain(w.LabWorkspace.snapshot()); w.LabWorkspace.restore(backup);
assert.deepEqual(snapshot(), backup.management);
const copy = w.LabWorkspace.snapshot(); copy.management.clients[0].name = 'external mutation';
assert.notEqual(snapshot().clients[0].name, 'external mutation', 'snapshot is independent');
assert.equal(w.eval('JSON.stringify(RECORDS)'), originalRecords);
assert.equal(w.localStorage.getItem('lab_clients'), originalClients);
assert(writes.every(write => !['records','clients','pipeline'].includes(write.key)));

// Pending-queue storage failure leaves the draft/cache intact and does not queue a false save.
await tick();
const setItem = w.Storage.prototype.setItem;
w.Storage.prototype.setItem = function(key, value) {if (key === 'lab_pending_writes') throw new Error('Quota exceeded'); return setItem.call(this,key,value);};
const beforeFailure = snapshot(), writesBefore = writes.filter(write => write.key === 'management').length;
$('mg-add').click(); $('mg-name').value = 'Unsaved draft'; submit();
assert(!$('mg-form').hidden);
assert.match($('mg-form-error').textContent, /Could not save on this device/);
assert.deepEqual(snapshot(), beforeFailure);
assert.equal(writes.filter(write => write.key === 'management').length, writesBefore);
assert.deepEqual(JSON.parse(w.localStorage.getItem('lab_management')), beforeFailure);
w.Storage.prototype.setItem = setItem;
$('mg-cancel').click();

// Existing queue stores management, overlays an older cloud value, survives reload and retries.
state.failCloud = true;
$('mg-add').click(); $('mg-name').value = 'Offline client'; submit(); await tick();
assert(JSON.parse(w.localStorage.getItem('lab_pending_writes')).management);
const pendingData = snapshot(); state.cloud.management = {clients:[]};
const loaded = await w.eval('SB.load()');
assert.deepEqual(plain(loaded.management), pendingData);
assert.deepEqual(snapshot(), pendingData);
assert.match($('workspace-save-text').textContent, /waiting|pending/);
state.failCloud = false; $('workspace-retry').click(); await tick();
assert.equal(JSON.parse(w.localStorage.getItem('lab_pending_writes')).management, undefined);
assert.deepEqual(state.cloud.management, pendingData);
const managementWrites = writes.filter(write => write.key === 'management').length;
await w.eval('SB.load()');
assert.equal(writes.filter(write => write.key === 'management').length, managementWrites, 'load never writes management to cloud');
app.close();

const reloaded = harness({cache:{clients:[]}, pending:pendingData, failCloud:true});
assert.deepEqual(reloaded.snapshot(), pendingData, 'pending changes load even before cloud responds');
await tick(); reloaded.close();

// First-visit cloud load cannot be raced by a partial write that drops existing cloud records.
const race = harness();
let finish;
race.state.cloud.management = pendingData;
race.state.deferLoad = new Promise(resolve => {finish = resolve;});
const loading = race.w.eval('SB.load()');
race.$('mg-add').click(); race.$('mg-name').value = 'Must not save'; race.submit();
assert(race.$('mg-form').hidden);
assert(race.$('mg-add').disabled);
assert.equal(race.writes.filter(write => write.key === 'management').length, 0);
finish(); await loading;
assert.deepEqual(race.snapshot(), pendingData);
assert(!race.$('mg-add').disabled);
race.$('mg-add').click(); race.$('mg-name').value = 'Added after load'; race.submit();
assert.equal(race.snapshot().clients.length, pendingData.clients.length + 1);
await tick();
assert.equal(race.state.cloud.management.clients.length, pendingData.clients.length + 1);
race.close();

const offlineFirst = harness();
offlineFirst.state.failLoad = true;
assert.equal(await offlineFirst.w.eval('SB.load()'), null);
offlineFirst.$('mg-add').click(); offlineFirst.$('mg-name').value = 'Blocked offline'; offlineFirst.submit();
assert(offlineFirst.$('mg-add').disabled);
assert(offlineFirst.$('mg-form').hidden);
assert.equal(offlineFirst.writes.filter(write => write.key === 'management').length, 0);
offlineFirst.state.failLoad = false; await offlineFirst.w.eval('SB.load()');
assert(!offlineFirst.$('mg-add').disabled);
offlineFirst.close();

// A stale persisted pending edit can never roll back a newer accepted cache on reload.
const quota = harness({cache:pendingData, failCloud:true});
quota.w.document.querySelector('[data-mg-edit]').click(); quota.$('mg-name').value = 'First edit'; quota.submit(); await tick();
const acceptedFirst = quota.snapshot();
const quotaSet = quota.w.Storage.prototype.setItem;
quota.w.Storage.prototype.setItem = function(key, value) {if (key === 'lab_pending_writes') throw new Error('Queue quota'); return quotaSet.call(this,key,value);};
quota.w.document.querySelector('[data-mg-edit]').click(); quota.$('mg-name').value = 'Second edit'; quota.submit();
assert(!quota.$('mg-form').hidden);
assert.equal(quota.$('mg-name').value, 'Second edit', 'failed attempt keeps draft text');
assert.deepEqual(quota.snapshot(), acceptedFirst);
assert.deepEqual(JSON.parse(quota.w.localStorage.getItem('lab_management')), acceptedFirst);
const acceptedPending = JSON.parse(quota.w.localStorage.getItem('lab_pending_writes')).management.value;
assert.deepEqual(acceptedPending, acceptedFirst);
quota.w.Storage.prototype.setItem = quotaSet;
quota.submit(); await tick();
assert.equal(quota.snapshot().clients[0].name, 'Second edit');
assert.equal(JSON.parse(quota.w.localStorage.getItem('lab_pending_writes')).management.value.clients[0].name, 'Second edit');
quota.close();
const quotaReload = harness({cache:acceptedFirst,pending:acceptedPending,failCloud:true});
assert.deepEqual(quotaReload.snapshot(), acceptedFirst);
await tick(); quotaReload.close();

// Cache-only quota still has a durable newest pending copy, never an older cache.
const cacheQuota = harness({cache:pendingData,failCloud:true});
const cacheSet = cacheQuota.w.Storage.prototype.setItem;
cacheQuota.w.Storage.prototype.setItem = function(key,value) {if (key === 'lab_management') throw new Error('Cache quota'); return cacheSet.call(this,key,value);};
cacheQuota.w.document.querySelector('[data-mg-edit]').click(); cacheQuota.$('mg-name').value = 'Kept in durable queue'; cacheQuota.submit(); await tick();
assert.equal(cacheQuota.snapshot().clients[0].name, 'Kept in durable queue');
assert.equal(cacheQuota.w.localStorage.getItem('lab_management'), null);
assert.equal(JSON.parse(cacheQuota.w.localStorage.getItem('lab_pending_writes')).management.value.clients[0].name, 'Kept in durable queue');
assert.match(cacheQuota.$('mg-status').textContent, /pending queue/);
const durable = cacheQuota.snapshot(); cacheQuota.close();
const cacheReload = harness({pending:durable,failCloud:true});
assert.deepEqual(cacheReload.snapshot(), durable);
await tick(); cacheReload.close();

const otherEntry = {revision:456,value:[{id:'activity-fixture',details:'Preserve unrelated pending data'}]};
const preserveQueue = harness({cache:pendingData,otherPending:{activity:otherEntry},failCloud:true});
preserveQueue.w.document.querySelector('[data-mg-edit]').click(); preserveQueue.$('mg-name').value = 'Updated without discarding other work'; preserveQueue.submit(); await tick();
assert.deepEqual(JSON.parse(preserveQueue.w.localStorage.getItem('lab_pending_writes')).activity, otherEntry);
preserveQueue.close();
console.log('UI passed: independent clients, optional care, MRR, same-name safety, edit/cancel/repeated submit, escaping, references, legacy isolation, backup, quota failure, pending queue, reload, delayed load, and offline-first protection.');
