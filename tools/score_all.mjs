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
// summary.json (n, median, bands, by year). Rows also carry `upstream` (the original slop-score formula),
// genre, archetype and the experimental pulp score. run-log.jsonl records start/end time, cards, words,
// ms per card and words per second for each dataset (performance tracking). Compare two versions with tools/compare_scores.mjs.
// Card datasets are read from ../card-datasets (see --help in each flattener); missing ones are skipped.
// The first run also flattens JanitorAI's 188,834 card files into one JSONL cache (slowest step).
// Progress (dataset n of N, cards done, % and time left) prints every 15 s and goes to progress.log in the
// output folder (or --log <file>). A lock file stops two scoring runs at once (--ignore-lock overrides).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, openSync, readSync, closeSync, writeSync, appendFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadAll, scoreCard, SCORER_VERSION } from '../js/score-card.js';
import { setPosTagger } from '../js/pos-tagger.js';
import { loadSlopSets, computeSlopIndex } from '../js/metrics.js';
import { wordsOnlyLower, alphaTokens } from '../js/utils.js';
import { scoreText as scoreContrast } from '../js/contrast-detector.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const require = createRequire(import.meta.url);
globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, u.replace(/^\.\//, '')), 'utf-8')) });
await loadAll('./data/'); await loadSlopSets(); setPosTagger(require('wink-pos-tagger')());
// The original slop-score formula, for comparison (same normalisation as the upstream leaderboard).
const LB = JSON.parse(readFileSync(join(ROOT, 'data', 'leaderboard_results.json'), 'utf-8')).results;
const rng = v => { const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn; return { min: mn - r * .1, max: mx + r * .1 }; };
const UR = { w: rng(LB.map(r => r.metrics.slop_list_matches_per_1k_words || 0)), t: rng(LB.map(r => r.metrics.slop_trigram_matches_per_1k_words || 0)), c: rng(LB.map(r => r.metrics.not_x_but_y_per_1k_chars || 0)) };
const nz = (v, r) => Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
const quiet = fn => { const o = { ...console }; for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) console[k] = () => {}; try { return fn(); } finally { Object.assign(console, o); } };
function upstreamParts(text) {
  const toks = alphaTokens(wordsOnlyLower(text)); if (!toks.length) return null;
  const s = computeSlopIndex(toks, false), c = quiet(() => scoreContrast(text)).rate_per_1k;
  return { score: +((nz(s.wordScore, UR.w) * .6 + nz(c, UR.c) * .25 + nz(s.trigramScore, UR.t) * .15) * 100).toFixed(2),
    words: +s.wordScore.toFixed(2), trigrams: +s.trigramScore.toFixed(2), contrast: +c.toFixed(3) };
}
const upstreamScore = text => { const u = upstreamParts(text); return u ? u.score : null; };

// Disparity between BBBScorer and the original formula on the same text (points). Marked in every row and
// summarised in notes.md, with likely reasons, so a run shows where the two disagree and why.
const DISPARITY = { big: 30, veryBig: 50 };
function disparity(r, up) {
  if (!up) return null;
  const d = +(r.score - up.score).toFixed(1), a = Math.abs(d);
  if (a < DISPARITY.big) return { diff: d };
  const why = [], st = r.stats, share = st.totalWords ? st.proseWords / st.totalWords : 1;
  if (d > 0) {
    if (r.components.phrases >= .5 || r.components.structures >= .5) why.push('AI phrases/structures the original lists lack');
    if (share < .6) why.push(`only ${Math.round(share * 100)}% prose (original counts lists and boilerplate, diluting it)`);
    if (up.words < 8) why.push(`few original slop-list words (${up.words}/1k)`);
    if (r.emdashPoints > 0) why.push(`em-dash points +${r.emdashPoints.toFixed(0)}`);
    if (r.artifactPoints > 0) why.push(`chatbot leftovers +${r.artifactPoints}`);
  } else {
    if (up.trigrams >= 1) why.push(`original trigram hits (${up.trigrams}/1k) that BBBScorer drops or weights low`);
    if (up.words >= 20) why.push(`many original slop-list words (${up.words}/1k); BBBScorer weights by AI/human ratio`);
    if (share < .6) why.push(`only ${Math.round(share * 100)}% prose scored by BBBScorer`);
    if (r.pulp && r.pulp.score >= 15) why.push('genre vocabulary');
  }
  if (r.mixed) why.push(`mixed card (${r.mixed.higher} +${r.mixed.gap})`);
  return { diff: d, flag: a >= DISPARITY.veryBig ? 'very_big' : 'big', dir: d > 0 ? 'bbb_higher' : 'orig_higher', why };
}

