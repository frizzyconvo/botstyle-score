#!/usr/bin/env node
// score_all.mjs - Score every card dataset with the current scorer and keep the results by version,
// for regression testing. Safe to leave running overnight: it resumes where it stopped.
//
//   node tools/score_all.mjs                 # everything (double-click score-all.cmd on Windows)
//   node tools/score_all.mjs --only korshuk,perchance
//   node tools/score_all.mjs --limit 200     # quick trial: first 200 cards per dataset (-> _trial/)
//   node tools/score_all.mjs --force         # rescore datasets already done for this version
//
// Output: eval/scores/v<SCORER_VERSION>/<dataset>.jsonl (one row per card, each with `version`) and
// summary.json (n, median, bands, by year). Compare two versions with tools/compare_scores.mjs.
// Card datasets are read from ../card-datasets (see BOTSTYLE.md); missing ones are skipped.
// The first run also flattens JanitorAI's 188,834 card files into one JSONL cache (slowest step).
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, openSync, readSync, closeSync, writeSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadAll, scoreCard, SCORER_VERSION } from '../js/score-card.js';
import { setPosTagger } from '../js/pos-tagger.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const require = createRequire(import.meta.url);
globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, u.replace(/^\.\//, '')), 'utf-8')) });
await loadAll('./data/'); setPosTagger(require('wink-pos-tagger')());

const argv = process.argv.slice(2);
const opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const ONLY = opt('--only') ? opt('--only').split(',') : null, LIMIT = Number(opt('--limit') || 0), FORCE = argv.includes('--force');
// --limit trial runs go to a _trial subfolder so they never count as a finished dataset
const OUT = join(ROOT, 'eval', 'scores', 'v' + SCORER_VERSION, ...(LIMIT ? ['_trial'] : []));
mkdirSync(OUT, { recursive: true });

const readJsonl = p => existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
function* jsonlStream(p) {   // reads in 4 MB chunks, so the ~1 GB JanitorAI cache never sits in memory whole
  const fd = openSync(p, 'r'), buf = Buffer.alloc(4 << 20); let rest = '', n;
  try {
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      const lines = (rest + buf.toString('utf-8', 0, n)).split('\n'); rest = lines.pop();
      for (const line of lines) if (line.trim()) yield JSON.parse(line);
    }
    if (rest.trim()) yield JSON.parse(rest);
  } finally { closeSync(fd); }
}
const tagsOf = t => Array.isArray(t) ? t : typeof t === 'string' ? (t.match(/[^\[\]",']+/g) || []).map(x => x.trim()).filter(Boolean) : [];
const card = r => ({ id: r.id, name: r.name || r.card_name || '', createdAt: r.createdAt || r.created_at || null, description: r.description || '', personality: r.personality || '',
  scenario: r.scenario || '', first_mes: r.first_mes || '', tags: tagsOf(r.tags || r.topics) });

// ---- JanitorAI: flatten the per-card files once into a cache ----
function jaicardsCache() {
  const dir = join(CARDS, 'jaicards-cards-js', 'cards-js'), cache = join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl');
  if (existsSync(cache)) return cache;
  if (!existsSync(dir)) return null;
  console.log('flattening JanitorAI cards (one-time, can take a while)…');
  const tmp = cache + '.part'; const wfd = openSync(tmp, 'w'); let n = 0;
  for (const d of readdirSync(dir).sort()) {
    const sub = join(dir, d); if (!statSync(sub).isDirectory()) continue;
    for (const f of readdirSync(sub)) {
      try {
        const j = JSON.parse(readFileSync(join(sub, f), 'utf-8')); const c = j.data || j; const x = (c.extensions || {})['janitorai-export'] || {};
        writeSync(wfd, JSON.stringify({ id: x.id || f.replace(/\.json$/, ''), createdAt: x.created_at || null, name: c.name, nsfw: !!x.is_nsfw, tags: tagsOf(c.tags),
          description: c.description || '', personality: c.personality || '', scenario: c.scenario || '', first_mes: c.first_mes || '' }) + '\n');
        if (++n % 20000 === 0) console.log(`  ${n} flattened`);
      } catch { /* unreadable file */ }
    }
  }
  closeSync(wfd); renameSync(tmp, cache); console.log(`  ${n} cards -> ${cache}`); return cache;
}

// ---- Perchance: description = roleInstruction (example dialogue moved out), greeting = first ai message ----
function* perchance() {
  const base = join(CARDS, 'perchance-character-database', 'ai-character-chat', 'characters');
  const EX = /^[\s#*\-]*(?:---\s*)?(?:start of )?example (?:dialogue|dialog|conversation|messages?|chat)s?\b.*$|^\s*<START>\s*$/im;
  const rd = p => { try { return readFileSync(p, 'utf-8'); } catch { return ''; } };
  for (const rating of ['sfw', 'nsfw']) {
    const d = join(base, rating); if (!existsSync(d)) continue;
    for (const name of readdirSync(d).sort()) {
      const src = join(d, name, 'src'); if (!existsSync(src)) continue;
      let ri = rd(join(src, 'roleInstruction.txt')); const m = ri.match(EX); if (m) ri = ri.slice(0, m.index);
      let msgs = []; try { msgs = JSON.parse(rd(join(src, 'initialMessages.json')) || '[]'); } catch { /* */ }
      const ai = msgs.find(x => x.author === 'ai' && x.content), scene = msgs.find(x => x.author === 'system' && !(x.hiddenFrom || []).length && x.content);
      let created = null; try { created = JSON.parse(rd(join(d, name, 'changelog.json')) || '{}').created || null; } catch { /* */ }
      yield { id: `perchance/${rating}/${name}`, name: rd(join(src, 'name.txt')).trim() || name, createdAt: created, description: ri.trim(), first_mes: (ai || scene || {}).content || '' };
    }
  }
}

function* cardFiles(globDir, pick) {
  if (!existsSync(globDir)) return;
  for (const e of readdirSync(globDir, { withFileTypes: true })) {
    const p = join(globDir, e.name);
    if (e.isDirectory()) yield* cardFiles(p, pick);
    else if (pick(e.name)) { try { const j = JSON.parse(readFileSync(p, 'utf-8')); yield { id: p.slice(CARDS.length - 'card-datasets'.length), ...(j.data || j) }; } catch { /* */ } }
  }
}

// label: what the set is evidence of. human = written before AI-written cards were common.
const DATASETS = [
  { name: 'korshuk', label: 'human', rows: () => jsonlStream(join(CARDS, 'korshuk-roleplay-characters', 'korshuk_cards.jsonl')), need: join(CARDS, 'korshuk-roleplay-characters', 'korshuk_cards.jsonl') },
  { name: 'raincandy_chub', label: r => String(r.createdAt || '') < '2023-07' ? 'human' : 'mixed', rows: () => jsonlStream(join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl')), need: join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl') },
  { name: 'perchance', label: 'mixed', rows: perchance },
  { name: 'spb_ai', label: 'ai', rows: function* () { let i = 0; for (const r of jsonlStream(join(CARDS, 'spb-2602-ai-personas', 'data.jsonl'))) yield { id: 'spb/' + i++, description: r.persona_text }; }, need: join(CARDS, 'spb-2602-ai-personas', 'data.jsonl') },
  { name: 'example_cards', label: 'example', rows: () => cardFiles(join(CARDS, 'example-cards'), f => /\.json$/i.test(f)) },
  { name: 'foreverse_ai', label: 'ai', rows: () => cardFiles(resolve(ROOT, '..', 'character-card-skills', 'cards', 'en'), f => /\.v2\.json$/i.test(f)) },
  { name: 'generated_v1', label: 'ai', rows: () => jsonlStream(join(ROOT, 'eval', 'ai_cards.jsonl')), need: join(ROOT, 'eval', 'ai_cards.jsonl'),
    skip: (() => { try { return new Set(JSON.parse(readFileSync(join(ROOT, 'eval', 'ai_cards_invalid_ids.json'), 'utf-8'))); } catch { return new Set(); } })() },
  { name: 'generated_v2', label: 'ai', rows: () => jsonlStream(join(ROOT, 'eval', 'ai_cards_v2.jsonl')), need: join(ROOT, 'eval', 'ai_cards_v2.jsonl') },
  { name: 'jaicards', label: 'human', rows: null },   // filled in below (needs the cache)
];

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = existsSync(join(OUT, 'summary.json')) ? JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf-8')) : { version: SCORER_VERSION, datasets: {} };

for (const ds of DATASETS) {
  if (ONLY && !ONLY.includes(ds.name)) continue;
  const outFile = join(OUT, ds.name + '.jsonl');
  if (existsSync(outFile) && !FORCE) { console.log(`${ds.name}: already scored for v${SCORER_VERSION} (use --force to redo)`); continue; }
  if (ds.name === 'jaicards') { const c = await jaicardsCache(); if (!c) { console.log('jaicards: not found, skipped'); continue; } ds.rows = () => jsonlStream(c); }
  if (ds.need && !existsSync(ds.need)) { console.log(`${ds.name}: ${ds.need} not found, skipped`); continue; }
  const t0 = Date.now(); const rows = []; let n = 0;   // rows are small (no card text)
  for (const raw of ds.rows()) {
    if (raw.valid === false || (ds.skip && ds.skip.has(raw.id))) continue;
    if (LIMIT && n >= LIMIT) break;
    const c = card(raw); n++;
    let r;
    try { r = scoreCard(c); } catch (e) { rows.push({ id: c.id, dataset: ds.name, version: SCORER_VERSION, error: e.message }); continue; }
    rows.push({ id: c.id, dataset: ds.name, label: typeof ds.label === 'function' ? ds.label(c) : ds.label, createdAt: c.createdAt, model: raw.model, mode: raw.mode,
      version: r.version, score: +r.score.toFixed(2), low: +r.low.toFixed(2), high: +r.high.toFixed(2), band: r.band.id, reliable: r.reliable, nonEnglish: !!r.stats.nonEnglish,
      proseWords: r.stats.proseWords, totalWords: r.stats.totalWords, format: r.format.format, greeting: r.greeting ? r.greeting.primary : null, type: r.type,
      comp: Object.fromEntries(Object.entries(r.components).map(([k, v]) => [k, +v.toFixed(3)])), emdashPoints: +r.emdashPoints.toFixed(2), artifactPoints: r.artifactPoints,
      paraCv: r.texture.paraCv === null ? null : +r.texture.paraCv.toFixed(3), aiStyleLikelihood: r.experimental.aiStyleLikelihood === null ? null : +r.experimental.aiStyleLikelihood.toFixed(3),
      tags: r.tags.map(t => t.id) });
    if (n % 5000 === 0) console.log(`  ${ds.name}: ${n} scored (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  writeFileSync(outFile, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  const ok = rows.filter(x => !x.error && x.reliable && !x.nonEnglish);
  const bands = {}; for (const x of rows) if (!x.error) bands[x.band] = (bands[x.band] || 0) + 1;
  const byYear = {}; for (const x of ok) { const y = String(x.createdAt || '').slice(0, 4) || 'undated'; (byYear[y] = byYear[y] || []).push(x.score); }
  summary.datasets[ds.name] = { n: rows.length, reliable: ok.length, errors: rows.filter(x => x.error).length, median: median(ok.map(x => x.score)), bands,
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, v]) => [y, { n: v.length, median: median(v) }])), limit: LIMIT || undefined, at: new Date().toISOString() };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`${ds.name}: ${rows.length} cards, median ${summary.datasets[ds.name].median?.toFixed(1)} (reliable ${ok.length}) in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outFile}`);
}
console.log(`done. Results in ${OUT}`);
