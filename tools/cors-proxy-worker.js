// cors-proxy-worker.js - Optional Cloudflare Worker so a hosted copy of the page (GitHub Pages)
// can fetch Botbooru cards. Botbooru sends no CORS header; Chub doesn't need this.
//
// Deploy: npx wrangler deploy -c tools/wrangler-proxy.toml, or: Cloudflare dashboard -> Workers & Pages -> Create -> Worker -> paste this file -> Deploy.
// Set ALLOWED_ORIGIN to your Pages origin, then put the worker URL + "?url=" in js/site-config.js.
// Only GET, only the card hosts below, only requests from your page's origin.

const ALLOWED_HOSTS = new Set(['botbooru.com', 'www.botbooru.com', 'api.chub.ai']);
const ALLOWED_ORIGIN = 'https://frizzyconvo.github.io';

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'GET', 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors });
    const origin = request.headers.get('Origin');
    if (origin && origin !== ALLOWED_ORIGIN) return new Response('origin not allowed', { status: 403 });
    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url') || ''); } catch { return new Response('bad url', { status: 400, headers: cors }); }
    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) return new Response('host not allowed', { status: 403, headers: cors });
    const r = await fetch(target.toString(), { headers: { Accept: 'application/json', 'User-Agent': 'botstyle-score proxy' } });
    return new Response(r.body, { status: r.status, headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'application/json', 'Cache-Control': 'public, max-age=300' } });
  },
};