const argv = process.argv.slice(2);
const opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const ONLY = opt('--only') ? opt('--only').split(',') : null, LIMIT = Number(opt('--limit') || 0), FORCE = argv.includes('--force');
// --limit trial runs go to a _trial subfolder so they never count as a finished dataset
const OUT = join(ROOT, 'eval', 'scores', 'v' + SCORER_VERSION, ...(LIMIT ? ['_trial'] : []));
mkdirSync(OUT, { recursive: true });

// Lock: one scoring run at a time (generate_ai_cards.mjs checks it before scoring new cards).
const LOCK = join(ROOT, 'eval', 'scores', '.score_all.lock');
if (existsSync(LOCK) && !argv.includes('--ignore-lock')) {
  const age = (Date.now() - statSync(LOCK).mtimeMs) / 60000;
  if (age < 10) { console.log(`Another scoring run looks active (${LOCK}, updated ${age.toFixed(0)} min ago). Wait for it, or pass --ignore-lock.`); process.exit(3); }
}
const touchLock = () => { try { writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), version: SCORER_VERSION })); } catch { /* ignore */ } };
touchLock();
const dropLock = () => { try { if (existsSync(LOCK) && JSON.parse(readFileSync(LOCK, 'utf-8')).pid === process.pid) unlinkSync(LOCK); } catch { /* ignore */ } };
process.on('exit', dropLock); process.on('SIGINT', () => { dropLock(); process.exit(130); });

// Progress: a line every few seconds on screen and in the log (--log <file>, default eval/scores/v<ver>/progress.log).
const LOGFILE = argv.includes('--log') ? resolve(argv[argv.indexOf('--log') + 1]) : join(OUT, 'progress.log');
const say = msg => { const line = `[${new Date().toLocaleTimeString()}] ${msg}`; console.log(line); try { appendFileSync(LOGFILE, line + '\n'); } catch { /* ignore */ } };
const fmtDur = s => s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`;
// Card counts up front, so progress can show a percentage and an ETA. JSONL files: count lines (fast).
function countLines(p) { if (!p || !existsSync(p)) return null; const fd = openSync(p, 'r'), buf = Buffer.alloc(8 << 20); let n = 0, k, last = 10;
  try { while ((k = readSync(fd, buf, 0, buf.length, null)) > 0) { for (let i = 0; i < k; i++) if (buf[i] === 10) n++; last = buf[k - 1]; } } finally { closeSync(fd); } return n + (last !== 10 ? 1 : 0); }

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

// notes.md: per dataset, how BBBScorer and the original compare (spread, agreement, disparities, examples).
const NOTES = join(OUT, 'notes.md');
function writeNotes(name, rows) {
  const ok = rows.filter(x => !x.error && x.reliable && !x.nonEnglish && x.upstream !== null);
  if (!ok.length) return;
  const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : '-'; };
  const qs = a => [.1, .25, .5, .75, .9, .99].map(p => q(a, p)).join(' / ');
  const B = ok.map(x => x.score), U = ok.map(x => x.upstream);
  const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); idx.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rb = rank(B), ru = rank(U), n = ok.length, mean = (n - 1) / 2;
  const cov = rb.reduce((s, v, i) => s + (v - mean) * (ru[i] - mean), 0), sd = rb.reduce((s, v) => s + (v - mean) ** 2, 0);
  const spearman = sd ? cov / sd : 0;
  const flagged = ok.filter(x => x.disparity && x.disparity.flag), vb = flagged.filter(x => x.disparity.flag === 'very_big');
  const up = flagged.filter(x => x.disparity.dir === 'bbb_higher'), down = flagged.filter(x => x.disparity.dir === 'orig_higher');
  const reasons = list => { const c = {}; for (const x of list) for (const w of x.disparity.why.length ? x.disparity.why : ['no clear reason (check by hand)']) { const k = w.replace(/\d+(\.\d+)?/g, 'N'); c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${v}× ${k}`).join('; ') || '-'; };
  const ex = list => list.sort((a, b) => Math.abs(b.disparity.diff) - Math.abs(a.disparity.diff)).slice(0, 8)
    .map(x => `  - ${x.disparity.flag === 'very_big' ? '**VERY BIG**' : 'big'} ${x.id}${x.name ? ` "${x.name}"` : ''}${x.model ? ` (${x.model})` : ''}: BBB ${x.score.toFixed(1)} vs original ${x.upstream.toFixed(1)} (${x.disparity.diff > 0 ? '+' : ''}${x.disparity.diff}); desc ${x.desc ?? '-'} / greet ${x.greet ?? '-'}; ${x.proseWords}/${x.totalWords} prose words, ${x.format}. ${x.disparity.why.join('; ') || 'no clear reason'}`).join('\n');
  const spreadB = +q(B, .9) - +q(B, .1), spreadU = +q(U, .9) - +q(U, .1);
  const warn = [];
  if (spreadB < 20) warn.push(`BBBScorer spread is narrow here (p10–p90 ${spreadB.toFixed(0)} points)`);
  if (spearman < .4) warn.push(`the two scores barely agree on order (Spearman ${spearman.toFixed(2)})`);
  if (vb.length / n > .05) warn.push(`${(100 * vb.length / n).toFixed(1)}% of cards have a very big disparity`);
  const mixed = ok.filter(x => x.mixed).length;
  const md = `\n## ${name} (${new Date().toISOString().slice(0, 16)}, BBBScorer ${SCORER_VERSION})\n\n`
    + `${n} reliable English cards of ${rows.length}. Text: description + first message for both scorers.\n\n`
    + `| | p10 / p25 / p50 / p75 / p90 / p99 |\n|---|---|\n| BBBScorer | ${qs(B)} |\n| original | ${qs(U)} |\n\n`
    + `- Agreement on order (Spearman): ${spearman.toFixed(2)}. Spread p10–p90: BBBScorer ${spreadB.toFixed(0)}, original ${spreadU.toFixed(0)} points.\n`
    + `- Disparities (|BBB − original| ≥ ${DISPARITY.big} = big, ≥ ${DISPARITY.veryBig} = VERY BIG): ${flagged.length} (${(100 * flagged.length / n).toFixed(1)}%), of which ${vb.length} very big. `
    + `BBB higher: ${up.length}; original higher: ${down.length}.\n`
    + `- Mixed cards (description and greeting ${'≥'}25 apart): ${mixed} (${(100 * mixed / n).toFixed(1)}%).\n`
    + (warn.length ? `- **Check:** ${warn.join('; ')}.\n` : '')
    + `- Why BBB is higher: ${reasons(up)}\n- Why the original is higher: ${reasons(down)}\n`
    + (up.length ? `\nBiggest "BBB higher":\n${ex(up)}\n` : '') + (down.length ? `\nBiggest "original higher":\n${ex(down)}\n` : '');
  appendFileSync(NOTES, md);
  say(`  notes: Spearman ${spearman.toFixed(2)}, ${flagged.length} disparities (${vb.length} very big)${warn.length ? ' — CHECK: ' + warn.join('; ') : ''}`);
}

