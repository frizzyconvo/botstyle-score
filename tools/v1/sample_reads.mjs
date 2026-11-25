#!/usr/bin/env node
// sample_reads.mjs - The locked test set and the read-round packets for BBBScorer 1.0 (dev design, section 7).
//
// Pool: deduped parts (tools/v1/dedupe.mjs) with 60+ prose words in English, from every source except excluded ones
// and the description-only reference set. Length bands use prose words: <150, 150-499, 500-999, 1000+.
//   Test set: ~800 real-world parts (no generated cards), stratified source x length band x part. Written once to
//     eval/v1/test_set.json ([{ id, part }]) and never overwritten unless --relock is passed.
//   Round: real-world parts per part x length band (at least humanLikelyPerCell from scraped sets with a known era,
//     the rest from creator-labeled sets), plus generated parts stratified model x request style x length band x part.
//     Test-set parts are never drawn. Packets in eval/v1/reads/<round>/: cards_N.md (35 parts each, shuffled, only
//     "## P<k>" headers and text) and key.json ({ P<k>: { id, part, source, era, lengthBand } }); meta.json holds the seed.
//
//   node tools/v1/sample_reads.mjs [--plan] [--round round1] [--seed 20261125] [--relock] [--force]
//     --plan   print the pool and planned counts per stratum; write nothing
//     --force  overwrite an existing round folder
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { EVAL } from '../_paths.mjs';
import { preprocessCard } from '../../js/card-preprocess.js';
import { SOURCES, readParts } from './datasets.mjs';
import { isKept } from './dedupe.mjs';

export const TEST_SET_FILE = join(EVAL, 'v1', 'test_set.json');
export const ROUND_DEFAULTS = { real: 3000, generated: 1500, humanLikelyPerCell: 300 };
const PARTS = ['description', 'greeting'], BANDS = ['<150', '150-499', '500-999', '1000+'];
const REAL_KINDS = new Set(['scraped', 'real_ai', 'provenance']), KNOWN_ERAS = new Set(['pre-chatgpt', '2023', '2024+']);
const MIN_PROSE_WORDS = 60;

export const lengthBand = w => w < 150 ? '<150' : w < 500 ? '150-499' : w < 1000 ? '500-999' : '1000+';

/** Seeded RNG (mulberry32): returns a function giving floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (xs, r) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const groupBy = (xs, key) => { const m = new Map(); for (const x of xs) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };

/** Equal allocation over strata: one pick per stratum in turn (shuffled), until n picks or nothing is left. */
export function allocate(strata, n, r) {
  const queues = shuffle([...strata.keys()].sort(), r).map(k => shuffle(strata.get(k), r)), out = [];
  while (out.length < n && queues.some(q => q.length)) for (const q of queues) { if (out.length >= n) break; if (q.length) out.push(q.pop()); }
  return out;
}
const isReal = p => REAL_KINDS.has(p.kind) && !p.excluded;

/** ~n real-world parts, stratified source x length band x part. */
export function drawTestSet(pool, n, r) {
  return allocate(groupBy(pool.filter(isReal), p => `${p.source}|${p.band}|${p.part}`), n, r);
}

/** One read round: real-world parts per part x band cell, then generated parts. `locked` holds test-set ids. */
export function drawRound(pool, q, r, locked) {
  const free = pool.filter(p => !locked.has(p.id) && !p.excluded), out = [];
  const real = free.filter(isReal), cells = PARTS.flatMap(part => BANDS.map(band => [part, band]));
  cells.forEach(([part, band], i) => {
    const want = Math.floor(q.real / cells.length) + (i < q.real % cells.length ? 1 : 0);
    const cell = real.filter(p => p.part === part && p.band === band), taken = new Set();
    const take = (xs, key, n) => { const got = allocate(groupBy(xs.filter(p => !taken.has(p.id)), key), n, r); got.forEach(p => taken.add(p.id)); out.push(...got); return got.length; };
    let got = take(cell.filter(p => p.kind === 'scraped' && KNOWN_ERAS.has(p.era)), p => `${p.source}|${p.era}`, Math.min(q.humanLikelyPerCell, want));
    got += take(cell.filter(p => p.kind !== 'scraped'), p => p.source, want - got);
    if (got < want) take(cell, p => `${p.source}|${p.era}`, want - got);
  });
  const gen = free.filter(p => p.kind === 'generated');
  out.push(...allocate(groupBy(gen, p => `${p.model}|${p.requestStyle}|${p.band}|${p.part}`), q.generated, r));
  return out;
}

const writeAtomic = (f, s) => { writeFileSync(f + '.tmp', s); renameSync(f + '.tmp', f); };

