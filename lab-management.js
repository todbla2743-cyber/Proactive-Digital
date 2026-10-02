/* Independent Lab client/care records. No payment, sales, or Design Fusion writes. */
(function(root) {
  'use strict';
  const STATUSES = ['none', 'upcoming', 'active', 'paused', 'ended'];
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  const optionalDate = value => value == null || value === '' || validDate(value);
  const validAmount = value => value == null || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001);
  function validManagement(value) {
    if (!object(value) || !Array.isArray(value.clients)) return false;
    const ids = new Set();
    return value.clients.every(client => {
      if (!object(client) || typeof client.id !== 'string' || !client.id || ids.has(client.id) || typeof client.name !== 'string') return false;
      ids.add(client.id);
      const plan = client.monthlyPlan;
      return object(plan) && STATUSES.includes(plan.status) && validAmount(plan.amount) && optionalDate(plan.startDate) && optionalDate(plan.endDate) && (!plan.startDate || !plan.endDate || plan.startDate <= plan.endDate);
    });
  }
  function eligiblePlan(plan, date) {
    return object(plan) && validDate(date) && plan.status === 'active' && validAmount(plan.amount) && plan.amount > 0 && optionalDate(plan.startDate) && optionalDate(plan.endDate) && (!plan.startDate || plan.startDate <= date) && (!plan.endDate || plan.endDate >= date) && (!plan.startDate || !plan.endDate || plan.startDate <= plan.endDate);
  }
  function totals(data, date) {
    const clients = Array.isArray(data?.clients) ? data.clients : [];
    const active = clients.filter(client => eligiblePlan(client?.monthlyPlan, date));
    return {clients: clients.length, upcoming: clients.filter(client => client?.monthlyPlan?.status === 'upcoming').length, active: active.length, monthly: active.reduce((cents, client) => cents + Math.round(client.monthlyPlan.amount * 100), 0) / 100};
  }
  function makeClient(previous, fields, id, at) {
    const name = String(fields.name ?? '').trim();
    const description = String(fields.description ?? '').trim();
    const contact = String(fields.contact ?? '').trim();
    if (!name || name.length > 150 || description.length > 6000 || contact.length > 250) throw new Error('Enter a client or project name and keep each field within its limit.');
    const status = fields.status;
    const rawAmount = fields.amount == null ? '' : String(fields.amount).trim();
    if (rawAmount && !/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) throw new Error('Enter a non-negative monthly USD amount with up to two decimal places, or leave it blank.');
    const amount = rawAmount === '' ? null : Number(rawAmount);
    if (!STATUSES.includes(status) || !validAmount(amount)) throw new Error('Choose a supported monthly plan status and amount.');
    const startDate = fields.startDate || null, endDate = fields.endDate || null;
    if (!optionalDate(startDate) || !optionalDate(endDate) || (startDate && endDate && startDate > endDate)) throw new Error('Use valid dates, with the end date on or after the start date.');
    const monthlyPlan = {...(object(previous?.monthlyPlan) ? previous.monthlyPlan : {}), status, amount, startDate, endDate};
    const client = {...previous, id, name, description, contact, recordId: fields.recordId || null, monthlyPlan, createdAt: previous?.createdAt || at, updatedAt: at};
    // Preserve unknown fields and historical data, including unusual legacy history shapes.
    if (previous?.history === undefined || Array.isArray(previous.history)) {
      client.history = [...(previous?.history || []), {at, action: previous ? 'updated' : 'created', monthlyPlan: clone(monthlyPlan)}];
    }
    return client;
  }
  root.LabManagementCore = {STATUSES, validDate, validManagement, eligiblePlan, totals, makeClient};
  if (typeof document === 'undefined') return;
  if (document.getElementById('lab-management')) return;
  const $ = id => document.getElementById(id);
  const panel = $('panel-clients');
  if (!panel || typeof SB === 'undefined' || !root.LabWorkspace) return;
  const today = () => {const date = new Date(); return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');};
  const money = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'}).format(value);
  let management = {clients:[]}, blocked = false, trustedCopy = false, loadWarning = '', mutation = 0;
  try {
    const raw = localStorage.getItem('lab_management');
    if (raw) {const cached = JSON.parse(raw); if (!validManagement(cached)) throw new Error('Invalid cache'); management = cached; trustedCopy = true;}
    // A queued edit is newer than the cache/cloud, even when an earlier tab could not update the cache.
    const pending = JSON.parse(localStorage.getItem('lab_pending_writes') || '{}');
    if (object(pending) && Object.prototype.hasOwnProperty.call(pending, 'management')) {
      if (!validManagement(pending.management?.value)) throw new Error('Invalid pending data');
      management = clone(pending.management.value);
      trustedCopy = true;
    }
  } catch {
    blocked = true;
    loadWarning = 'Client records could not be read safely on this device. Reconnect to load the cloud copy, or restore a valid backup before editing.';
  }
  if (!trustedCopy && !blocked) {
    blocked = true;
    loadWarning = 'Load client / care records from the cloud before adding or editing. Reconnect and sign in again if the cloud is unavailable.';
  }
  const section = document.createElement('section');
  section.id = 'lab-management';
  section.className = 'ws-wrap';
  section.style.cssText = 'width:100%;box-sizing:border-box;flex-shrink:0;margin:0 auto;border-bottom:1px solid var(--border)';
  section.setAttribute('aria-labelledby', 'mg-heading');
  section.innerHTML = `<h2 id="mg-heading">Clients & monthly care</h2>
    <p class="ws-muted">Keep client and project details here without a payment schedule. Optional monthly care is tracked separately from sales and installment payments below. No charges or invoices are created.</p>
    <div class="ws-toolbar"><button class="ws-btn" type="button" id="mg-add">Add client / project</button><label>Find a client<input type="search" id="mg-search" maxlength="150" placeholder="Name, project, or contact"></label><label>Monthly plan<select id="mg-filter"><option value="all">All statuses</option><option value="none">None</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label></div>
    <p id="mg-summary" class="ws-muted"></p>
    <p class="ws-muted">Totals cover only these client/care records and are not added to the sales totals below. Active monthly care includes only explicitly active, positive USD plans with no future start date or expired end date. Unknown dates remain blank; an explicitly active plan can count without dates. Upcoming, paused, and ended plans contribute $0. End dates are inclusive.</p>
    <p id="mg-status" class="ws-muted" role="status" aria-live="polite"></p>
    <form id="mg-form" class="ws-editor" hidden>
      <h3 id="mg-form-heading">Add client / project</h3>
      <div class="ws-fields"><label>Client / project name<input id="mg-name" required maxlength="150"></label><label>Contact (optional)<input id="mg-contact" maxlength="250"></label></div>
      <label>Project description (optional)<textarea id="mg-description" maxlength="6000"></textarea></label>
      <label>Reference an existing sales record (optional)<select id="mg-record"><option value="">No reference</option></select></label>
      <p class="ws-muted">A reference does not copy or change that record, its payments, or its revenue. Matching names stay separate.</p>
      <div class="ws-fields"><label>Monthly care status<select id="mg-plan-status"><option value="none">None</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option></select></label><label>Monthly amount (USD, optional)<input id="mg-amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Leave blank if unknown"></label><label>Start date (optional)<input id="mg-start" type="date"></label><label>End date (optional)<input id="mg-end" type="date"></label></div>
      <p class="ws-muted">Dates and amounts are optional. Upcoming plans do not become active automatically; change the status when service starts.</p>
      <p id="mg-form-error" role="alert" class="ws-overdue"></p>
      <button class="ws-btn" id="mg-save" type="submit">Save client / project</button> <button class="ws-btn" id="mg-cancel" type="button">Cancel</button>
    </form><div id="mg-list" class="ws-grid"></div>`;
  panel.prepend(section);
  const message = text => {$('mg-status').textContent = text;};
  const error = text => {$('mg-form-error').textContent = text;};
  const legacyRecords = () => typeof RECORDS !== 'undefined' && Array.isArray(RECORDS) ? RECORDS : [];
  function referenceLabel(id) {
    const record = legacyRecords().find(item => item && String(item.id) === String(id));
    return record ? String(record.name || 'Unnamed sales record') + ' (' + id + ')' : String(id) + ' (reference unavailable)';
  }
  function render() {
    $('mg-add').disabled = blocked;
    // Label only the existing UI; its handlers, values and data remain unchanged.
    const legacyHeading = panel.querySelector('.panel-header .panel-title');
    const legacyAdd = panel.querySelector('.panel-header [onclick="openClientModal()"]');
    if (legacyHeading) legacyHeading.textContent = 'Sales & installment projects';
    if (legacyAdd) legacyAdd.textContent = '+ Add installment project';
    const legacyMRR = panel.querySelector('#clientsList .mrr-label');
    if (legacyMRR) legacyMRR.textContent = 'Sales-record retainers only (MRR)';
    const legacyMRRStat = $('statPipeline')?.previousElementSibling;
    if (legacyMRRStat) legacyMRRStat.textContent = 'Sales-record retainers / mo';
    const firstLegacyAdd = panel.querySelector('#clientsList .add-client-btn');
    if (firstLegacyAdd) firstLegacyAdd.textContent = '+ Add first installment project';
    const summary = totals(management, today());
    const query = $('mg-search').value.trim().toLowerCase(), filter = $('mg-filter').value;
    const visible = management.clients.filter(client => (!query || [client.name, client.description, client.contact].some(value => String(value || '').toLowerCase().includes(query))) && (filter === 'all' || client.monthlyPlan.status === filter));
    $('mg-summary').textContent = `${summary.clients} client / project records · ${summary.upcoming} upcoming plans · Active monthly care (these records only): ${money(summary.monthly)} USD / month across ${summary.active} eligible plans · ${visible.length} records shown`;
    $('mg-list').innerHTML = visible.length ? visible.map(client => {
      const plan = client.monthlyPlan;
      const counts = eligiblePlan(plan, today());
      return `<article class="ws-card"><span class="ws-tag">Monthly care: ${escape(plan.status)}</span><h3>${escape(client.name)}</h3>${client.description ? '<p>' + escape(client.description) + '</p>' : ''}${client.contact ? '<p>Contact: ' + escape(client.contact) + '</p>' : ''}<p class="ws-muted">Monthly amount: ${plan.amount == null ? 'Not set' : escape(money(plan.amount) + ' USD')}<br>Start: ${escape(plan.startDate || 'Not set')} · End: ${escape(plan.endDate || 'Not set')}<br>${counts ? 'Included in active monthly care total' : 'Excluded from active monthly care total'}</p>${client.recordId ? '<p class="ws-muted">Sales reference: ' + escape(referenceLabel(client.recordId)) + '</p>' : ''}<footer><span class="ws-muted">Updated ${escape(String(client.updatedAt || '').slice(0, 10) || 'Unknown')}</span><button class="ws-btn" type="button" data-mg-edit="${escape(client.id)}"${blocked ? ' disabled' : ''}>Edit client / care</button></footer></article>`;
    }).join('') : '<div class="ws-empty">' + (management.clients.length ? 'No client / project records match these filters.' : 'No independent client records yet. Add a client or project, with or without monthly care.') + '</div>';
  }
  function save(next) {
    if (blocked || !validManagement(next)) return false;
    // Persist the recovery queue before advancing the cache. If quota permits only
    // one write, a newer cache must never be rolled back by an older pending entry.
    // Merge all persisted collections; SB.save continues to own the in-memory queue.
    try {
      const pending = JSON.parse(localStorage.getItem('lab_pending_writes') || '{}');
      if (!object(pending)) throw new Error('Invalid pending queue');
      const staged = {...pending, management:{revision:Date.now(), value:next}};
      localStorage.setItem('lab_pending_writes', JSON.stringify(staged));
    } catch {error('Could not save on this device. Your draft is still open; free browser storage or copy it before closing.'); message('Client / care changes were not saved.'); return false;}
    let cacheFailed = false;
    try {localStorage.setItem('lab_management', JSON.stringify(next));}
    catch {
      cacheFailed = true;
      // A successfully flushed queue may disappear; do not then trust an older cache.
      try {localStorage.removeItem('lab_management');} catch {}
    }
    management = next;
    trustedCopy = true;
    mutation++;
    message(cacheFailed ? 'Saved in this device’s pending queue, but the client cache could not be updated. Export a backup before closing and check cloud sync above.' : 'Saved on this device. Check the cloud save indicator above for sync status.');
    try {
      Promise.resolve(SB.save('management', next)).catch(() => message('Saved on this device; cloud save could not complete. Use Retry cloud save above and export a backup before closing.'));
    } catch {
      message('Saved on this device; cloud save could not be queued. Export a backup before closing and save again after reconnecting.');
    }
    return true;
  }
  let editingId = null, editingExisting = false;
  function edit(id) {
    if (blocked) return;
    const client = id ? management.clients.find(item => item.id === id) : null;
    if (id && !client) {message('That client record is no longer available. Reopen the current record.'); return;}
    editingId = client?.id || 'mg_' + root.crypto.randomUUID();
    editingExisting = !!client;
    $('mg-form').reset();
    $('mg-form-heading').textContent = client ? 'Edit client / monthly care' : 'Add client / project';
    $('mg-name').value = client?.name || '';
    $('mg-contact').value = client?.contact || '';
    $('mg-description').value = client?.description || '';
    $('mg-plan-status').value = client?.monthlyPlan.status || 'none';
    $('mg-amount').value = client?.monthlyPlan.amount ?? '';
    $('mg-start').value = client?.monthlyPlan.startDate || '';
    $('mg-end').value = client?.monthlyPlan.endDate || '';
    const selected = client?.recordId ? String(client.recordId) : '';
    const options = new Map(legacyRecords().filter(record => record && record.id != null).map(record => [String(record.id), String(record.name || 'Unnamed sales record') + ' (' + record.id + ')']));
    if (selected && !options.has(selected)) options.set(selected, referenceLabel(selected));
    $('mg-record').innerHTML = '<option value="">No reference</option>' + [...options].map(([value, label]) => '<option value="' + escape(value) + '">' + escape(label) + '</option>').join('');
    $('mg-record').value = selected;
    error('');
    $('mg-form').hidden = false;
    $('mg-name').focus();
  }
  $('mg-add').onclick = () => edit();
  $('mg-cancel').onclick = () => {editingId = null; $('mg-form').reset(); $('mg-form').hidden = true; error('');};
  $('mg-search').oninput = render;
  $('mg-filter').onchange = render;
  $('mg-list').onclick = event => {const button = event.target.closest('[data-mg-edit]'); if (button) edit(button.dataset.mgEdit);};
  $('mg-form').onsubmit = event => {
    event.preventDefault();
    if ($('mg-form').hidden || !editingId || blocked) return;
    error('');
    const old = management.clients.find(client => client.id === editingId);
    if (editingExisting && !old) {error('This record changed while you were editing. Cancel and reopen the current record before saving.'); return;}
    try {
      const item = makeClient(old, {name:$('mg-name').value, contact:$('mg-contact').value, description:$('mg-description').value, recordId:$('mg-record').value, status:$('mg-plan-status').value, amount:$('mg-amount').value, startDate:$('mg-start').value, endDate:$('mg-end').value}, editingId, new Date().toISOString());
      const next = {...management, clients:old ? management.clients.map(client => client.id === editingId ? item : client) : [...management.clients, item]};
      if (save(next)) {editingId = null; $('mg-form').hidden = true; render();}
    } catch (cause) {error(cause.message || 'Could not save this client record.');}
  };
  const oldLoad = SB.load.bind(SB);
  SB.load = async () => {
    const version = mutation;
    const store = await oldLoad();
    if (!store) {if (blocked) message('Client / care records are unavailable on this device. Reconnect and sign in again, or restore a valid backup before editing.'); return store;}
    if (version !== mutation) return {...store, management:clone(management)};
    if (Object.prototype.hasOwnProperty.call(store, 'management')) {
      if (!validManagement(store.management)) {blocked = true; message('Cloud client / care records could not be read safely. They have not replaced this device’s copy. Restore a valid backup before editing.'); render(); return store;}
      management = clone(store.management);
      blocked = false;
      try {localStorage.setItem('lab_management', JSON.stringify(management)); message('Client / care records loaded.');}
      catch {message('Cloud client / care records loaded, but could not be cached on this device. Export a backup before closing.');}
      render();
    } else if (!trustedCopy) {
      // A successful load establishes that this new collection is absent, not merely unavailable.
      blocked = false;
      message('Client / care records loaded. No independent records yet.');
      render();
    }
    trustedCopy = true;
    return {...store, management:clone(management)};
  };
  const oldInit = initApp;
  initApp = function(...args) {const result = oldInit.apply(this, args); render(); return result;};
  const oldSwitch = switchPanel;
  switchPanel = function(id, ...args) {const result = oldSwitch.call(this, id, ...args); if (id === 'clients') render(); return result;};
  const workspace = root.LabWorkspace;
  root.LabWorkspace = {...workspace,
    snapshot:() => ({...workspace.snapshot(), management:clone(management)}),
    restore:data => {
      const hasManagement = object(data) && Object.prototype.hasOwnProperty.call(data, 'management');
      if (hasManagement && !validManagement(data.management)) throw new Error('Backup client / care records are invalid. Existing data has been kept.');
      if (hasManagement) {
        const wasBlocked = blocked;
        blocked = false;
        if (!save(clone(data.management))) {blocked = wasBlocked; throw new Error('Client / care backup could not be saved on this device.');}
        editingId = null;
        $('mg-form').hidden = true;
      }
      workspace.restore(data);
      render();
    }
  };
  message(loadWarning);
  render();
})(typeof window === 'undefined' ? globalThis : window);
