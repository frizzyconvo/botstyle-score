#!/usr/bin/env node
// dedupe_cards.mjs - Which cards in one set already appear in others? Matches on card text, not on scores: the same
// normalized description + greeting + personality + scenario (exact), or simhash within 3 bits (near: small edits,
// a changed name, a fixed typo). Writes card ids only, never card text.
//
//   node tools/dedupe_cards.mjs <set> [<set> ...] [--against raincandy,jaicards,<path>,...] [--out <file.md>]
//
// A <set> is anything tools/_card_sources.mjs reads (a folder, an archive, a card file) or a JSONL written by
// tools/convert_cards.mjs (its textHash / simhash are reused). --against defaults to raincandy,jaicards:
//   raincandy   card-datasets/raincandy-chub-ai-cards/raincandy_cards.jsonl (Chub 2023-2025)
//   jaicards    card-datasets/jaicards-cards-js/jaicards_cards.jsonl (JanitorAI)
//   characterhub  card-datasets/characterhub.com/characterhub.jsonl/characterhub.jsonl
// The sets are also checked against each other, in the order given (a card matches only earlier sets).
// Hashes of the reference sets are cached in eval/dedupe/<name>.hashes.jsonl (rebuilt when the source file changes).
// Output: a summary per set (stdout and --out, default eval/dedupe/report-<date>.md) and eval/dedupe/matches.jsonl
// ({ set, id, match: exact|near, other, otherId, bits }).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { existsSync, statSync, mkdirSync, writeFileSync, createWriteStream, openSync, readSync, closeSync, renameSync } from 'fs';
import { resolve, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { readCards } from './_card_sources.mjs';
import { normalizeText, textHash, simhash, hamming } from './_card_parse.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
const VALUED = new Set(['--against', '--out']);
const sets = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
if (!sets.length) { console.log('usage: node tools/dedupe_cards.mjs <set> [<set> ...] [--against raincandy,jaicards,<path>] [--out report.md]'); process.exit(2); }
const KNOWN = {
  raincandy: join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl'),
  jaicards: join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl'),
  characterhub: join(CARDS, 'characterhub.com', 'characterhub.jsonl', 'characterhub.jsonl'),
};
const against = String(opt('--against') || 'raincandy,jaicards').split(',').map(s => s.trim()).filter(Boolean);
const DIR = join(ROOT, 'eval', 'dedupe'); mkdirSync(DIR, { recursive: true });

// one card -> { id, name, th, sh }; converted JSONL lines already carry their hashes
function* hashes(path) {
  for (const c of readCards(path)) {
    if (c.textHash && c.simhash !== undefined) { yield { id: c.id, name: c.name, th: c.textHash, sh: c.simhash }; continue; }
    const n = normalizeText(c); yield { id: c.id, name: c.name, th: textHash(n), sh: simhash(n) };
  }
}
function* fileLines(file) {
  const fd = openSync(file, 'r'), chunk = Buffer.alloc(1 << 22); let rest = Buffer.alloc(0), n;
  try { while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) { const buf = Buffer.concat([rest, chunk.subarray(0, n)]); let s = 0, e; while ((e = buf.indexOf(10, s)) >= 0) { if (e > s) yield buf.toString('utf-8', s, e); s = e + 1; } rest = Buffer.from(buf.subarray(s)); } if (rest.length) yield rest.toString('utf-8'); } finally { closeSync(fd); }
}
// reference sets: cached hashes
function refHashes(name) {
  const src = KNOWN[name] || resolve(name), label = KNOWN[name] ? name : basename(src);
  if (!existsSync(src)) { console.log(`${label}: ${src} not found, skipped`); return null; }
  const cache = join(DIR, label.replace(/[^a-z0-9_.-]+/gi, '_') + '.hashes.jsonl'), stamp = statSync(src).mtimeMs + ':' + (statSync(src).isFile() ? statSync(src).size : 'dir');
  if (existsSync(cache)) {
    const it = fileLines(cache), head = JSON.parse(it.next().value || '{}');
    if (head.stamp === stamp) { const out = []; for (const l of it) out.push(JSON.parse(l)); console.log(`${label}: ${out.length.toLocaleString()} hashes from cache`); return { label, rows: out }; }
  }
  console.log(`${label}: hashing ${src}…`);
  const out = [], t0 = Date.now(); let last = t0;
  for (const h of hashes(src)) { out.push(h); if (Date.now() - last > 15000) { last = Date.now(); console.log(`  ${out.length.toLocaleString()} cards…`); } }
  const ws = createWriteStream(cache + '.tmp'); ws.write(JSON.stringify({ stamp, source: src }) + '\n'); for (const h of out) ws.write(JSON.stringify(h) + '\n');
  ws.end(() => { try { renameSync(cache + '.tmp', cache); } catch { /* */ } });
  console.log(`  ${out.length.toLocaleString()} cards in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return { label, rows: out };
}

// index: exact by textHash, near by four 16-bit simhash bands
const exact = new Map(), bands = [new Map(), new Map(), new Map(), new Map()], all = [];
function add(label, h) {
  const i = all.push([label, h.id, h.sh]) - 1;
  if (!exact.has(h.th)) exact.set(h.th, i);
  if (h.sh) for (let b = 0; b < 4; b++) { const k = h.sh.slice(b * 4, b * 4 + 4), l = bands[b].get(k); if (!l) bands[b].set(k, [i]); else if (l.length < 64) l.push(i); }
}
function find(h) {
  const e = exact.get(h.th); if (e !== undefined) return { match: 'exact', other: all[e][0], otherId: all[e][1], bits: 0 };
  if (!h.sh) return null;
  let best = null;
  for (let b = 0; b < 4; b++) for (const i of bands[b].get(h.sh.slice(b * 4, b * 4 + 4)) || []) { const d = hamming(all[i][2], h.sh); if (d <= 3 && (!best || d < best.bits)) best = { match: 'near', other: all[i][0], otherId: all[i][1], bits: d }; }
  return best;
}

for (const a of against) { const r = refHashes(a); if (r) for (const h of r.rows) add(r.label, h); }
const ms = createWriteStream(join(DIR, 'matches.jsonl'));
const lines = [`# Card overlap report (${new Date().toISOString().slice(0, 16)} UTC)`, '', `Reference sets: ${against.join(', ')}. Each set is also checked against the sets listed before it.`, '',
  '| set | cards | exact copies | near copies | new | matched in |', '|---|---|---|---|---|---|'];
for (const s of sets) {
  const label = basename(s.replace(/[\\/]+$/, '')).replace(/\.(jsonl|json|zip|7z|rar)$/i, '');
  let n = 0, ex = 0, near = 0; const where = {}, mine = [];
  for (const h of hashes(resolve(s))) {
    n++; const m = find(h);
    if (m) { m.match === 'exact' ? ex++ : near++; where[m.other] = (where[m.other] || 0) + 1; ms.write(JSON.stringify({ set: label, id: h.id, ...m }) + '\n'); }
    mine.push(h);
  }
  for (const h of mine) add(label, h);   // later sets are checked against this one too
  const w = Object.entries(where).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
  lines.push(`| ${label} | ${n} | ${ex} (${n ? (100 * ex / n).toFixed(1) : 0}%) | ${near} (${n ? (100 * near / n).toFixed(1) : 0}%) | ${n - ex - near} | ${w} |`);
  console.log(`${label}: ${n} cards, ${ex} exact and ${near} near copies of earlier sets (${w})`);
}
await new Promise(r => ms.end(r));
const OUTF = opt('--out') ? resolve(opt('--out')) : join(DIR, `report-${new Date().toISOString().slice(0, 10)}.md`);
writeFileSync(OUTF, lines.join('\n') + '\n\nMatches (ids only): eval/dedupe/matches.jsonl\n');
console.log(`report: ${OUTF}`);
