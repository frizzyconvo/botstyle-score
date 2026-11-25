#!/usr/bin/env node
// dedupe.mjs - Cross-set dedupe of card parts for BBBScorer 1.0, so no part is in both training and test data.
//
// Parts (tools/v1/datasets.mjs) are compared within the same part type (description with description, greeting with
// greeting): the same normalized text is an exact copy; simhash within 3 bits on parts of 60+ words is a near copy.
// The first copy by priority is kept: provenance > real-world AI > pre-ChatGPT > 2023 > 2024+ > unknown date > generated.
// Excluded sources are left out. Writes part ids only, never card text.
//
//   node tools/v1/dedupe.mjs [--resume] [--sources a,b,...]
//     --resume   reuse per-source hash caches from an earlier (interrupted) run
// Output: eval/v1/dedupe.json = { keep: { partId: true }, dropped: [{ id, duplicateOf, kind: 'exact' | 'near' }] },
// hash caches in eval/v1/dedupe-cache/, and a short summary per source on stdout.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, createWriteStream } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { EVAL } from '../_paths.mjs';
import { normalizeText, textHash, simhash, hamming } from '../_card_parse.mjs';
import { SOURCES, readParts } from './datasets.mjs';

export const DEDUPE_FILE = join(EVAL, 'v1', 'dedupe.json');
const CACHE = join(EVAL, 'v1', 'dedupe-cache');
const ERA_RANK = { 'pre-chatgpt': 2, '2023': 3, '2024+': 4, unknown: 5, generated: 6 };
const NEAR_BITS = 3, NEAR_MIN_WORDS = 60, BUCKET_CAP = 256;

/** Lower is kept first. */
export function priorityOf(p) {
  const kind = SOURCES[p.source] ? SOURCES[p.source].kind : p.kind;
  return kind === 'provenance' ? 0 : kind === 'real_ai' ? 1 : ERA_RANK[p.era] ?? 5;
}
/** What dedupe needs from a part: no text. */
export function hashPart(p) {
  const norm = normalizeText({ description: p.text });
  const words = p.text.split(/\s+/).filter(Boolean).length;
  return { id: p.id, source: p.source, part: p.part, pri: priorityOf(p), th: textHash(norm), sh: words >= NEAR_MIN_WORDS ? simhash(norm) : null };
}

/** Dedupe parts (or hashed parts). Returns { keep, dropped }. */
export function dedupeParts(items) {
  const hs = [...items].map(x => 'th' in x ? x : hashPart(x)).map((h, i) => ({ ...h, i }));
  hs.sort((a, b) => a.pri - b.pri || a.i - b.i);
  const keep = {}, dropped = [], idx = {};
  for (const h of hs) {
    const ix = idx[h.part] || (idx[h.part] = { exact: new Map(), bands: [new Map(), new Map(), new Map(), new Map()] });
    const ex = ix.exact.get(h.th);
    if (ex) { dropped.push({ id: h.id, duplicateOf: ex, kind: 'exact' }); continue; }
    let near = null, best = NEAR_BITS + 1;
    if (h.sh) for (let b = 0; b < 4; b++) for (const k of ix.bands[b].get(h.sh.slice(b * 4, b * 4 + 4)) || []) {
      const d = hamming(k.sh, h.sh); if (d < best) { best = d; near = k.id; }
    }
    if (near) { dropped.push({ id: h.id, duplicateOf: near, kind: 'near' }); continue; }
    keep[h.id] = true; ix.exact.set(h.th, h.id);
    if (h.sh) for (let b = 0; b < 4; b++) { const key = h.sh.slice(b * 4, b * 4 + 4), l = ix.bands[b].get(key); if (!l) ix.bands[b].set(key, [{ id: h.id, sh: h.sh }]); else if (l.length < BUCKET_CAP) l.push({ id: h.id, sh: h.sh }); }
  }
  return { keep, dropped };
}

const KEEP = new Map();   // file -> keep map
/** Whether a part survived dedupe (reads eval/v1/dedupe.json; run this tool first). */
export function isKept(partId, file = DEDUPE_FILE) {
  if (!KEEP.has(file)) { if (!existsSync(file)) throw new Error('no dedupe results yet: run tools/v1/dedupe.mjs'); KEEP.set(file, JSON.parse(readFileSync(file, 'utf-8')).keep); }
  return KEEP.get(file)[partId] === true;
}

async function hashSource(id, resume) {
  const f = join(CACHE, id + '.jsonl');
  if (resume && existsSync(f)) return readFileSync(f, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const out = [], tmp = f + '.tmp', w = createWriteStream(tmp);
  for await (const p of readParts(id)) { const h = hashPart(p); out.push(h); w.write(JSON.stringify(h) + '\n'); }
  await new Promise((ok, bad) => w.end(e => e ? bad(e) : ok()));
  renameSync(tmp, f); return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2), resume = argv.includes('--resume');
  const pick = argv.includes('--sources') ? argv[argv.indexOf('--sources') + 1].split(',') : null;
  const ids = Object.keys(SOURCES).filter(id => !SOURCES[id].excluded && (!pick || pick.includes(id)));
  mkdirSync(CACHE, { recursive: true });
  const all = [];
  for (const id of ids) {
    const t0 = Date.now();
    try { const hs = await hashSource(id, resume); for (const h of hs) all.push(h); console.log(`hashed ${id}: ${hs.length} parts (${((Date.now() - t0) / 1000).toFixed(0)} s)`); }
    catch (e) { console.log(`skipped ${id}: ${e.message}`); }
  }
  const { keep, dropped } = dedupeParts(all);
  const tmp = DEDUPE_FILE + '.tmp'; writeFileSync(tmp, JSON.stringify({ keep, dropped })); renameSync(tmp, DEDUPE_FILE);
  const src = id => id.slice(0, id.indexOf(':'));
  const per = {}; for (const h of all) (per[h.source] ||= { parts: 0, exact: 0, near: 0, of: {} }).parts++;
  for (const d of dropped) { const s = per[src(d.id)]; s[d.kind]++; const o = src(d.duplicateOf); s.of[o] = (s.of[o] || 0) + 1; }
  console.log(`\nDedupe: ${all.length} parts, ${Object.keys(keep).length} kept, ${dropped.length} dropped -> eval/v1/dedupe.json`);
  for (const [id, s] of Object.entries(per)) {
    const top = Object.entries(s.of).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([o, n]) => `${o} ${n}`).join(', ');
    console.log(`${id.padEnd(19)} ${String(s.parts).padStart(7)} parts  dropped ${(100 * (s.exact + s.near) / s.parts).toFixed(1).padStart(5)}% (exact ${s.exact}, near ${s.near})${top ? `  of: ${top}` : ''}`);
  }
}
