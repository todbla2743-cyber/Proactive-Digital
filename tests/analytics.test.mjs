import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
const source = readFileSync(new URL('../analytics.js', import.meta.url), 'utf8');
function setup({ host = 'getproactivedigital.com', path = '/', saved = null, brokenStorage = false } = {}) {
  const listeners = {}, appended = [], buttons = [];
  function element(tag) {
    const e = { tag, style: {}, dataset: {}, addEventListener(name, fn) { this[name] = fn; }, setAttribute() {}, focus() {}, append(...nodes) { appended.push(...nodes); } };
    if (tag === 'section') {
      for (const choice of ['denied', 'granted']) { const button = element('button'); button.dataset.choice = choice; buttons.push(button); }
      e.querySelectorAll = () => buttons;
      e.querySelector = () => buttons[0];
    }
    return e;
  }
  const document = { readyState: 'complete', cookie: '', referrer: 'https://example.org/path?email=secret#private', createElement: element, head: element('head'), body: element('body'), querySelector: () => null, addEventListener(name, fn) { listeners[name] = fn; } };
  const window = { addEventListener(name, fn) { listeners[name] = fn; } };
  const context = vm.createContext({ window, document, location: { hostname: host, pathname: path, href: `https://${host}${path}?email=secret#private` }, URL, localStorage: { getItem() { if (brokenStorage) throw Error(); return saved; }, setItem(_, v) { if (brokenStorage) throw Error(); saved = v; } } });
  vm.runInContext(source, context);
  return { window, document, listeners, appended, context, choose(value) { buttons.find(b => b.dataset.choice === value).click(); }, calls() { return (window.dataLayer || []).map(args => Array.from(args)); } };
}
test('consent gates loading; one page view; no query or fragment leakage', () => {
  const env = setup();
  assert.equal(env.appended.filter(e => e.tag === 'script').length, 0);
  env.choose('denied');
  assert.equal(env.calls().length, 0);
  env.choose('granted'); env.choose('granted');
  assert.equal(env.appended.filter(e => e.tag === 'script').length, 1);
  const configs = env.calls().filter(c => c[0] === 'config');
  assert.equal(configs.length, 1);
  assert.equal(configs[0][1], 'G-9CCVCZ1VN4');
  assert.equal(configs[0][2].page_location, 'https://getproactivedigital.com/');
  assert.equal(configs[0][2].page_referrer, 'https://example.org/path');
  assert.equal(configs[0][2].allow_google_signals, false);
  env.window.pdAnalytics.event('generate_lead', { email: 'secret' });
  assert.equal(JSON.stringify(env.calls()).includes('secret'), false);
  env.choose('denied');
  const count = env.calls().length;
  env.window.pdAnalytics.event('generate_lead');
  assert.equal(env.calls().length, count);
  assert.equal(env.window['ga-disable-G-9CCVCZ1VN4'], true);
});
test('previews, private Lab, and blocked storage remain safe', () => {
  const preview = setup({ host: 'deploy-preview--bigproactivedigital.netlify.app', saved: 'granted' });
  assert.equal(preview.calls().length, 0);
  assert.equal(setup({ path: '/lab.html', saved: 'granted' }).window.pdAnalytics, undefined);
  const blocked = setup({ brokenStorage: true });
  blocked.choose('granted');
  assert.equal(blocked.appended.filter(e => e.tag === 'script').length, 1);
  blocked.listeners.storage({ key: 'pd-analytics-consent-v1', newValue: 'denied' });
  assert.equal(blocked.window['ga-disable-G-9CCVCZ1VN4'], true);
});
test('only accepted contact submissions count; analytics errors do not break success', async () => {
  const code = readFileSync(new URL('../site-navigation.js', import.meta.url), 'utf8').split('async function submitForm')[1];
  for (const ok of [false, true]) {
    let count = 0;
    const button = { textContent: 'Send' }, status = {}, success = { style: {}, focus() {} };
    const form = { style: {}, reportValidity: () => true, querySelector: () => button };
    const ctx = vm.createContext({ window: { pdAnalytics: { event() { count++; throw Error('Analytics blocked'); } } }, document: { getElementById: id => id === 'form-status' ? status : success }, fetch: async () => ({ ok }), FormData: class {}, URLSearchParams: class { toString() { return ''; } } });
    vm.runInContext('async function submitForm' + code, ctx);
    await ctx.submitForm({ preventDefault() {}, target: form });
    assert.equal(count, ok ? 1 : 0);
    if (ok) assert.equal(success.style.display, 'block');
    else assert.match(status.textContent, /could not be sent/);
  }
});
test('public build includes tracking once and excludes Lab and verification files', () => {
  for (const file of readdirSync(new URL('../dist/', import.meta.url)).filter(f => f.endsWith('.html'))) {
    const html = readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
    assert.equal((html.match(/src="\/analytics.js"/g) || []).length, /^(lab|google)/.test(file) ? 0 : 1, file);
  }
});