const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const summary = existsSync(join(OUT, 'summary.json')) ? JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf-8')) : { version: SCORER_VERSION, datasets: {} };

const todo = DATASETS.filter(ds => !ONLY || ONLY.includes(ds.name));
say(`BBBScorer ${SCORER_VERSION}: ${todo.length} dataset(s) -> ${OUT}`);
let dsIndex = 0;
for (const ds of DATASETS) {
  if (ONLY && !ONLY.includes(ds.name)) continue;
  dsIndex++;
  const outFile = join(OUT, ds.name + '.jsonl');
  if (existsSync(outFile) && !FORCE) { console.log(`${ds.name}: already scored for v${SCORER_VERSION} (use --force to redo)`); continue; }
  if (ds.name === 'jaicards') { const c = await jaicardsCache(); if (!c) { console.log('jaicards: not found, skipped'); continue; } ds.rows = () => jsonlStream(c); }
  if (ds.need && !existsSync(ds.need)) { console.log(`${ds.name}: ${ds.need} not found, skipped`); continue; }
  const t0 = Date.now(), startedAt = new Date().toISOString(); const rows = []; let n = 0, totalWords = 0;   // rows are small (no card text)
  const total = ds.name === 'jaicards' ? countLines(join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl')) : ds.need ? countLines(ds.need) : null;
  say(`[${dsIndex}/${todo.length}] ${ds.name}: scoring${total ? ` ${total.toLocaleString()} cards` : ''}…`);
  let lastSay = Date.now();
  for (const raw of ds.rows()) {
    if (raw.valid === false || (ds.skip && ds.skip.has(raw.id))) continue;
    if (LIMIT && n >= LIMIT) break;
    const c = card(raw); n++;
    let r;
    try { r = scoreCard(c); } catch (e) { rows.push({ id: c.id, dataset: ds.name, version: SCORER_VERSION, error: e.message }); continue; }
    const up = upstreamParts(r.text), disp = disparity(r, up);
    rows.push({ id: c.id, name: String(c.name || '').slice(0, 60), dataset: ds.name, label: typeof ds.label === 'function' ? ds.label(c) : ds.label, createdAt: c.createdAt, model: raw.model, mode: raw.mode, round: raw.round,
      version: r.version, score: +r.score.toFixed(2), upstream: up ? up.score : null, upstreamParts: up, disparity: disp,
      desc: r.parts.description ? r.parts.description.score : null, greet: r.parts.greeting ? r.parts.greeting.score : null, joint: +r.joint.score.toFixed(2), mixed: r.mixed,
      repeats: { desc: r.repetition.description.per1k, greet: r.repetition.greeting.per1k, between: r.repetition.between.per1k }, low: +r.low.toFixed(2), high: +r.high.toFixed(2), band: r.band.id, reliable: r.reliable, nonEnglish: !!r.stats.nonEnglish,
      proseWords: r.stats.proseWords, totalWords: r.stats.totalWords, format: r.format.format, greeting: r.greeting ? r.greeting.primary : null, type: r.type,
      comp: Object.fromEntries(Object.entries(r.components).map(([k, v]) => [k, +v.toFixed(3)])), emdashPoints: +r.emdashPoints.toFixed(2), artifactPoints: r.artifactPoints,
      paraCv: r.texture.paraCv === null ? null : +r.texture.paraCv.toFixed(3), aiStyleLikelihood: r.experimental.aiStyleLikelihood === null ? null : +r.experimental.aiStyleLikelihood.toFixed(3),
      tags: r.tags.map(t => t.id), genre: r.genre.primary, genre2: r.genre.secondary, archetype: r.archetype.id,
      pulp: r.pulp ? r.pulp.score : null, pulpAdjusted: r.pulp ? r.pulp.adjusted : null, pulpFlag: r.pulp ? r.pulp.flag : null });
    totalWords += r.stats.totalWords || 0;
    if (Date.now() - lastSay > 15000) {
      lastSay = Date.now(); touchLock();
      const secs = (Date.now() - t0) / 1000, rate = n / Math.max(1, secs);
      say(`[${dsIndex}/${todo.length}] ${ds.name}: ${n.toLocaleString()}${total ? ` / ${total.toLocaleString()} (${(100 * n / total).toFixed(1)}%)` : ''} cards, ${Math.round(rate * 60).toLocaleString()} cards/min${total ? `, about ${fmtDur((total - n) / rate)} left` : ''}`);
    }
  }
  writeFileSync(outFile, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  const ok = rows.filter(x => !x.error && x.reliable && !x.nonEnglish);
  const bands = {}; for (const x of rows) if (!x.error) bands[x.band] = (bands[x.band] || 0) + 1;
  const byYear = {}; for (const x of ok) { const y = String(x.createdAt || '').slice(0, 4) || 'undated'; (byYear[y] = byYear[y] || []).push(x.score); }
  summary.datasets[ds.name] = { n: rows.length, reliable: ok.length, errors: rows.filter(x => x.error).length, median: median(ok.map(x => x.score)), bands,
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, v]) => [y, { n: v.length, median: median(v) }])), limit: LIMIT || undefined, at: new Date().toISOString() };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  writeNotes(ds.name, rows);
  // performance log: one line per dataset run (eval/scores/v<version>/run-log.jsonl)
  const secs = (Date.now() - t0) / 1000;
  appendFileSync(join(OUT, 'run-log.jsonl'), JSON.stringify({ dataset: ds.name, version: SCORER_VERSION, startedAt, endedAt: new Date().toISOString(), cards: rows.length, words: totalWords,
    seconds: +secs.toFixed(1), msPerCard: +(1000 * secs / Math.max(1, rows.length)).toFixed(2), wordsPerSecond: Math.round(totalWords / Math.max(0.001, secs)), node: process.version, platform: process.platform }) + '\n');
  say(`[${dsIndex}/${todo.length}] ${ds.name} done: ${rows.length} cards, ${totalWords.toLocaleString()} words, ${Math.round(totalWords / Math.max(0.001, secs))} words/s, median ${summary.datasets[ds.name].median?.toFixed(1)} (reliable ${ok.length}) in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outFile}`);
}
say(`done. Results in ${OUT}; read notes.md there first.`);