/** Shuffled, source-free packets of `size` parts plus key.json. `texts`: Map id -> text. Returns the key. */
export function writePackets(dir, items, texts, r, size = 35) {
  mkdirSync(dir, { recursive: true });
  const order = shuffle(items, r), key = {};
  for (let start = 0, f = 1; start < order.length; start += size, f++) {
    const md = order.slice(start, start + size).map((p, j) => {
      const k = `P${start + j + 1}`;
      key[k] = { id: p.id, part: p.part, source: p.source, era: p.era, lengthBand: p.band };
      return `## ${k}\n\n${String(texts.get(p.id) ?? '').trim()}\n`;
    }).join('\n');
    writeAtomic(join(dir, `cards_${f}.md`), md);
  }
  writeAtomic(join(dir, 'key.json'), JSON.stringify(key, null, 1));
  return key;
}

/** Draw and write the test set, unless it exists (then it is returned unchanged) or relock is set. */
export function lockTestSet(file, pool, { n = 800, seed = 20261125, relock = false } = {}) {
  if (existsSync(file) && !relock) return JSON.parse(readFileSync(file, 'utf-8'));
  const ts = drawTestSet(pool, n, rng(seed)).map(p => ({ id: p.id, part: p.part }));
  mkdirSync(join(file, '..'), { recursive: true });
  writeAtomic(file, JSON.stringify(ts, null, 1));
  writeAtomic(file.replace(/\.json$/, '.meta.json'), JSON.stringify({ seed, n, parts: ts.length, lockedAt: new Date().toISOString() }, null, 1));
  return ts;
}

// ---- CLI ----
async function buildPool() {
  const pool = [];
  for (const [source, s] of Object.entries(SOURCES)) {
    if (s.excluded || s.kind === 'reference') continue;
    let n = 0;
    try {
      for await (const p of readParts(source)) {
        if (!isKept(p.id)) continue;
        const st = preprocessCard(p.text).stats;
        if (st.nonEnglish || st.proseWords < MIN_PROSE_WORDS) continue;
        pool.push({ id: p.id, source, kind: s.kind, era: p.era, part: p.part, band: lengthBand(st.proseWords), model: p.model, requestStyle: p.requestStyle }); n++;
      }
    } catch (e) { console.log(`skipped ${source}: ${e.message}`); continue; }
    console.log(`pool ${source}: ${n} parts`);
  }
  return pool;
}
async function textsFor(items) {
  const want = new Set(items.map(p => p.id)), bySource = new Set(items.map(p => p.source)), texts = new Map();
  for (const source of bySource) for await (const p of readParts(source)) if (want.has(p.id)) texts.set(p.id, p.text);
  return texts;
}
const table = (items, key) => [...groupBy(items, key)].sort().map(([k, v]) => `${k} ${v.length}`).join(', ');

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2), opt = k => argv.includes(k) ? argv[argv.indexOf(k) + 1] : null;
  const seed = +(opt('--seed') || 20261125), round = opt('--round') || 'round1', plan = argv.includes('--plan');
  const pool = await buildPool();
  const real = pool.filter(isReal);
  console.log(`\nPool: ${pool.length} parts (${real.length} real-world). Real-world by part x band: ${table(real, p => `${p.part}/${p.band}`)}`);
  if (plan) {
    const ts = drawTestSet(pool, 800, rng(seed)), r = drawRound(pool, ROUND_DEFAULTS, rng(seed + 1), new Set(ts.map(p => p.id)));
    console.log(`Planned test set: ${ts.length} parts; by kind: ${table(ts, p => p.kind)}`);
    console.log(`Planned ${round}: ${r.length} parts; real by part x band: ${table(r.filter(isReal), p => `${p.part}/${p.band}`)}`);
    console.log(`  real by kind: ${table(r.filter(isReal), p => p.kind)}; generated: ${r.filter(p => p.kind === 'generated').length}`);
    process.exit(0);
  }
  const ts = lockTestSet(TEST_SET_FILE, pool, { seed, relock: argv.includes('--relock') });
  const dir = join(EVAL, 'v1', 'reads', round);
  if (existsSync(join(dir, 'key.json')) && !argv.includes('--force')) { console.log(`${dir} already has packets; pass --force to redraw.`); process.exit(2); }
  const r = drawRound(pool, ROUND_DEFAULTS, rng(seed + 1), new Set(ts.map(p => p.id)));
  const key = writePackets(dir, r, await textsFor(r), rng(seed + 2));
  writeAtomic(join(dir, 'meta.json'), JSON.stringify({ round, seed, quotas: ROUND_DEFAULTS, parts: r.length, packets: Math.ceil(r.length / 35), at: new Date().toISOString() }, null, 1));
  console.log(`Test set: ${ts.length} parts (eval/v1/test_set.json). ${round}: ${Object.keys(key).length} parts in ${Math.ceil(r.length / 35)} packets -> eval/v1/reads/${round}/`);
  console.log(`  real by part x band: ${table(r.filter(isReal), p => `${p.part}/${p.band}`)}`);
  console.log(`  real by kind: ${table(r.filter(isReal), p => p.kind)}; generated: ${r.filter(p => p.kind === 'generated').length}`);
}
