import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import gate from '../netlify/edge-functions/lab-gate.ts';
import { labSessions, makeSessions, siteOrigin } from '../netlify/lib/lab-session.mjs';
import { makeSessionHandler } from '../netlify/functions/lab-session.mts';
import ai from '../netlify/functions/lab-ai.mts';
import { makeHandler as makeStore } from '../netlify/functions/lab-store.mts';
import { makeHandler as makeCrm } from '../netlify/functions/lab-crm.mts';

const allowed = ['owner@example.test', 'office@company.test'];
const env = { LAB_GOOGLE_ALLOWED_EMAILS: allowed.join(','), OPENAI_API_KEY: 'fixture' };
globalThis.Netlify = { env: { get: key => env[key] } };
const user = email => ({ id: 'fixture-user', confirmedAt: '2026-01-01T00:00:00Z', email, provider: 'google' });
const request = (path, options) => new Request(siteOrigin + path, options);
const authOptions = action => ({ method: 'POST', headers: { Origin: siteOrigin, 'X-Lab-Session': action } });
function bucket() {
  const records = new Map();
  return { records, get: async key => records.get(key) || null, setJSON: async (key, value) => records.set(key, value), delete: async key => records.delete(key) };
}

test('only the two verified Google identities receive a revocable, first-party session', async () => {
  const store = bucket();
  let now = Date.now();
  const sessions = makeSessions(() => store, () => now);
  for (const email of allowed) {
    const handle = makeSessionHandler(async () => user(email.toUpperCase()), sessions);
    const response = await handle(request('/.netlify/functions/lab-session', authOptions('google')));
    assert.equal(response.status, 200);
    const cookie = response.headers.get('Set-Cookie');
    for (const flag of ['HttpOnly', 'Secure', 'Path=/', 'SameSite=Lax', 'Max-Age=3600']) assert(cookie.includes(flag));
    const pair = cookie.split(';')[0];
    assert(!store.records.has(pair.split('=')[1]));
    assert.equal(await sessions.active(request('/lab.html', { headers: { Cookie: pair } })), true);
    const options = authOptions('logout'); options.headers.Cookie = pair;
    assert.equal((await handle(request('/.netlify/functions/lab-session', options))).status, 200);
    assert.equal(await sessions.active(request('/lab.html', { headers: { Cookie: pair } })), false);
  }
  for (const identity of [null, user('another@company.test'), user('owner+other@example.test'), { ...user(allowed[0]), confirmedAt: undefined }, { ...user(allowed[0]), provider: 'email' }, { ...user(allowed[0]), email: 'another@company.test', userMetadata: { email: allowed[0] } }]) {
    const denied = await makeSessionHandler(async () => identity, sessions)(request('/.netlify/functions/lab-session', authOptions('google')));
    assert.equal(denied.status, 403); assert.equal(denied.headers.has('Set-Cookie'), false);
  }
  const cookie = (await sessions.create(user(allowed[1]))).split(';')[0];
  const read = request('/lab.html', { headers: { Cookie: cookie } });
  try { env.LAB_GOOGLE_ALLOWED_EMAILS = allowed[0]; assert.equal(await sessions.active(read), false); }
  finally { env.LAB_GOOGLE_ALLOWED_EMAILS = allowed.join(','); }
  assert.equal(await sessions.active(new Request('https://preview.example.test/lab.html', { headers: { Cookie: cookie } })), false);
  now += 3600 * 1000; assert.equal(await sessions.active(read), false);
});

test('the same session controls the page, AI, workspace and prospect data', async () => {
  const sessions = makeSessions(bucketFactory());
  const saved = labSessions.active;
  labSessions.active = sessions.active;
  const data = bucket();
  const store = makeStore(() => data);
  const crm = makeCrm(() => data);
  const upstream = { next: async () => new Response('fixture workspace') };
  try {
    for (const email of allowed) {
      const pair = (await sessions.create(user(email))).split(';')[0];
      const headers = { Cookie: pair, Origin: siteOrigin, 'Content-Type': 'application/json' };
      const post = action => ({ method: 'POST', headers, body: JSON.stringify({ action }) });
      for (const path of ['/lab', '/lab/', '/lab.html']) assert.equal(await (await gate(request(path, { headers }), upstream)).text(), 'fixture workspace');
      assert.equal((await ai(request('/.netlify/functions/lab-ai', post('authenticate')))).status, 200);
      assert.equal((await store(request('/.netlify/functions/lab-store', post('load')))).status, 200);
      assert.equal((await crm(request('/.netlify/functions/lab-crm', { headers }))).status, 200);
      const foreign = { method: 'POST', headers: { ...headers, Origin: 'https://other.example.test' }, body: '{}' };
      assert.equal((await store(request('/.netlify/functions/lab-store', foreign))).status, 403);
      assert.equal(await sessions.active(request('/.netlify/functions/lab-store', { method: 'POST', headers: { Cookie: pair } })), false);
    }
    const signedOut = await gate(request('/lab.html'), upstream);
    assert.equal(signedOut.status, 302); assert.equal(signedOut.headers.get('location'), '/lab-sign-in.html');
    assert.equal(signedOut.headers.get('cache-control'), 'private, no-store');
    const codeRoute = await gate(request('/lab.html?access=code'), upstream);
    assert.equal(codeRoute.status, 401); assert.match(codeRoute.headers.get('www-authenticate'), /^Basic /);
    assert.equal((await crm(request('/.netlify/functions/lab-crm'))).status, 401);
    const denied = await makeSessionHandler(async () => user(allowed[0]), sessions)(request('/.netlify/functions/lab-session', { method: 'POST', headers: { 'X-Lab-Session': 'google' } }));
    assert.equal(denied.status, 403);
  } finally { labSessions.active = saved; }
});

function bucketFactory() { const store = bucket(); return () => store; }

test('Google callback clears provider credentials before navigation and accepts invited accounts through Google', async () => {
  const source = (await readFile(new URL('../lab-auth/sign-in.mjs', import.meta.url), 'utf8')).replace(/^import .*?;$/gm, '');
  const actions = [], stored = new Map(), button = { addEventListener: (_, fn) => { button.click = fn; } }, status = {};
  const location = { pathname: '/lab-sign-in.html', origin: siteOrigin, hash: '#invite_token=fixture', assign: target => actions.push(target), replace: target => actions.push(target) };
  const runtime = {
    location, sessionStorage: { setItem: (k,v) => stored.set(k,v), getItem: k => stored.get(k), removeItem: k => stored.delete(k) },
    history: { replaceState: () => {} }, localStorage: { removeItem: () => actions.push('clear') },
    document: { getElementById: id => id === 'google' ? button : status },
    URLSearchParams, Date, getSettings: async () => ({providers: { google: true }}), logout: async () => actions.push('logout'),
    GoTrue: class { acceptInviteExternalUrl(provider, token) { return `${provider}/${token}`; } },
    fetch: async () => ({ ok: true, json: async () => ({ active: true }) }),
    handleAuthCallback: async () => location.hash.includes('invite') ? {type:'invite',token:'fixture'} : {type:'oauth'},
  };
  vm.runInNewContext(source, { ...runtime }); await new Promise(setImmediate); button.click();
  assert.equal(actions.at(-1), 'google/fixture');
  location.hash = '#access_token=fixture';
  vm.runInNewContext(source, { ...runtime }); await new Promise(setImmediate);
  assert.deepEqual(actions.slice(-3), ['logout', 'clear', '/lab.html']);
});
