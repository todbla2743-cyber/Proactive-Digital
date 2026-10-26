// Prospect records for the Lab CRM. No client data lives in this file.
export const STAGES = ['Found', 'Audited', 'Mockup Built', 'Outreach Sent', 'Follow-up Due', 'Replied', 'Won', 'Lost'];
export const CATEGORIES = ['restaurant/food', 'trades', 'other'];
export const CSV_COLUMNS = [
  ['businessName', 'business_name'],
  ['category', 'category'],
  ['city', 'city'],
  ['contactName', 'contact_name'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['website', 'website'],
  ['source', 'source'],
  ['auditFindings', 'audit_findings'],
  ['mockupLink', 'mockup_link'],
  ['outreachDate', 'outreach_date'],
  ['nextFollowUpDate', 'next_follow_up_date'],
  ['status', 'status'],
  ['notes', 'notes'],
  ['id', 'id']
];
export const PATCH_FIELDS = ['businessName', 'category', 'city', 'contactName', 'email', 'phone', 'website', 'source', 'auditFindings', 'mockupLink', 'outreachDate', 'nextFollowUpDate', 'status'];
const FIELD_ALIASES = new Map([
  ['businessname', 'businessName'], ['business_name', 'businessName'], ['business name', 'businessName'], ['business', 'businessName'], ['name', 'businessName'], ['company', 'businessName'],
  ['category', 'category'], ['niche', 'category'], ['type', 'category'],
  ['city', 'city'], ['town', 'city'],
  ['contactname', 'contactName'], ['contact_name', 'contactName'], ['contact name', 'contactName'], ['contact', 'contactName'],
  ['email', 'email'], ['e-mail', 'email'],
  ['phone', 'phone'], ['phone number', 'phone'], ['mobile', 'phone'],
  ['website', 'website'], ['url', 'website'], ['site', 'website'],
  ['source', 'source'],
  ['auditfindings', 'auditFindings'], ['audit_findings', 'auditFindings'], ['audit findings', 'auditFindings'], ['audit', 'auditFindings'], ['findings', 'auditFindings'], ['notes on site', 'auditFindings'],
  ['mockuplink', 'mockupLink'], ['mockup_link', 'mockupLink'], ['mockup link', 'mockupLink'], ['mockup', 'mockupLink'], ['preview', 'mockupLink'], ['preview link', 'mockupLink'],
  ['outreachdate', 'outreachDate'], ['outreach_date', 'outreachDate'], ['outreach date', 'outreachDate'],
  ['nextfollowupdate', 'nextFollowUpDate'], ['next_follow_up_date', 'nextFollowUpDate'], ['next follow-up date', 'nextFollowUpDate'], ['next follow up date', 'nextFollowUpDate'], ['follow-up date', 'nextFollowUpDate'], ['follow up date', 'nextFollowUpDate'], ['followup', 'nextFollowUpDate'],
  ['status', 'status'], ['stage', 'status'],
  ['notes', 'notes'], ['note', 'notes'], ['activity', 'activity'],
  ['id', 'id'],
  ['createdat', 'createdAt'], ['created_at', 'createdAt']
]);
const STATUS_ALIASES = new Map([
  ['found', 'Found'], ['new', 'Found'],
  ['audited', 'Audited'], ['audit', 'Audited'],
  ['mockup built', 'Mockup Built'], ['mockup', 'Mockup Built'],
  ['outreach sent', 'Outreach Sent'], ['outreach', 'Outreach Sent'], ['contacted', 'Outreach Sent'],
  ['follow-up due', 'Follow-up Due'], ['follow up due', 'Follow-up Due'], ['follow-up', 'Follow-up Due'], ['followup', 'Follow-up Due'],
  ['replied', 'Replied'], ['reply', 'Replied'],
  ['won', 'Won'], ['closed won', 'Won'],
  ['lost', 'Lost'], ['closed lost', 'Lost']
]);

export function addDays(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayInRichmond(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function isDue(prospect, today) {
  if (!prospect?.nextFollowUpDate || !today) return false;
  if (prospect.status === 'Won' || prospect.status === 'Lost') return false;
  return prospect.nextFollowUpDate <= today;
}

export function normalizeStatus(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return STATUS_ALIASES.get(key) || 'Found';
}

export function normalizeCategory(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (['restaurant/food', 'restaurant', 'food', 'cafe', 'catering'].includes(key)) return 'restaurant/food';
  if (['trades', 'trade', 'contractor', 'contractors'].includes(key)) return 'trades';
  return 'other';
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

export function cleanDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let year, month, day;
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw);
    if (!match) return '';
    month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
    if (year < 100) year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function cleanLink(value) {
  const raw = cleanText(value, 500);
  if (!raw) return '';
  if (/^(javascript|data|vbscript):/i.test(raw)) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`.slice(0, 500);
  return '';
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? String(value) : '';
}

function validIso(value) {
  const raw = String(value || '');
  const parsed = Date.parse(raw);
  if (!raw || Number.isNaN(parsed)) return '';
  return new Date(parsed).toISOString();
}

function cleanActivity(list, now) {
  if (!Array.isArray(list)) return [];
  const notes = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const text = cleanText(item.text || item.note || '', 4000);
    if (!text) continue;
    notes.push({ id: validUuid(item.id) || crypto.randomUUID(), at: validIso(item.at) || now, text });
    if (notes.length >= 100) break;
  }
  return notes;
}

function notesToActivity(notes, now) {
  const text = cleanText(notes, 20000);
  if (!text) return [];
  return text.split(/\s+\|\s+/).map(part => {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?\s+([\s\S]+)$/.exec(part.trim());
    if (!match) return { id: crypto.randomUUID(), at: now, text: cleanText(part, 4000) };
    const at = match[2] ? `${match[1]}T${match[2]}:00.000Z` : `${match[1]}T16:00:00.000Z`;
    return { id: crypto.randomUUID(), at, text: cleanText(match[3], 4000) };
  }).filter(item => item.text).slice(0, 100);
}

export function activityToNotes(activity) {
  return (activity || []).map(item => `${String(item.at || '').slice(0, 16).replace('T', ' ')} ${item.text}`.trim()).join(' | ');
}

export function finalizeProspect(input, { now, today, id, createdAt, activity } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const status = normalizeStatus(source.status);
  let outreachDate = cleanDate(source.outreachDate);
  let nextFollowUpDate = cleanDate(source.nextFollowUpDate);
  if (status === 'Outreach Sent' && !outreachDate) outreachDate = today || '';
  if (outreachDate && !nextFollowUpDate) nextFollowUpDate = addDays(outreachDate, 7);
  const storedActivity = activity !== undefined ? cleanActivity(activity, now) : (Array.isArray(source.activity) && source.activity.length ? cleanActivity(source.activity, now) : notesToActivity(source.notes, now));
  return {
    id: id || validUuid(source.id) || crypto.randomUUID(),
    businessName: cleanText(source.businessName, 160),
    category: normalizeCategory(source.category),
    city: cleanText(source.city, 80),
    contactName: cleanText(source.contactName, 120),
    email: cleanText(source.email, 200).replace(/\s/g, ''),
    phone: cleanText(source.phone, 40),
    website: cleanLink(source.website),
    source: cleanText(source.source, 120),
    auditFindings: cleanText(source.auditFindings, 8000),
    mockupLink: cleanLink(source.mockupLink),
    outreachDate,
    nextFollowUpDate,
    status,
    activity: storedActivity,
    createdAt: createdAt || validIso(source.createdAt) || now,
    updatedAt: now
  };
}

export function applyPatch(existing, patch, context) {
  const next = { ...existing };
  const source = patch && typeof patch === 'object' ? patch : {};
  for (const key of PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) next[key] = source[key];
  }
  return finalizeProspect(next, { ...context, id: existing.id, createdAt: existing.createdAt, activity: existing.activity });
}

export function appendNote(record, text, now) {
  const clean = cleanText(text, 4000);
  if (!clean) return record;
  return { ...record, updatedAt: now, activity: [...record.activity, { id: crypto.randomUUID(), at: now, text: clean }].slice(-100) };
}

function canonicalField(key) {
  const name = String(key || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (name === '__proto__' || name === 'constructor' || name === 'prototype') return '';
  return FIELD_ALIASES.get(name) || '';
}

function undoFormulaGuard(value) {
  const text = String(value ?? '');
  return /^'[=+\-@\t]/.test(text) ? text.slice(1) : text;
}

export function asImportItem(raw, { fromCsv = false } = {}) {
  const values = {};
  const present = new Set();
  const source = raw && typeof raw === 'object' ? raw : {};
  for (const key of Object.keys(source)) {
    const field = canonicalField(key);
    if (!field) continue;
    values[field] = fromCsv && typeof source[key] === 'string' ? undoFormulaGuard(source[key]) : source[key];
    present.add(field);
  }
  return { values, present };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (char !== '\r') cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(item => item.some(value => String(value).trim() !== ''));
}

export function parseCsvImport(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { error: 'The CSV needs a header row with a business name column.' };
  const header = rows[0].map(canonicalField);
  if (!header.includes('businessName')) return { error: 'The CSV needs a header row with a business name column.' };
  const items = rows.slice(1).map(row => {
    const values = {};
    const present = new Set();
    header.forEach((field, index) => {
      if (!field) return;
      values[field] = undoFormulaGuard(row[index] ?? '');
      present.add(field);
    });
    return { values, present };
  });
  return { items };
}

export function parseJsonImport(value) {
  let data = value;
  if (typeof value === 'string') {
    try { data = JSON.parse(value); } catch { return { error: 'Import file could not be read.' }; }
  }
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.prospects) ? data.prospects : null);
  if (!list) return { error: 'JSON should be a list of prospects, or an object with a prospects list.' };
  return { items: list.map(item => asImportItem(item)) };
}

function sameBusiness(left, right) {
  return left.businessName.trim().toLowerCase() === right.businessName.trim().toLowerCase() && left.city.trim().toLowerCase() === right.city.trim().toLowerCase();
}

export function importProspects(existing, items, { now, today, mode }) {
  const skipped = { count: 0 };
  const build = (item, id, createdAt, activity) => {
    const values = item.values || {};
    const record = finalizeProspect(values, {
      now,
      today,
      id: id || validUuid(values.id) || crypto.randomUUID(),
      createdAt: createdAt || validIso(values.createdAt) || now,
      activity
    });
    if (!record.businessName) { skipped.count += 1; return null; }
    return record;
  };
  if (mode === 'replace') {
    const prospects = [];
    for (const item of items) {
      const keepActivity = item.present?.has('activity') || item.present?.has('notes') ? undefined : [];
      const record = build(item, '', '', keepActivity);
      if (record) prospects.push(record);
    }
    return { prospects, imported: prospects.length, updated: 0, skipped: skipped.count };
  }
  const prospects = existing.map(item => ({ ...item, activity: [...(item.activity || [])] }));
  let imported = 0;
  let updated = 0;
  for (const item of items) {
    const id = validUuid(item.values?.id);
    let index = id ? prospects.findIndex(prospect => prospect.id === id) : -1;
    const draft = finalizeProspect(item.values || {}, { now, today, id: id || '00000000-0000-4000-8000-000000000000', activity: [] });
    if (index < 0 && draft.businessName) index = prospects.findIndex(prospect => sameBusiness(prospect, draft));
    if (index >= 0) {
      const previous = prospects[index];
      const overlay = { ...previous };
      for (const field of PATCH_FIELDS) {
        if (item.present?.has(field)) overlay[field] = item.values[field];
      }
      const activity = item.present?.has('activity') && Array.isArray(item.values.activity)
        ? item.values.activity
        : item.present?.has('notes')
          ? notesToActivity(item.values.notes, now)
          : previous.activity;
      const record = finalizeProspect(overlay, { now, today, id: previous.id, createdAt: previous.createdAt, activity });
      if (!record.businessName) { skipped.count += 1; continue; }
      prospects[index] = record;
      updated += 1;
    } else {
      const record = build(item);
      if (!record) continue;
      prospects.push(record);
      imported += 1;
    }
  }
  return { prospects, imported, updated, skipped: skipped.count };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function prospectsToCsv(prospects) {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',');
  const lines = prospects.map(prospect => CSV_COLUMNS.map(([key]) => csvCell(key === 'notes' ? activityToNotes(prospect.activity) : prospect[key])).join(','));
  return `\uFEFF${[header, ...lines].join('\n')}\n`;
}

export function prospectsToExport(prospects, exportedAt) {
  return { exportedAt, prospects: prospects.map(prospect => ({ ...prospect, activity: (prospect.activity || []).map(note => ({ ...note })) })) };
}
