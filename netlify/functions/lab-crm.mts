import { createHash, timingSafeEqual } from 'node:crypto';
import { getStore } from '@netlify/blobs';
import {
  appendNote, applyPatch, finalizeProspect, importProspects, isDue, parseCsvImport, parseJsonImport,
  prospectsToCsv, prospectsToExport, todayInRichmond
} from '../../lab-crm-model.mjs';

declare const Netlify: { env: { get(name: string): string | undefined } };

const REALM = 'Proactive Digital Lab';
const USERNAME = 'todd';
const MAX_BYTES = 4_000_000;
const MAX_PROSPECTS = 5000;

const json = (status: number, data: unknown) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

const text = (status: number, body: string, extra?: Record<string, string>) => new Response(body, {
  status,
  headers: { 'content-type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }
});

export function labAuthorized(authorization: string, expectedHash: string) {
  if (!authorization.startsWith('Basic ') || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  let decoded = '';
  try { decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const separator = decoded.indexOf(':');
  if (separator <= 0 || decoded.slice(0, separator) !== USERNAME) return false;
  const code = decoded.slice(separator + 1).replace(/\s/g, '').toUpperCase();
  if (!code || code.length > 256) return false;
  const actual = createHash('sha256').update(code).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function withDue(prospects: Array<Record<string, unknown>>, today: string) {
  return prospects.map(prospect => ({ ...prospect, due: isDue(prospect, today) }));
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

type Store = {
  get(key: string, options?: { type?: string }): Promise<unknown>;
  setJSON(key: string, value: unknown): Promise<unknown>;
};

async function readDoc(store: Store) {
  const raw = await store.get('prospects', { type: 'json' }) as { prospects?: unknown; updatedAt?: unknown } | null;
  const prospects = Array.isArray(raw?.prospects) ? raw.prospects as Array<Record<string, unknown>> : [];
  return { prospects, updatedAt: raw?.updatedAt ? String(raw.updatedAt) : '' };
}

export function makeHandler(openStore: typeof getStore = getStore, options: { now?: () => Date; maxProspects?: number } = {}) {
  const nowFn = options.now || (() => new Date());
  const maxProspects = options.maxProspects || MAX_PROSPECTS;
  return async (req: Request, context?: { deploy?: { context?: string } }) => {
    const expected = Netlify.env.get('LAB_ACCESS_CODE_SHA256') || '';
    if (!/^[a-f0-9]{64}$/i.test(expected)) return text(503, 'The Lab access code is not configured yet.');
    if (!labAuthorized(req.headers.get('authorization') || '', expected)) {
      return text(401, 'Restricted area. Authentication required.', { 'WWW-Authenticate': `Basic realm="${REALM}"` });
    }
    const origin = req.headers.get('origin');
    let requestOrigin = '';
    try { requestOrigin = new URL(req.url).origin; } catch { return json(400, { error: 'Invalid request.' }); }
    if (origin && origin !== requestOrigin) return json(403, { error: 'Use the Lab on this website.' });
    if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'Method not allowed.' });

    const nowDate = nowFn();
    const now = nowDate.toISOString();
    const today = todayInRichmond(nowDate);
    const environment = context?.deploy?.context === 'production' ? 'production' : 'preview';
    try {
      const store = openStore({ name: `prospect-crm-v1-${environment}`, consistency: 'strong' }) as unknown as Store;
      const doc = await readDoc(store);
      const finish = (prospects: Array<Record<string, unknown>>, updatedAt: string, extra: Record<string, unknown> = {}) => json(200, {
        ok: true, today, updatedAt, prospects: withDue(prospects, today), ...extra
      });
      if (req.method === 'GET') {
        const format = new URL(req.url).searchParams.get('format');
        if (format === 'csv') {
          const filename = `prospects-${today}.csv`;
          return new Response(prospectsToCsv(doc.prospects as never), {
            status: 200,
            headers: {
              'content-type': 'text/csv; charset=utf-8',
              'content-disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'no-store'
            }
          });
        }
        if (format === 'json') {
          const filename = `prospects-${today}.json`;
          return new Response(JSON.stringify(prospectsToExport(doc.prospects as never, now), null, 2), {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'no-store'
            }
          });
        }
        return finish(doc.prospects, doc.updatedAt);
      }

      const raw = await req.text();
      if (Buffer.byteLength(raw) > MAX_BYTES) return json(413, { error: 'That file is too large.' });
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return json(400, { error: 'Invalid request.' }); }
      if (!plainObject(body) || !['create', 'update', 'delete', 'import'].includes(String(body.action))) return json(400, { error: 'Invalid action.' });
      if (String(body.baseUpdatedAt || '') !== doc.updatedAt) {
        return json(409, { error: 'This board changed on another device. Reload to see the latest copy.', today, updatedAt: doc.updatedAt, prospects: withDue(doc.prospects, today) });
      }

      let prospects = doc.prospects.map(prospect => ({ ...prospect, activity: Array.isArray(prospect.activity) ? [...prospect.activity] : [] }));
      const extra: Record<string, unknown> = {};
      if (body.action === 'delete') {
        const id = String(body.id || '');
        const index = prospects.findIndex(prospect => prospect.id === id);
        if (index < 0) return json(404, { error: 'That prospect is not on the board anymore.' });
        prospects.splice(index, 1);
      } else if (body.action === 'create') {
        if (!plainObject(body.prospect)) return json(400, { error: 'Invalid request.' });
        let record = finalizeProspect(body.prospect, { now, today });
        if (!record.businessName) return json(400, { error: 'Business name is required.' });
        record = appendNote(record, typeof body.note === 'string' ? body.note : '', now);
        prospects.push(record as unknown as Record<string, unknown>);
      } else if (body.action === 'update') {
        const id = String(body.id || '');
        const index = prospects.findIndex(prospect => prospect.id === id);
        if (!id || index < 0) return json(404, { error: 'That prospect is not on the board anymore.' });
        if (body.patch !== undefined && !plainObject(body.patch)) return json(400, { error: 'Invalid request.' });
        let record = applyPatch(prospects[index] as never, (body.patch || {}) as never, { now, today });
        if (!record.businessName) return json(400, { error: 'Business name is required.' });
        record = appendNote(record, typeof body.note === 'string' ? body.note : '', now);
        prospects[index] = record as unknown as Record<string, unknown>;
      } else {
        const format = body.format === 'csv' ? 'csv' : 'json';
        const parsed = format === 'csv' ? parseCsvImport(String(body.text || '')) : (Array.isArray(body.prospects) ? parseJsonImport(body.prospects) : parseJsonImport(String(body.text || '')));
        if (parsed.error) return json(400, { error: parsed.error });
        const mode = body.mode === 'replace' ? 'replace' : 'merge';
        const result = importProspects(prospects as never, parsed.items || [], { now, today, mode });
        if (!result.imported && !result.updated) return json(400, { error: 'No prospects with a business name were found.' });
        prospects = result.prospects as unknown as Array<Record<string, unknown>>;
        extra.imported = result.imported;
        extra.updated = result.updated;
        extra.skipped = result.skipped;
      }
      if (prospects.length > maxProspects) return json(400, { error: 'That import is larger than the board can store.' });
      const updatedAt = now;
      await store.setJSON('prospects', { prospects, updatedAt });
      return finish(prospects, updatedAt, extra);
    } catch {
      return json(503, { error: 'Cloud storage is unavailable. Try again in a moment.' });
    }
  };
}

export default makeHandler();
export const config = { rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
