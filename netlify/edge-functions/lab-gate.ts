import type { Context } from '@netlify/edge-functions';
import { labSessions, privateResponse, siteOrigin } from '../lib/lab-session.mjs';

const REALM = 'Proactive Digital Lab';
const USERNAME = 'todd';

async function validCode(header: string, expected: string) {
  if (!header.startsWith('Basic ') || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator <= 0 || decoded.slice(0, separator) !== USERNAME) return false;
    const code = decoded.slice(separator + 1).replace(/\s/g, '').toUpperCase();
    if (!code || code.length > 256) return false;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code)));
    let difference = 0;
    for (let i = 0; i < digest.length; i++) difference |= digest[i] ^ parseInt(expected.slice(i * 2, i * 2 + 2), 16);
    return difference === 0;
  } catch { return false; }
}

export default async function gate(request: Request, context: Context) {
  const url = new URL(request.url);
  const isPage = ['/lab', '/lab/', '/lab.html'].includes(url.pathname);
  const signInAvailable = Boolean(Netlify.env.get('LAB_GOOGLE_ALLOWED_EMAILS')) && url.origin === siteOrigin;
  const expected = Netlify.env.get('LAB_ACCESS_CODE_SHA256') || '';
  const header = request.headers.get('Authorization') || '';
  const protect = (response: Response) => {
    const result = privateResponse(response);
    result.headers.append('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'");
    return result;
  };
  if (await validCode(header, expected) || await labSessions.active(request)) return protect(await context.next());
  if (signInAvailable && isPage && !header && url.searchParams.get('access') !== 'code') {
    return protect(new Response(null, { status: 302, headers: { Location: '/lab-sign-in.html' } }));
  }
  if (!/^[a-f0-9]{64}$/i.test(expected) && !signInAvailable) {
    return protect(new Response('Lab access is not configured.', { status: 503 }));
  }
  return protect(new Response('Restricted area. Authentication required.', {
    status: 401, headers: { 'WWW-Authenticate': `Basic realm="${REALM}"`, 'Content-Type': 'text/plain; charset=utf-8' },
  }));
}

export const config = { path: ['/lab', '/lab/', '/lab.html', '/.netlify/functions/lab-crm'] };
