/* Prospect CRM. Records stay in Netlify Blobs. This file holds no client data. */
(function () {
  'use strict';
  const API = '/.netlify/functions/lab-crm';
  const STAGES = ['Found', 'Audited', 'Mockup Built', 'Outreach Sent', 'Follow-up Due', 'Replied', 'Won', 'Lost'];
  const CATEGORIES = [
    ['restaurant/food', 'Restaurant / food'],
    ['trades', 'Trades'],
    ['other', 'Other']
  ];
  let prospects = [];
  let updatedAt = '';
  let today = '';
  let loaded = false;
  let saving = false;
  let dragId = '';
  let editingId = '';

  const CSS = `
    #panel-prospects.panel.active { flex-direction: column; overflow: hidden; }
    .crm { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 16px; box-sizing: border-box; }
    .crm-top, .crm-status, .crm-due { flex-shrink: 0; }
    .crm-top { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .crm-title { flex: 1 1 180px; }
    .crm-title h2 { font-size: 1.15rem; font-weight: 650; letter-spacing: -0.02em; }
    .crm-title p { color: var(--text-dim); font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.08em; text-transform: uppercase; }
    .crm-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 1 1 100%; }
    .crm-search, .crm-tools select, .crm-top select { background: var(--surface); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 10px; font: 0.82rem var(--font); min-width: 0; }
    .crm-search { flex: 1 1 240px; min-width: 180px; }
    .crm-top select { max-width: 100%; }
    .crm-btn, .crm-file { background: var(--surface); color: var(--text-mid); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; font: 600 0.78rem var(--font); cursor: pointer; }
    .crm-btn.primary { background: var(--teal); color: #041018; border-color: transparent; }
    .crm-btn:hover, .crm-file:hover { border-color: var(--teal-mid); color: var(--text); }
    .crm-btn.primary:hover { opacity: 0.92; color: #041018; }
    .crm-btn:disabled { opacity: 0.55; cursor: wait; }
    .crm-check { display: flex; align-items: center; gap: 6px; color: var(--text-dim); font-size: 0.75rem; }
    .crm-status { min-height: 1.1em; color: var(--text-mid); font-size: 0.78rem; font-family: var(--mono); }
    .crm-due { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 10px; max-height: 168px; overflow: auto; }
    .crm-due h3 { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); font-family: var(--mono); margin-bottom: 8px; }
    .crm-due-list { display: flex; flex-direction: column; gap: 6px; }
    .crm-due-item, .crm-blank, .crm-empty { width: 100%; text-align: left; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: 0.82rem var(--font); cursor: pointer; }
    .crm-due-item strong { display: block; }
    .crm-due-item span, .crm-meta, .crm-contact, .crm-when { color: var(--text-dim); font-size: 0.72rem; }
    .crm-due-item.is-overdue strong, .crm-when.is-overdue { color: var(--danger); }
    .crm-due-item.is-today strong, .crm-when.is-today { color: var(--teal); }
    .crm-blank, .crm-empty { cursor: default; color: var(--text-dim); text-align: center; }
    .crm-board-wrap { flex: 1; min-height: 0; overflow: auto; padding-bottom: 6px; }
    .crm-board { display: flex; gap: 10px; align-items: stretch; min-height: 100%; }
    .crm-col { flex: 1 1 0; min-width: 150px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; min-height: 160px; max-height: 100%; }
    .crm-col.is-over { border-color: var(--teal); box-shadow: inset 0 0 0 1px var(--teal); }
    .crm-col header { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--border); }
    .crm-col h2 { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-mid); font-family: var(--mono); font-weight: 600; }
    .crm-count { font: 0.68rem var(--mono); color: var(--text-dim); background: var(--surface2); border-radius: 99px; padding: 2px 7px; }
    .crm-cards { display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: auto; flex: 1; min-height: 72px; }
    .crm-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 4px; cursor: grab; }
    .crm-card:hover, .crm-card:focus-visible { border-color: var(--teal-mid); }
    .crm-card.is-dragging { opacity: 0.45; }
    .crm-card h3 { font-size: 0.9rem; font-weight: 600; overflow-wrap: anywhere; }
    .crm-links { display: flex; gap: 10px; }
    .crm-links a { color: var(--teal); font-size: 0.75rem; }
    .crm-move { display: flex; align-items: center; gap: 6px; color: var(--text-dim); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono); }
    .crm-move select, .crm-modal select, .crm-modal input, .crm-modal textarea { width: 100%; background: var(--surface2); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: 0.85rem var(--font); }
    .crm-move select { width: auto; flex: 1; text-transform: none; letter-spacing: 0; font-family: var(--font); }
    .crm-modal { position: fixed; inset: 0; z-index: 90; background: rgba(4, 12, 20, 0.72); display: none; align-items: center; justify-content: center; padding: 18px; }
    .crm-modal.is-open { display: flex; }
    .crm-dialog { width: min(680px, 100%); max-height: min(92vh, 920px); overflow: auto; background: var(--surface); border: 1px solid var(--border-hover); border-radius: 16px; padding: 18px; }
    .crm-dialog h2 { font-size: 1.15rem; margin-bottom: 4px; }
    .crm-dialog .crm-help { color: var(--text-dim); font-size: 0.78rem; margin-bottom: 12px; }
    .crm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
    .crm-field { display: flex; flex-direction: column; gap: 4px; }
    .crm-field.span, .crm-log { grid-column: 1 / -1; }
    .crm-field label, .crm-log h3 { font: 600 0.68rem var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); }
    .crm-modal textarea { min-height: 88px; resize: vertical; }
    .crm-actions { display: flex; gap: 8px; margin-top: 14px; position: sticky; bottom: 0; background: var(--surface); padding-top: 8px; }
    .crm-actions .crm-btn { min-height: 42px; }
    .crm-log { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }
    .crm-note { background: var(--surface2); border-radius: 8px; padding: 8px 10px; }
    .crm-note time { display: block; color: var(--text-dim); font: 0.68rem var(--mono); margin-bottom: 3px; }
    .crm-more { flex: 1 1 100%; }
    .crm-more summary { cursor: pointer; color: var(--text-mid); font-size: 0.78rem; }
    .crm-more .crm-tools { margin-top: 8px; }
    @media (min-width: 801px) {
      .crm-more > summary { display: none; }
      .crm-more .crm-tools { display: flex !important; margin-top: 0; }
    }
    .crm button:focus-visible, .crm input:focus-visible, .crm select:focus-visible, .crm textarea:focus-visible, .crm-modal input:focus-visible, .crm-modal select:focus-visible, .crm-modal textarea:focus-visible, .crm-more summary:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }
    @media (max-width: 800px) {
      #panel-prospects.panel.active { overflow-x: hidden !important; overflow-y: auto !important; }
      .crm { height: auto; min-height: 100%; overflow: visible; padding: 10px 10px calc(16px + env(safe-area-inset-bottom)); gap: 8px; }
      .crm-title p { display: none; }
      .crm-title, .crm-search, .crm-tools, .crm-more { flex: 1 1 100%; }
      .crm-tools select { flex: 1 1 calc(33% - 8px); min-width: 0; }
      .crm-btn, .crm-file, .crm-more summary { min-height: 44px; }
      .crm-due { max-height: 150px; }
      .crm-board-wrap { flex: none; min-height: 280px; overflow: visible; }
      .crm-board { flex-direction: column; min-height: 0; }
      .crm-col { flex: 1 1 auto; width: 100%; min-width: 0; max-height: none; }
      .crm-cards { overflow: visible; }
      .crm-modal { padding: 0; align-items: stretch; }
      .crm-dialog { max-width: none; max-height: none; height: 100%; border-radius: 0; }
      .crm-grid { grid-template-columns: 1fr; }
      .crm-modal input, .crm-modal select, .crm-modal textarea, .crm-move select { font-size: 16px; }
      .crm-actions { flex-wrap: wrap; }
      .crm-actions .crm-btn { flex: 1 1 40%; }
    }
  `;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function categoryLabel(value) {
    return (CATEGORIES.find(item => item[0] === value) || CATEGORIES[2])[1];
  }
  function shortDate(iso) {
    if (!iso) return '';
    const parts = iso.split('-').map(Number);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = today && iso.slice(0, 4) !== today.slice(0, 4) ? `, ${parts[0]}` : '';
    return `${months[parts[1] - 1] || ''} ${parts[2] || ''}${year}`.trim();
  }
  function whenClass(iso) {
    if (!iso || !today) return '';
    if (iso < today) return 'is-overdue';
    if (iso === today) return 'is-today';
    return '';
  }
  function whenText(iso) {
    if (!iso) return '';
    if (iso === today) return 'Due today';
    if (iso < today) return `Overdue ${shortDate(iso)}`;
    return `Follow-up ${shortDate(iso)}`;
  }
  function stamp(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  }
  function safeHref(url) {
    return /^https?:\/\//i.test(url || '') ? url : '';
  }
  function flagDue(list) {
    return list.map(prospect => ({
      ...prospect,
      due: Boolean(prospect.nextFollowUpDate) && prospect.nextFollowUpDate <= today && prospect.status !== 'Won' && prospect.status !== 'Lost'
    }));
  }
  function $(id) { return document.getElementById(id); }
  function setStatus(message) {
    const el = $('crm-status');
    if (el) el.textContent = message || '';
  }
  function applyData(payload) {
    today = payload.today || today;
    updatedAt = payload.updatedAt || '';
    prospects = flagDue(Array.isArray(payload.prospects) ? payload.prospects : []);
    loaded = true;
    render();
  }

  async function api(method, body, query) {
    const response = await fetch(API + (query || ''), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('json') ? await response.json() : await response.text();
    if (!response.ok) {
      const error = new Error(typeof payload === 'string' ? payload : (payload && payload.error) || 'Could not save. Try again.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function handleError(error) {
    if (error && error.status === 409 && error.payload && Array.isArray(error.payload.prospects)) {
      applyData(error.payload);
      closeEditor();
      setStatus('This board changed on another device. Showing the latest copy.');
      return;
    }
    if (error && (error.status === 401 || error.status === 503)) {
      setStatus('Sign in again to open the prospect board.');
      return;
    }
    setStatus((error && error.message) || 'Could not save. Try again.');
  }

  async function load() {
    setStatus('Loading prospects...');
    try {
      applyData(await api('GET'));
      if (!prospects.length) setStatus('No prospects yet. Add one, or import a JSON or CSV file.');
      else setStatus('');
    } catch (error) {
      if (!error.status) setStatus('Could not reach the prospect board. Check your connection and try again.');
      else handleError(error);
    }
  }

  function openBoard() {
    if (!loaded) return load();
    render();
  }

  function stageOptions(current) {
    return STAGES.map(stage => `<option value="${esc(stage)}"${stage === current ? ' selected' : ''}>${esc(stage)}</option>`).join('');
  }

  function card(prospect) {
    const href = safeHref(prospect.mockupLink);
    const site = safeHref(prospect.website);
    const timing = whenClass(prospect.nextFollowUpDate);
    const meta = [categoryLabel(prospect.category), prospect.city].filter(Boolean).join(' · ');
    return `<article class="crm-card" draggable="true" data-crm-id="${esc(prospect.id)}" tabindex="0">
      <h3>${esc(prospect.businessName)}</h3>
      ${meta ? `<p class="crm-meta">${esc(meta)}</p>` : ''}
      ${prospect.contactName ? `<p class="crm-contact">${esc(prospect.contactName)}</p>` : ''}
      ${prospect.nextFollowUpDate ? `<p class="crm-when ${timing}">${esc(whenText(prospect.nextFollowUpDate))}</p>` : ''}
      ${(href || site) ? `<p class="crm-links">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open mockup</a>` : ''}${site ? `<a href="${esc(site)}" target="_blank" rel="noopener noreferrer">Website</a>` : ''}</p>` : ''}
      <label class="crm-move">Move <select data-crm-move="${esc(prospect.id)}" aria-label="Move ${esc(prospect.businessName)}">${stageOptions(prospect.status)}</select></label>
    </article>`;
  }

  function render() {
    const board = $('crm-board');
    const due = $('crm-due');
    if (!board || !due) return;
    const query = ($('crm-search').value || '').trim().toLowerCase();
    const stage = $('crm-stage-filter').value;
    const category = $('crm-category-filter').value;
    const cities = [...new Set(prospects.map(item => item.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const citySelect = $('crm-city-filter');
    const previousCity = citySelect.value;
    citySelect.innerHTML = `<option value="">All cities</option>${cities.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}`;
    citySelect.value = cities.includes(previousCity) ? previousCity : '';
    const matchesQuery = prospect => {
      if (!query) return true;
      const notes = (prospect.activity || []).map(item => item.text).join(' ');
      return [prospect.businessName, prospect.city, prospect.contactName, prospect.email, prospect.phone, prospect.source, prospect.auditFindings, notes].join(' ').toLowerCase().includes(query);
    };
    const visible = prospects.filter(prospect => {
      if (stage && prospect.status !== stage) return false;
      if (category && prospect.category !== category) return false;
      if (citySelect.value && prospect.city !== citySelect.value) return false;
      return matchesQuery(prospect);
    });
    const dueItems = prospects.filter(prospect => {
      if (!prospect.due) return false;
      if (category && prospect.category !== category) return false;
      if (citySelect.value && prospect.city !== citySelect.value) return false;
      return matchesQuery(prospect);
    }).sort((a, b) => String(a.nextFollowUpDate).localeCompare(String(b.nextFollowUpDate)));
    due.innerHTML = `<h3>Due today / overdue (${dueItems.length})</h3>${dueItems.length ? `<div class="crm-due-list">${dueItems.map(item => `<button type="button" class="crm-due-item ${whenClass(item.nextFollowUpDate)}" data-crm-open="${esc(item.id)}"><strong>${esc(item.businessName)}</strong><span>${esc([item.city, categoryLabel(item.category), whenText(item.nextFollowUpDate)].filter(Boolean).join(' · '))}</span></button>`).join('')}</div>` : '<p class="crm-empty">Nothing due. You are caught up.</p>'}`;
    if (!prospects.length) {
      board.innerHTML = '<p class="crm-blank">No prospects yet. Add one, or import a JSON or CSV file.</p>';
      return;
    }
    if (!visible.length && !stage) {
      board.innerHTML = '<p class="crm-blank">No prospects match these filters.</p>';
      return;
    }
    const columns = stage ? STAGES.filter(name => name === stage) : STAGES;
    board.innerHTML = `<div class="crm-board">${columns.map(name => {
      const cards = visible.filter(item => item.status === name).sort((a, b) => {
        const left = a.nextFollowUpDate || '9999-99-99';
        const right = b.nextFollowUpDate || '9999-99-99';
        if (left !== right) return left < right ? -1 : 1;
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      return `<section class="crm-col" data-crm-column="${esc(name)}"><header><h2>${esc(name)}</h2><span class="crm-count">${cards.length}</span></header><div class="crm-cards">${cards.length ? cards.map(card).join('') : '<p class="crm-empty">Empty</p>'}</div></section>`;
    }).join('')}</div>`;
  }

  function fillForm(prospect) {
    const values = prospect || { category: 'other', status: 'Found' };
    $('crm-business').value = values.businessName || '';
    $('crm-category').value = values.category || 'other';
    $('crm-city').value = values.city || '';
    $('crm-contact').value = values.contactName || '';
    $('crm-email').value = values.email || '';
    $('crm-phone').value = values.phone || '';
    $('crm-website').value = values.website || '';
    $('crm-source').value = values.source || '';
    $('crm-audit').value = values.auditFindings || '';
    $('crm-mockup').value = values.mockupLink || '';
    $('crm-outreach').value = values.outreachDate || '';
    $('crm-followup').value = values.nextFollowUpDate || '';
    $('crm-stage').value = values.status || 'Found';
    $('crm-note').value = '';
    const log = $('crm-log');
    const notes = (values.activity || []).slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    log.innerHTML = notes.length ? `<h3>Notes</h3>${notes.map(note => `<article class="crm-note"><time datetime="${esc(note.at)}">${esc(stamp(note.at))}</time><p>${esc(note.text)}</p></article>`).join('')}` : '<h3>Notes</h3><p class="crm-meta">No notes yet.</p>';
  }

  function openEditor(id) {
    const prospect = id ? prospects.find(item => item.id === id) : null;
    if (id && !prospect) return;
    editingId = id || '';
    $('crm-dialog-title').textContent = prospect ? 'Edit prospect' : 'Add prospect';
    $('crm-delete').hidden = !prospect;
    fillForm(prospect);
    $('crm-modal').classList.add('is-open');
    $('crm-business').focus();
  }

  function closeEditor() {
    const modal = $('crm-modal');
    if (modal) modal.classList.remove('is-open');
    editingId = '';
  }

  function readPatch() {
    return {
      businessName: $('crm-business').value,
      category: $('crm-category').value,
      city: $('crm-city').value,
      contactName: $('crm-contact').value,
      email: $('crm-email').value,
      phone: $('crm-phone').value,
      website: $('crm-website').value,
      source: $('crm-source').value,
      auditFindings: $('crm-audit').value,
      mockupLink: $('crm-mockup').value,
      outreachDate: $('crm-outreach').value,
      nextFollowUpDate: $('crm-followup').value,
      status: $('crm-stage').value
    };
  }

  async function mutate(body, success) {
    if (saving) return;
    saving = true;
    document.querySelectorAll('.crm-actions .crm-btn').forEach(button => { button.disabled = true; });
    setStatus('Saving...');
    try {
      const result = await api('POST', { ...body, baseUpdatedAt: updatedAt });
      applyData(result);
      closeEditor();
      setStatus(success(result));
    } catch (error) {
      if (!error.status) setStatus('Could not reach the prospect board. Check your connection and try again.');
      else handleError(error);
    } finally {
      saving = false;
      document.querySelectorAll('.crm-actions .crm-btn').forEach(button => { button.disabled = false; });
    }
  }

  function onSave(event) {
    event.preventDefault();
    const patch = readPatch();
    if (!patch.businessName.trim()) { setStatus('Business name is required.'); $('crm-business').focus(); return; }
    const note = $('crm-note').value;
    if (editingId) mutate({ action: 'update', id: editingId, patch, note }, () => 'Saved.');
    else mutate({ action: 'create', prospect: patch, note }, () => 'Prospect added.');
  }

  function onDelete() {
    const prospect = prospects.find(item => item.id === editingId);
    if (!prospect) return;
    if (!confirm(`Delete ${prospect.businessName}? This cannot be undone.`)) return;
    mutate({ action: 'delete', id: prospect.id }, () => 'Prospect deleted.');
  }

  async function moveProspect(id, status) {
    const current = prospects.find(item => item.id === id);
    if (!current || current.status === status || saving) return;
    saving = true;
    setStatus('Saving...');
    try {
      applyData(await api('POST', { action: 'update', id, baseUpdatedAt: updatedAt, patch: { status } }));
      setStatus(`Moved to ${status}.`);
    } catch (error) {
      render();
      if (!error.status) setStatus('Could not reach the prospect board. Check your connection and try again.');
      else handleError(error);
    } finally { saving = false; }
  }

  async function onImport(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const replace = $('crm-replace').checked;
    if (replace && !confirm('Replace every prospect with this file?')) return;
    const text = await file.text();
    if (text.length > 4000000) { setStatus('That file is too large.'); return; }
    const trimmed = text.trim();
    const format = trimmed.startsWith('{') || trimmed.startsWith('[') ? 'json' : 'csv';
    await mutate({ action: 'import', format, text, mode: replace ? 'replace' : 'merge' }, result => {
      const skipped = result.skipped ? `, skipped ${result.skipped}` : '';
      return `Added ${result.imported || 0}, updated ${result.updated || 0}${skipped}.`;
    });
  }

  async function download(format) {
    try {
      const response = await fetch(`${API}?format=${format}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) { setStatus(response.status === 401 ? 'Sign in again to export.' : 'Could not export. Try again.'); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `prospects-${today || 'export'}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch { setStatus('Could not export. Try again.'); }
  }

  function ensureShell() {
    const content = document.querySelector('#app .content');
    const tabs = document.querySelector('.nav-tabs');
    if (!content || !tabs) return;
    let button = document.getElementById('crm-tab');
    if (!button) {
      button = document.createElement('button');
      button.className = 'nav-tab';
      button.id = 'crm-tab';
      button.type = 'button';
      button.textContent = 'Prospects';
      const todayTab = [...tabs.querySelectorAll('.nav-tab')].find(tab => (tab.getAttribute('onclick') || '').includes("'today'"));
      if (todayTab) todayTab.insertAdjacentElement('afterend', button);
      else tabs.prepend(button);
      button.addEventListener('click', () => window.switchPanel('prospects', button));
    }
    let panel = document.getElementById('panel-prospects');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'panel-prospects';
      panel.className = 'panel';
      content.appendChild(panel);
    }
    if (panel.dataset.ready === '1') return;
    panel.dataset.ready = '1';
    panel.innerHTML = `<div class="crm">
      <div class="crm-top">
        <div class="crm-title"><h2>Prospects</h2><p>Outreach pipeline</p></div>
        <button class="crm-btn primary" id="crm-add" type="button">Add prospect</button>
        <div class="crm-tools">
          <input class="crm-search" id="crm-search" type="search" placeholder="Search business, contact, or city" autocomplete="off" aria-label="Search prospects">
          <select id="crm-stage-filter" aria-label="Filter by stage"><option value="">All stages</option>${STAGES.map(stage => `<option value="${esc(stage)}">${esc(stage)}</option>`).join('')}</select>
          <select id="crm-category-filter" aria-label="Filter by category"><option value="">All categories</option>${CATEGORIES.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select>
          <select id="crm-city-filter" aria-label="Filter by city"><option value="">All cities</option></select>
        </div>
        <details class="crm-more" id="crm-more">
          <summary>Import and export</summary>
          <div class="crm-tools">
            <button class="crm-btn" id="crm-import-btn" type="button">Import</button>
            <input id="crm-import" type="file" accept=".json,.csv,application/json,text/csv" hidden>
            <button class="crm-btn" id="crm-export-json" type="button">Export JSON</button>
            <button class="crm-btn" id="crm-export-csv" type="button">Export CSV</button>
            <button class="crm-btn" id="crm-refresh" type="button">Refresh</button>
            <label class="crm-check"><input id="crm-replace" type="checkbox"> Replace on import</label>
          </div>
        </details>
      </div>
      <p class="crm-status" id="crm-status" role="status"></p>
      <section class="crm-due" id="crm-due" aria-label="Due today and overdue"></section>
      <div class="crm-board-wrap" id="crm-board" aria-label="Prospect pipeline"></div>
    </div>`;
    const modal = document.createElement('div');
    modal.className = 'crm-modal';
    modal.id = 'crm-modal';
    modal.innerHTML = `<form class="crm-dialog" id="crm-form" role="dialog" aria-modal="true" aria-labelledby="crm-dialog-title">
      <h2 id="crm-dialog-title">Add prospect</h2>
      <p class="crm-help">Leave follow-up blank to schedule it 7 days after the outreach date.</p>
      <div class="crm-grid">
        <div class="crm-field"><label for="crm-business">Business name</label><input id="crm-business" maxlength="160" autocomplete="organization" required></div>
        <div class="crm-field"><label for="crm-category">Category</label><select id="crm-category">${CATEGORIES.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')}</select></div>
        <div class="crm-field"><label for="crm-city">City</label><input id="crm-city" maxlength="80" autocomplete="address-level2"></div>
        <div class="crm-field"><label for="crm-contact">Contact name</label><input id="crm-contact" maxlength="120" autocomplete="name"></div>
        <div class="crm-field"><label for="crm-email">Email</label><input id="crm-email" maxlength="200" autocomplete="email" inputmode="email"></div>
        <div class="crm-field"><label for="crm-phone">Phone</label><input id="crm-phone" maxlength="40" autocomplete="tel" inputmode="tel"></div>
        <div class="crm-field"><label for="crm-website">Website</label><input id="crm-website" maxlength="500" autocomplete="url" inputmode="url" placeholder="https://"></div>
        <div class="crm-field"><label for="crm-source">Source</label><input id="crm-source" maxlength="120" placeholder="How you found them"></div>
        <div class="crm-field span"><label for="crm-audit">Audit findings</label><textarea id="crm-audit" maxlength="8000"></textarea></div>
        <div class="crm-field"><label for="crm-mockup">Mockup / preview link</label><input id="crm-mockup" maxlength="500" inputmode="url" placeholder="https://"></div>
        <div class="crm-field"><label for="crm-stage">Stage</label><select id="crm-stage">${stageOptions('Found')}</select></div>
        <div class="crm-field"><label for="crm-outreach">Outreach date</label><input id="crm-outreach" type="date"></div>
        <div class="crm-field"><label for="crm-followup">Next follow-up date</label><input id="crm-followup" type="date"></div>
        <div class="crm-field span"><label for="crm-note">Add a note</label><textarea id="crm-note" maxlength="4000" placeholder="What happened, and what is next"></textarea></div>
      </div>
      <div class="crm-log" id="crm-log"></div>
      <div class="crm-actions">
        <button class="crm-btn primary" type="submit">Save prospect</button>
        <button class="crm-btn" id="crm-cancel" type="button">Cancel</button>
        <button class="crm-btn" id="crm-delete" type="button">Delete</button>
      </div>
    </form>`;
    document.body.appendChild(modal);
    $('crm-add').onclick = () => openEditor('');
    $('crm-cancel').onclick = closeEditor;
    $('crm-delete').onclick = onDelete;
    $('crm-form').onsubmit = onSave;
    $('crm-refresh').onclick = () => load();
    $('crm-import-btn').onclick = () => $('crm-import').click();
    $('crm-import').onchange = onImport;
    $('crm-export-json').onclick = () => download('json');
    $('crm-export-csv').onclick = () => download('csv');
    ['crm-search', 'crm-stage-filter', 'crm-category-filter', 'crm-city-filter'].forEach(id => $(id).addEventListener('input', render));
    $('crm-stage-filter').addEventListener('change', render);
    $('crm-category-filter').addEventListener('change', render);
    $('crm-city-filter').addEventListener('change', render);
    modal.addEventListener('click', event => { if (event.target === modal) closeEditor(); });
    const board = $('crm-board');
    panel.querySelector('.crm').addEventListener('click', event => {
      const open = event.target.closest('[data-crm-open]');
      if (open) { openEditor(open.dataset.crmOpen); return; }
      if (event.target.closest('select, a, button, label')) return;
      const cardEl = event.target.closest('[data-crm-id]');
      if (cardEl) openEditor(cardEl.dataset.crmId);
    });
    board.addEventListener('change', event => {
      const select = event.target.closest('[data-crm-move]');
      if (select) moveProspect(select.dataset.crmMove, select.value);
    });
    board.addEventListener('dragstart', event => {
      const cardEl = event.target.closest('[data-crm-id]');
      if (!cardEl || event.target.closest('select, a, button, label')) { event.preventDefault(); return; }
      dragId = cardEl.dataset.crmId || '';
      event.dataTransfer.setData('text/plain', dragId);
      event.dataTransfer.effectAllowed = 'move';
      cardEl.classList.add('is-dragging');
    });
    board.addEventListener('dragend', () => {
      dragId = '';
      board.querySelectorAll('.is-dragging, .is-over').forEach(el => el.classList.remove('is-dragging', 'is-over'));
    });
    board.addEventListener('dragover', event => {
      const column = event.target.closest('[data-crm-column]');
      if (!column) return;
      event.preventDefault();
      board.querySelectorAll('.is-over').forEach(el => { if (el !== column) el.classList.remove('is-over'); });
      column.classList.add('is-over');
    });
    board.addEventListener('drop', event => {
      const column = event.target.closest('[data-crm-column]');
      if (!column) return;
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain') || dragId;
      column.classList.remove('is-over');
      if (id) moveProspect(id, column.dataset.crmColumn);
    });
    board.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.target.closest('select, a, button, textarea, input')) return;
      const cardEl = event.target.closest('[data-crm-id]');
      if (cardEl) openEditor(cardEl.dataset.crmId);
    });
    const more = $('crm-more');
    const syncMore = () => { if (more) more.open = window.innerWidth >= 801; };
    syncMore();
    window.addEventListener('resize', syncMore);
    render();
  }

  function boot() {
    if (window.__labCrmBooted) return;
    window.__labCrmBooted = true;
    const style = document.createElement('style');
    style.id = 'crm-style';
    style.textContent = CSS;
    document.head.appendChild(style);
    ensureShell();
    const previous = window.switchPanel;
    if (typeof previous === 'function') {
      window.switchPanel = function (id, btn) {
        const result = previous.apply(this, arguments);
        if (id === 'prospects') openBoard();
        else closeEditor();
        return result;
      };
    }
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEditor(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
