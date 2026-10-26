import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { makeHandler } from '../netlify/functions/lab-crm.mts';
import { addDays, importProspects, isDue, parseCsvImport, prospectsToCsv, todayInRichmond } from '../lab-crm-model.mjs';

const exec = promisify(execFile);
const HASH = createHash('sha256').update('TEST-CODE').digest('hex');
const NOW = () => new Date('2026-10-26T15:00:00.000Z');
globalThis.Netlify = { env: { get: key => key === 'LAB_ACCESS_CODE_SHA256' ? HASH : undefined } };
const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const auth = code => 'Basic ' + Buffer.from(`todd:${code}`).toString('base64');

function memory() {
  const buckets = new Map();
  const names = [];
  let opened = 0;
  return {
    names,
    opened: () => opened,
    dump(name) { return buckets.get(name); },
    factory(options) {
      opened += 1;
      names.push(options.name);
      assert.equal(options.consistency, 'strong');
      if (!buckets.has(options.name)) buckets.set(options.name, new Map());
      const bucket = buckets.get(options.name);
      return {
        get: async key => bucket.get(key) || null,
        setJSON: async (key, value) => { bucket.set(key, JSON.parse(JSON.stringify(value))); }
      };
    }
  };
}

function handler(store = memory(), context) {
  return {
    store,
    context,
    api: makeHandler(store.factory, { now: NOW })
  };
}

function call(api, { method = 'GET', body, code = 'TEST-CODE', headers = {}, url = 'https://lab.example/.netlify/functions/lab-crm', context } = {}) {
  const init = { method, headers: { ...(code === null ? {} : { authorization: auth(code) }), ...headers } };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    init.headers['content-type'] = 'application/json';
  }
  return api(new Request(url, init), context);
}

test('follow-up dates use the Richmond calendar and skip closed work', () => {
  assert.equal(addDays('2026-10-26', 7), '2026-11-02');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(todayInRichmond(new Date('2026-10-27T03:30:00.000Z')), '2026-10-26');
  assert.equal(todayInRichmond(new Date('2026-10-27T04:30:00.000Z')), '2026-10-27');
  assert.equal(isDue({ nextFollowUpDate: '2026-10-26', status: 'Found' }, '2026-10-26'), true);
  assert.equal(isDue({ nextFollowUpDate: '2026-10-20', status: 'Won' }, '2026-10-26'), false);
  assert.equal(isDue({ nextFollowUpDate: '', status: 'Found' }, '2026-10-26'), false);
});

test('unauthenticated and misconfigured requests never open storage', async () => {
  const locked = memory();
  const api = makeHandler(locked.factory, { now: NOW });
  const denied = await call(api, { code: null });
  assert.equal(denied.status, 401);
  assert.equal(await denied.text(), 'Restricted area. Authentication required.');
  assert.equal(denied.headers.get('www-authenticate'), 'Basic realm="Proactive Digital Lab"');
  assert.equal((await call(api, { code: 'wrong' })).status, 401);
  assert.equal((await call(api, { code: 'TEST-CODE', headers: { authorization: 'Basic ' + Buffer.from('ada:TEST-CODE').toString('base64') } })).status, 401);
  assert.equal((await call(api, { method: 'POST', body: { action: 'create', prospect: { businessName: 'Hidden' } }, code: null })).status, 401);
  const previous = globalThis.Netlify.env.get;
  globalThis.Netlify.env.get = () => '';
  const unconfigured = await call(api, {});
  assert.equal(unconfigured.status, 503);
  assert.equal(await unconfigured.text(), 'The Lab access code is not configured yet.');
  globalThis.Netlify.env.get = previous;
  assert.equal(locked.opened(), 0);
});

