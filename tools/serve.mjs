#!/usr/bin/env node
// serve.mjs - Run the page locally: `npm start` (or `node tools/serve.mjs [port]`, or
// double-click start-local.cmd on Windows), then open http://localhost:8787/
//
// Browsers won't run the page from a file:// path (ES modules and data files need http), and
// Botbooru doesn't allow cross-site requests, so this serves the folder and adds a small
// proxy: GET /proxy?url=<card API url>. The proxy only forwards to the card sites listed in
// ALLOWED, only GET, and only listens on localhost. The page switches to it automatically
// when opened from localhost. No dependencies beyond Node 18+.
import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const ALLOWED = new Set(['botbooru.com', 'www.botbooru.com', 'api.chub.ai', 'gateway.chub.ai']);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.gz': 'application/gzip', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

async function proxy(req, res, target) {
  let u;
  try { u = new URL(target); } catch { res.writeHead(400).end('bad url'); return; }
  if (u.protocol !== 'https:' || !ALLOWED.has(u.hostname)) { res.writeHead(403).end('host not allowed: ' + u.hostname); return; }
  try {
    const r = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': 'botstyle-score local' } });
    const body = Buffer.from(await r.arrayBuffer());
    res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch (e) { res.writeHead(502).end('fetch failed: ' + e.message); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (url.pathname === '/proxy') return proxy(req, res, url.searchParams.get('url') || '');
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/slop-score.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || /[\\/](?:\.git|\.env|node_modules[\\/]\.bin)/.test(file.slice(ROOT.length))) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch { res.writeHead(404).end('not found'); }
}).listen(PORT, '127.0.0.1', () => console.log(`botstyle-score: http://localhost:${PORT}/  (Ctrl+C to stop)`));
