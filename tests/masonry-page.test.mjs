import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
const canonical = 'https://getproactivedigital.com/masonry-contractor-websites';

test('published masonry page has one indexable canonical, accurate service schema and crawlable entry links', () => {
  const html = read('dist/masonry-contractor-websites.html');
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
  assert.ok(!/name="robots" content="[^"]*noindex/.test(html));
  assert.ok(!/CONCEPT PREVIEW|CONCEPT FORM|request-dialog|Preview my growth review request/.test(html));
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const service = graph.find(item => item['@type'] === 'Service');
  assert.equal(service.url, canonical);
  assert.equal(service.provider['@id'], 'https://getproactivedigital.com/#organization');
  assert.deepEqual(service.areaServed.map(area => area.name), ['Virginia', 'North Carolina', 'United States']);
  assert.ok(!graph.some(item => item['@type'] === 'MasonryBusiness' || item.aggregateRating));
  assert.ok(read('sitemap.xml').includes(`<loc>${canonical}</loc>`));
  for (const file of ['index.html', 'services.html']) assert.ok(read(file).includes('href="/masonry-contractor-websites"'), file);
  assert.match(read('dist/masonry-review-thanks.html'), /name="robots" content="noindex,follow"/);
});

test('form uses the registered contact field contract and ships its optimized assets', () => {
  const html = read('dist/masonry-contractor-websites.html');
  const form = html.match(/<form[^>]*id="review-form"[\s\S]*?<\/form>/)[0];
  assert.match(form, /name="proactive-contact"/);
  assert.match(form, /action="\/masonry-review-thanks"/);
  assert.match(form, /value="proactive-contact"/);
  const names = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*name="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(names, ['bot-field', 'business-name', 'email', 'first-name', 'form-name', 'last-name', 'message', 'package']);
  for (const match of html.matchAll(/(?:src|href)="(\/masonry(?:-assets\/[^\"]+|\.(?:css|js)))"/g)) {
    assert.ok(existsSync(new URL('dist' + match[1], root)), match[1]);
  }
  assert.ok(statSync(new URL('dist/masonry-assets/todd-masonry-hero-1280.webp', root)).size < 250000);
  assert.ok(html.includes('srcset='));
  assert.equal((html.match(/src="\/analytics.js"/g) || []).length, 1);
});

function formEnvironment(ok) {
  const values = { 'form-name': 'proactive-contact', 'bot-field': '', 'first-name': 'Jamie', 'last-name': 'Example', email: 'jamie@example.com', 'business-name': 'Example Masonry', package: 'Masonry — Better local visibility', message: 'Brick repair in Virginia. Please review my website.' };
  const button = { disabled: false, textContent: 'Request my free growth review' };
  const status = { textContent: '' };
  const success = { hidden: true, focused: false, focus() { this.focused = true; } };
  const form = { fields: values, dataset: {}, hidden: false, reportValidity: () => true, setAttribute() {}, removeAttribute() {}, addEventListener() {} };
  const requests = [], events = [];
  const context = vm.createContext({
    document: { getElementById(id) { return ({ 'review-form': form, 'review-submit': button, 'review-status': status, 'review-success': success })[id]; } },
    window: { pdAnalytics: { event(name) { events.push(name); } } },
    FormData: class extends Map { constructor(node) { super(Object.entries(node.fields)); } },
    URLSearchParams,
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok }; }
  });
  const source = read('masonry.js').split('// Growth review submission')[1];
  assert.ok(source, 'Production submission handler exists');
  vm.runInContext(source, context);
  return { context, form, button, status, success, requests, events };
}

test('accepted requests send encoded registered fields once and count a lead only after acceptance', async () => {
  const env = formEnvironment(true);
  const event = { preventDefault() {}, target: env.form };
  await env.context.submitGrowthReview(event);
  await env.context.submitGrowthReview(event);
  assert.equal(env.requests.length, 1);
  assert.equal(env.requests[0].url, '/');
  assert.equal(env.requests[0].method, 'POST');
  assert.equal(env.requests[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(env.requests[0].body);
  assert.equal(body.get('form-name'), 'proactive-contact');
  assert.equal(body.get('email'), 'jamie@example.com');
  assert.match(body.get('message'), /Masonry contractor websites/);
  assert.equal(env.form.hidden, true);
  assert.equal(env.success.hidden, false);
  assert.equal(env.success.focused, true);
  assert.deepEqual(env.events, ['generate_lead']);
});

test('failed requests preserve input, show an error and leave the form ready to retry', async () => {
  const env = formEnvironment(false);
  await env.context.submitGrowthReview({ preventDefault() {}, target: env.form });
  assert.equal(env.form.hidden, false);
  assert.equal(env.button.disabled, false);
  assert.equal(env.form.fields.email, 'jamie@example.com');
  assert.equal(env.success.hidden, true);
  assert.match(env.status.textContent, /could not be sent/);
  assert.equal(env.events.length, 0);
});
