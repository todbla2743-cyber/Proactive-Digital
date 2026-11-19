import { getUser } from '@netlify/identity';
import { firstParty, labSessions, privateResponse, siteOrigin } from '../lib/lab-session.mjs';

export function makeSessionHandler(readUser = getUser, sessions = labSessions) {
  return async function handle(request: Request) {
    const reply = (status: number, body: object, cookie?: string) => privateResponse(Response.json(body, {
      status, headers: cookie ? { 'Set-Cookie': cookie } : {},
    }));
    if (new URL(request.url).origin !== siteOrigin) return reply(403, { active: false });
    try {
      if (request.method === 'GET') return reply(200, { active: await sessions.active(request) });
      if (request.method !== 'POST') return reply(405, { active: false });
      if (!firstParty(request)) return reply(403, { active: false });
      const action = request.headers.get('X-Lab-Session');
      if (action === 'logout') return reply(200, { active: false }, await sessions.revoke(request));
      if (action !== 'google') return reply(400, { active: false });
      // The managed Identity SDK resolves the logged-in account with this site's Identity service.
      // A claims-only fallback lacks confirmedAt and is rejected by the session policy.
      const cookie = await sessions.create(await readUser());
      if (!cookie) return reply(403, { active: false });
      return reply(200, { active: true }, cookie);
    } catch {
      return reply(503, { active: false });
    }
  };
}

export default makeSessionHandler();
