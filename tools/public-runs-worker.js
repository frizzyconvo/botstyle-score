// public-runs-worker.js - Optional public list of scored cards for BB Botstyle Scorer.
//
// Cloudflare Workers free plan: 100,000 requests/day; Workers KV free: 100,000 reads and 1,000
// writes per day, 1 GB stored. Each shared card is one write, each page view one read.
//
// Deploy: npx wrangler deploy -c tools/wrangler-runs.toml (KV namespace "bb-runs" already exists).
// Or by hand: Cloudflare dashboard -> Storage & Databases -> KV -> create namespace "bb-runs";
// Workers & Pages -> Create -> Worker -> paste this file -> Settings -> Bindings -> add KV
// namespace, variable name RUNS -> Deploy. Put the worker URL in js/site-config.js PUBLIC_RUNS.
//
// Stores only what the page sends: card name, link, origin tag, score, band, scorer version, scored fields,
// and the self-reported creator / AI-use answers. Never card text. Each entry gets a short id so it can be
// deleted with tools/public_list.mjs. Honor system: anyone can post;
// there's a size cap, a per-IP limit and a list cap, nothing more.

const ALLOWED_ORIGIN = 'https://frizzyconvo.github.io';
const MAX_RUNS = 5000, PER_IP_PER_HOUR = 30;

export default {
  async fetch(request, env) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
    const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json', ...extra } });
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname !== '/runs') return json({ error: 'not found' }, 404);
    if (request.method === 'GET') {
      const runs = (await env.RUNS.get('runs', 'json')) || [];
      return json({ runs }, 200, { 'Cache-Control': 'public, max-age=60' });
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return json({ error: 'origin not allowed' }, 403);
    const body = await request.text();
    if (body.length > 2000) return json({ error: 'too large' }, 413);
    let d; try { d = JSON.parse(body); } catch { return json({ error: 'bad json' }, 400); }
    const str = (v, n) => String(v ?? '').slice(0, n);
    const link = str(d.link, 300);
    const run = {
      id: crypto.randomUUID().slice(0, 8),
      origin: ['chub', 'bb', 'json', 'png', 'text', 'link'].includes(d.origin) ? d.origin : 'text',
      name: str(d.name, 120) || 'Card', link: /^https:\/\/(?:www\.)?(?:chub\.ai|characterhub\.org|botbooru\.com)\//.test(link) ? link : null,
      score: Math.max(0, Math.min(100, Number(d.score) || 0)), band: ['original', 'mixed', 'common'].includes(d.band) ? d.band : 'na',
      version: str(d.version, 20), fields: Array.isArray(d.fields) ? d.fields.slice(0, 8).map(f => str(f, 40)) : [],
      creator: !!d.creator, aiUse: d.creator && d.aiUse !== null && d.aiUse !== undefined ? Math.max(0, Math.min(100, Math.round(Number(d.aiUse) / 10) * 10)) : null,
      at: new Date().toISOString(),
    };
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown', hour = new Date().toISOString().slice(0, 13);
    const rk = `rate:${ip}:${hour}`, used = Number(await env.RUNS.get(rk)) || 0;
    if (used >= PER_IP_PER_HOUR) return json({ error: 'slow down' }, 429);
    const runs = (await env.RUNS.get('runs', 'json')) || [];
    runs.push(run);
    await env.RUNS.put('runs', JSON.stringify(runs.slice(-MAX_RUNS)));
    await env.RUNS.put(rk, String(used + 1), { expirationTtl: 3700 });
    return json({ ok: true });
  },
};
