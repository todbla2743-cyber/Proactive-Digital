import { getDeployStore } from '@netlify/blobs';

export const siteOrigin = 'https://getproactivedigital.com';
export const sessionCookie = '__Host-pd_lab';
const sessionSeconds = 60 * 60;

function allowed(email) {
  const addresses = (Netlify.env.get('LAB_GOOGLE_ALLOWED_EMAILS') || '').split(',');
  return typeof email === 'string' && email.length > 0 && addresses.some(value => value.trim().toLowerCase() === email.toLowerCase());
}

export function isAllowedGoogleUser(user) {
  return Boolean(user?.id && user.confirmedAt && user.provider === 'google' && allowed(user.email));
}

function tokenFrom(request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.match(/(?:^|;\s*)__Host-pd_lab=([a-f0-9]{64})(?:;|$)/)?.[1];
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function storageKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return hex(new Uint8Array(digest));
}

export function firstParty(request) {
  return new URL(request.url).origin === siteOrigin && request.headers.get('Origin') === siteOrigin;
}

export function makeSessions(openStore = () => getDeployStore({ name: 'lab-sessions', consistency: 'strong' }), now = Date.now) {
  const cookie = (token, seconds) => `${sessionCookie}=${token}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
  return {
    async create(user) {
      if (!isAllowedGoogleUser(user)) return null;
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      await openStore().setJSON(await storageKey(token), { email: user.email.toLowerCase(), expires: now() + sessionSeconds * 1000 });
      return cookie(token, sessionSeconds);
    },
    async active(request) {
      const token = tokenFrom(request);
      if (!token || new URL(request.url).origin !== siteOrigin) return false;
      if (request.method !== 'GET' && request.method !== 'HEAD' && !firstParty(request)) return false;
      const entry = await openStore().get(await storageKey(token), { type: 'json' });
      return Boolean(entry && entry.expires > now() && allowed(entry.email));
    },
    async revoke(request) {
      const token = tokenFrom(request);
      if (token) await openStore().delete(await storageKey(token));
      return cookie('', 0);
    }
  };
}

export const labSessions = makeSessions();

export function privateResponse(response) {
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'private, no-store');
  result.headers.set('Netlify-CDN-Cache-Control', 'no-store');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  result.headers.set('X-Frame-Options', 'DENY');
  return result;
}