test('crm saves, defaults follow-up, and keeps preview data separate', async () => {
  const { api, store } = handler();
  const prod = { deploy: { context: 'production' } };
  const preview = { deploy: { context: 'deploy-preview' } };
  assert.equal((await call(api, { method: 'PUT', context: prod })).status, 405);
  assert.equal((await call(api, { headers: { origin: 'https://other.example' }, context: prod })).status, 403);
  let response = await call(api, {
    method: 'POST',
    context: prod,
    body: { action: 'create', baseUpdatedAt: '', prospect: { businessName: 'Example Bakery', category: 'food', city: 'Richmond', website: 'example.com', mockupLink: 'javascript:alert(1)', status: 'Outreach Sent', outreachDate: '2026-10-01' }, note: 'Left a message' }
  });
  assert.equal(response.status, 200);
  let payload = await response.json();
  assert.equal(payload.prospects.length, 1);
  assert.equal(payload.today, '2026-10-26');
  assert.equal(payload.prospects[0].category, 'restaurant/food');
  assert.equal(payload.prospects[0].website, 'https://example.com');
  assert.equal(payload.prospects[0].mockupLink, '');
  assert.equal(payload.prospects[0].outreachDate, '2026-10-01');
  assert.equal(payload.prospects[0].nextFollowUpDate, '2026-10-08');
  assert.equal(payload.prospects[0].due, true);
  assert.equal(payload.prospects[0].activity[0].text, 'Left a message');
  assert.equal(payload.prospects[0].activity[0].at, '2026-10-26T15:00:00.000Z');
  const stored = [...store.dump('prospect-crm-v1-production').values()][0];
  assert.equal(stored.prospects[0].due, undefined);
  const id = payload.prospects[0].id;
  response = await call(api, { method: 'POST', context: prod, body: { action: 'update', id, baseUpdatedAt: payload.updatedAt, patch: { status: 'Won', nextFollowUpDate: '2026-10-08' } } });
  payload = await response.json();
  assert.equal(payload.prospects[0].status, 'Won');
  assert.equal(payload.prospects[0].due, false);
  const stale = await call(api, { method: 'POST', context: prod, body: { action: 'delete', id, baseUpdatedAt: 'stale' } });
  assert.equal(stale.status, 409);
  assert.equal((await (await call(api, { context: prod })).json()).prospects.length, 1);
  const draft = await call(api, { context: preview });
  assert.deepEqual((await draft.json()).prospects, []);
  assert.ok(store.names.includes('prospect-crm-v1-preview'));
  const removed = await call(api, { method: 'POST', context: prod, body: { action: 'delete', id, baseUpdatedAt: payload.updatedAt } });
  assert.equal((await removed.json()).prospects.length, 0);
});

test('json and csv import round trip without wiping the board on a bad file', async () => {
  const { api } = handler();
  const context = { deploy: { context: 'production' } };
  let payload = await (await call(api, {
    method: 'POST', context, body: {
      action: 'import', format: 'csv', mode: 'merge', baseUpdatedAt: '', text:
        'Business Name,Category,City,Phone,Status,Notes\n"=Example, Bakery",trades,Richmond,804-555-0100,Found,2026-10-20 15:00 First visit\n,other,Richmond,,Found,\n'
    }
  })).json();
  assert.equal(payload.imported, 1);
  assert.equal(payload.skipped, 1);
  assert.equal(payload.prospects[0].businessName, '=Example, Bakery');
  assert.equal(payload.prospects[0].category, 'trades');
  assert.equal(payload.prospects[0].activity[0].text, 'First visit');
  const exported = await call(api, { url: 'https://lab.example/.netlify/functions/lab-crm?format=csv', context });
  assert.match(exported.headers.get('content-type'), /text\/csv/);
  const csv = await exported.text();
  assert.match(csv, /'=Example, Bakery/);
  const again = parseCsvImport(csv);
  assert.equal(again.items[0].values.business_name || again.items[0].values.businessName, '=Example, Bakery');
  const empty = await call(api, { method: 'POST', context, body: { action: 'import', format: 'csv', mode: 'replace', baseUpdatedAt: payload.updatedAt, text: 'business_name\n' } });
  assert.equal(empty.status, 400);
  assert.equal((await (await call(api, { context })).json()).prospects.length, 1);
  const file = await call(api, { url: 'https://lab.example/.netlify/functions/lab-crm?format=json', context });
  const json = JSON.parse(await file.text());
  payload = await (await call(api, { method: 'POST', context, body: { action: 'import', format: 'json', mode: 'merge', baseUpdatedAt: (await (await call(api, { context })).json()).updatedAt, text: JSON.stringify({ prospects: [{ ...json.prospects[0], city: 'Henrico', phone: '804-555-0199' }, { businessName: 'Example Plumbing', category: 'contractor', city: 'Chesterfield', status: 'Mockup Built' }] }) } })).json();
  assert.equal(payload.updated, 1);
  assert.equal(payload.imported, 1);
  assert.equal(payload.prospects.length, 2);
  assert.equal(payload.prospects.find(item => item.businessName.includes('Bakery')).city, 'Henrico');
  const replaced = await (await call(api, { method: 'POST', context, body: { action: 'import', format: 'json', mode: 'replace', baseUpdatedAt: payload.updatedAt, prospects: [{ businessName: 'Example Market', category: 'other', city: 'Midlothian', status: 'Lost', nextFollowUpDate: '2026-10-01' }] } })).json();
  assert.equal(replaced.prospects.length, 1);
  assert.equal(replaced.prospects[0].due, false);
  assert.equal(replaced.prospects[0].status, 'Lost');
});

test('storage failures stay generic and oversized imports are refused', async () => {
  const failing = makeHandler(() => ({ get: async () => { throw new Error('secret blob path'); }, setJSON: async () => { throw new Error('secret blob path'); } }), { now: NOW });
  const result = await call(failing, {});
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.includes('secret'), false);
  const { api } = handler();
  const huge = await call(api, { method: 'POST', body: { action: 'import', format: 'json', text: ' '.repeat(4_000_001) } });
  assert.equal(huge.status, 413);
  const limited = makeHandler(memory().factory, { now: NOW, maxProspects: 1 });
  const first = await call(limited, { method: 'POST', body: { action: 'create', baseUpdatedAt: '', prospect: { businessName: 'Example One' } } });
  assert.equal(first.status, 200);
  const second = await call(limited, { method: 'POST', body: { action: 'create', baseUpdatedAt: (await first.json()).updatedAt, prospect: { businessName: 'Example Two' } } });
  // first.json() was already consumed above if we call it twice. Re-read carefully in the assertion below.
  assert.equal(second.status, 400);
});

