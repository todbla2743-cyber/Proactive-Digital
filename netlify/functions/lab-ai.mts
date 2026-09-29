import { createHash, timingSafeEqual } from 'node:crypto';

declare const Netlify: { env: { get(name: string): string | undefined } };

function settings() {
  const key = Netlify.env.get('OPENAI_API_KEY');
  const base = (Netlify.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/+$/, '');
  return {
    key, base: base.endsWith('/v1') ? base : `${base}/v1`,
    model: Netlify.env.get('LAB_OPENAI_MODEL') || 'gpt-6.1-sol',
    fast: Netlify.env.get('LAB_OPENAI_FAST_MODEL') || 'gpt-6-luna',
    accessHash: Netlify.env.get('LAB_ACCESS_CODE_SHA256') || '',
  };
}
function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function error(status: number, message: string) { return json(status, { error: { message } }); }
function authorized(req: Request, expected: string) {
  const code = req.headers.get('X-Lab-Access-Code');
  if (!code || code.length > 256 || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  const actual = createHash('sha256').update(code.replace(/\s/g, '').toUpperCase()).digest();
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
function convertMessages(messages: any[]) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 100) throw new Error('Please start a new chat or provide a message.');
  return messages.map(message => {
    if (!['user', 'assistant'].includes(message?.role)) throw new Error('Unsupported message role.');
    if (typeof message.content === 'string') return { role: message.role, content: message.content };
    if (!Array.isArray(message.content)) throw new Error('Invalid message content.');
    if (message.role === 'assistant') return { role: 'assistant', content: message.content.map((p: any) => p.text || '').join('\n') };
    const content = message.content.map((part: any) => {
      if (part?.type === 'text' && typeof part.text === 'string') return { type: 'input_text', text: part.text };
      const source = part?.source;
      if (source?.type !== 'base64' || typeof source.data !== 'string' || !/^[A-Za-z0-9+/=\r\n]+$/.test(source.data)) throw new Error('Unsupported attachment. Please use an image, PDF, or text file.');
      if (part.type === 'image' && /^image\/(png|jpeg|webp|gif)$/.test(source.media_type)) {
        return { type: 'input_image', image_url: `data:${source.media_type};base64,${source.data}` };
      }
      if (part.type === 'document' && source.media_type === 'application/pdf') {
        return { type: 'input_file', filename: String(part.filename || 'attachment.pdf').slice(0, 200), file_data: `data:application/pdf;base64,${source.data}` };
      }
      throw new Error('Unsupported attachment. Please use PNG, JPEG, WebP, GIF, or PDF.');
    });
    return { role: 'user', content };
  });
}
function providerError(status: number, code?: string) {
  if (status === 401) return 'OpenAI credentials were rejected. Update the server API key in Netlify.';
  if (status === 403 || status === 404) return 'This model is not available to the configured API account. Check model access in your provider dashboard.';
  if (status === 429 && code === 'insufficient_quota') return 'The API account needs available credits. Check OpenAI billing or Netlify AI Gateway usage.';
  if (status === 429) return 'The AI service is busy or its usage limit has been reached. Please try again shortly.';
  if (status === 400) return 'The AI provider could not process this request. Try a shorter message or smaller attachment.';
  return 'The AI provider is temporarily unavailable. Please try again.';
}
export default async function handler(req: Request) {
  const cfg = settings();
  if (req.method === 'GET') {
    return json(200, { provider: 'OpenAI', model: cfg.model, fast_model: cfg.fast, configured: Boolean(cfg.key), access_configured: Boolean(cfg.accessHash), version: '2026-09-29.1' });
  }
  if (req.method !== 'POST') return error(405, 'Method not allowed.');
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) return error(403, 'Please use The Lab on this website.');
  if (!cfg.accessHash) return error(503, 'Lab access is not configured on the server.');
  if (!authorized(req, cfg.accessHash)) return error(401, 'Please sign in with your Lab access code.');
  let body: any;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 4_000_000) return error(413, 'This upload is too large. Please use a smaller attachment (under 2 MB).');
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'Invalid request.');
  } catch { return error(400, 'Invalid JSON request.'); }
  if (body.action === 'authenticate') return json(200, { ok: true });
  if (!cfg.key) return error(503, 'AI credentials are not available. Configure OpenAI or enable Netlify AI Gateway.');
  // Requests choose a workload tier, never an arbitrary billable model.
  const model = ['fast', 'gpt-5-mini', cfg.fast].includes(body.model) ? cfg.fast : cfg.model;
  let input;
  try { input = convertMessages(body.messages); }
  catch (e) { return error(400, (e as Error).message); }
  const requestedTokens = Number(body.max_tokens || 2048);
  if (!Number.isFinite(requestedTokens) || requestedTokens <= 0) return error(400, 'Invalid output limit.');
  const webTool = Array.isArray(body.tools) ? body.tools.find((t: any) => String(t?.type).includes('web_search')) : null;
  const payload: any = {
    model, input, store: false,
    reasoning: { effort: 'low' },
    // Reasoning consumes output tokens too. Leave enough room for a useful answer.
    max_output_tokens: Math.min(8192, Math.max(2048, Math.floor(requestedTokens) + 2048)),
  };
  if (typeof body.system === 'string') payload.instructions = body.system.slice(0, 40000);
  if (webTool) {
    payload.tools = [{ type: 'web_search' }];
    payload.tool_choice = 'required';
    payload.max_tool_calls = Math.min(3, Math.max(1, Number(webTool.max_uses) || 3));
  }
  try {
    const upstream = await fetch(`${cfg.base}/responses`, {
      method: 'POST', signal: AbortSignal.timeout(55000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json();
    if (!upstream.ok) return error(upstream.status === 429 ? 429 : 502, providerError(upstream.status, data.error?.code));
    const parts = (data.output || []).flatMap((item: any) => item.content || []);
    const text = data.output_text || parts.map((part: any) => part.text || part.refusal || '').filter(Boolean).join('\n');
    if (!text) return error(502, 'The model did not finish an answer. Try a shorter request.');
    const searches = (data.output || []).filter((item: any) => item.type === 'web_search_call').length;
    return json(200, {
      id: data.id, model: data.model || model, provider: 'OpenAI',
      content: [{ type: 'text', text }], output_text: text,
      incomplete: data.status === 'incomplete',
      citations: parts.flatMap((part: any) => part.annotations || []).filter((a: any) => a.type === 'url_citation'),
      usage: { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0, server_tool_use: { web_search_requests: searches } },
    });
  } catch (e) {
    return error(502, ['TimeoutError', 'AbortError'].includes((e as Error).name)
      ? 'This request took too long. Please try a shorter request.'
      : 'Unable to reach OpenAI. Please try again shortly.');
  }
}
export const config = { rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