test('model csv guards formulas and merges on business plus city', () => {
  const now = '2026-10-26T15:00:00.000Z';
  const today = '2026-10-26';
  const existing = importProspects([], parseCsvImport('business_name,city,status\nExample Bakery,Richmond,Found\n').items, { now, today, mode: 'merge' });
  const merged = importProspects(existing.prospects, parseCsvImport('business_name,city,phone\nExample Bakery,Richmond,804-555-0100\n').items, { now, today, mode: 'merge' });
  assert.equal(merged.prospects.length, 1);
  assert.equal(merged.updated, 1);
  assert.equal(merged.prospects[0].phone, '804-555-0100');
  assert.equal(merged.prospects[0].status, 'Found');
  const csv = prospectsToCsv([{ ...merged.prospects[0], businessName: '=cmd', activity: [] }]);
  assert.match(csv, /'=cmd/);
  assert.equal(isDue(merged.prospects[0], today), false);
});

test('lab page, gate, and preview publish keep the crm behind the same auth', async () => {
  const html = await read('lab.html');
  const gate = await read('netlify/edge-functions/lab-gate.ts');
  const client = await read('lab-crm.js');
  const build = await read('scripts/build-public.sh');
  assert.match(html, /id="crm-tab"/);
  assert.match(html, /id="panel-prospects"/);
  assert.match(html, /src="\/lab-crm\.js\?/);
  assert.doesNotMatch(html, /\/\.netlify\/functions\/lab-crm/);
  assert.match(gate, /\/\.netlify\/functions\/lab-crm/);
  assert.match(gate, /Restricted area\. Authentication required\./);
  assert.match(client, /\/\.netlify\/functions\/lab-crm/);
  for (const stage of ['Found', 'Audited', 'Mockup Built', 'Outreach Sent', 'Follow-up Due', 'Replied', 'Won', 'Lost']) assert.ok(client.includes(stage), stage);
  assert.doesNotMatch(build, /cp "\$publish_dir\/lab-review\.html"/);
  for (const file of ['lab-crm.js', 'lab-crm-model.mjs', 'netlify/functions/lab-crm.mts', 'netlify/edge-functions/lab-gate.ts', 'README.md']) {
    const source = await read(file);
    assert.equal(source.includes('\u2014'), false, file);
    assert.equal(source.includes('\u2013'), false, file);
  }
  const dir = await mkdtemp(join(tmpdir(), 'lab-crm-build-'));
  try {
    await exec('bash', ['scripts/build-public.sh', dir], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, CONTEXT: 'deploy-preview' } });
    const published = await readFile(join(dir, 'lab.html'), 'utf8');
    assert.match(published, /id="panel-prospects"/);
    assert.doesNotMatch(published, /SYNTHETIC DATA/);
    assert.match(await readFile(join(dir, 'lab-review.html'), 'utf8'), /SYNTHETIC DATA/);
    assert.match(await readFile(join(dir, 'lab-crm.js'), 'utf8'), /Outreach pipeline/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
