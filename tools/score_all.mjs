#!/usr/bin/env node
// score_all.mjs - Score every card dataset with the current scorer and keep the results by version,
// for regression testing. Safe to leave running overnight: it resumes where it stopped.
//
// Already-scored cards are never scored twice: a dataset that already has a file for this scorer version only gets
// its new cards scored (cards no longer valid in the source are dropped), and a big dataset stopped halfway picks up
// from its checkpoint (<dataset>.jsonl.partial, written every 15 s). --force (or --rescore) redoes everything.
//
//   node tools/score_all.mjs                 # everything (double-click score-all.cmd on Windows)
//   node tools/score_all.mjs --only korshuk,perchance
//   node tools/score_all.mjs --limit 200     # quick trial: first 200 cards per dataset (-> _trial/)
//   node tools/score_all.mjs --force         # rescore everything from scratch for this version (same: --rescore)
//   node tools/score_all.mjs --scorer 0.9.1  # score with the prepared next scorer version (eval/scores/v0.9.1/)
//   node tools/score_all.mjs --only generated_v2   # score only that dataset's new cards (what generate_ai_cards.mjs
//                                            # runs after a generation round; --new is accepted and is the default)
//   node tools/score_all.mjs --add "C:\cards\pack.zip\books\*.png" --name jammy_books [--label ai|human|mixed|unknown]
//                                            # score cards at any path (folder, Perchance folder, .zip, card file) as an
//                                            # extra dataset; only scores are written (eval/scores/v<ver>/<name>.jsonl),
//                                            # never card text. The path is remembered in eval/extra-datasets.json, so
//                                            # later full runs (new scorer versions) score it again. See tools/_card_sources.mjs.
//   node tools/score_all.mjs --extras        # list the extra datasets;  --remove-extra <name> forgets one
//
// Output: eval/scores/v<SCORER_VERSION>/<dataset>.jsonl (one row per card, each with `version`), SCORER.md
// (which scorer: weights, lists, anchors, bands; tools/scorer_manifest.mjs) and
// summary.json (n, median, bands, by year). Rows also carry `upstream` (the original slop-score formula),
// genre, archetype and the experimental pulp score. run-log.jsonl records start/end time, cards, words,
// ms per card and words per second for each dataset (performance tracking). Compare two versions with tools/compare_scores.mjs.
// Card datasets are read from ../card-datasets (see --help in each flattener); missing ones are skipped.
// The first run also flattens JanitorAI's 188,834 card files into one JSONL cache (slowest step).
// Progress (dataset n of N, cards done, % and time left) prints every 15 s and goes to progress.log in the
// output folder (or --log <file>). A lock file stops two scoring runs at once (--ignore-lock overrides).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { PATHS } from './_paths.mjs';
import { provenanceCards, PROVENANCE_DIR } from './_provenance.mjs';
import { readCards, sourceKind } from './_card_sources.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, renameSync, openSync, readSync, closeSync, writeSync, appendFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadAll, scoreCard } from '../js/score-card.js';
import { setScorerProfile, scorerVersion, scorerProfile } from '../js/scorer-profile.js';
import { createHash } from 'crypto';
import { setPosTagger } from '../js/pos-tagger.js';
import { formatLabel } from '../js/card-style.js';
import { disparity, DISPARITY } from '../js/compare-original.js';
import { loadSlopSets, computeSlopIndex } from '../js/metrics.js';
import { wordsOnlyLower, alphaTokens } from '../js/utils.js';
import { scoreText as scoreContrast } from '../js/contrast-detector.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const require = createRequire(import.meta.url);
// File-backed fetch for the scorer's loaders; text() too, so the typo dictionary (data/extra_words.txt) loads as on the page.
globalThis.fetch = async u => { const p = join(ROOT, u.replace(/^\.\//, '')); return { ok: existsSync(p), json: async () => JSON.parse(readFileSync(p, 'utf-8')), text: async () => readFileSync(p, 'utf-8') }; };
await loadAll('./data/'); await loadSlopSets(); setPosTagger(require('wink-pos-tagger')());
// The original slop-score formula, for comparison (same normalization as the upstream leaderboard).
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

// Disparity marks and reasons: js/compare-original.js (shared with the page).
const argv = process.argv.slice(2);
const opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
// --scorer 0.9.1: score with the prepared next version (its own folder, eval/scores/v0.9.1/). Default: 0.8.1.
if (opt('--scorer')) setScorerProfile(opt('--scorer'));
const SCORER_VERSION = scorerVersion();
// Fingerprint of what decides the scores besides the code version: the profile's switches and every scored data file.
// A prepared version can change (0.9.0's lists changed while its first run was going: now 0.9.1), so rows carry `fp` and
// rows from another fingerprint are scored again instead of being kept.
const FP = (() => { const h = createHash('sha1'); h.update(JSON.stringify(scorerProfile()));
  for (const f of ['botstyle_words.json', 'botstyle_bigrams.json', 'botstyle_trigrams.json', 'botstyle_calibration.json', 'botstyle_pulp_words.json', 'botstyle_card_lists.json', 'botstyle_length_bands.json', 'botstyle_card_drop.json']) {
    const p = join(ROOT, 'data', f); h.update(f + ':' + (existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex') : 'none')); }
  return h.digest('hex').slice(0, 10); })();
let ONLY = opt('--only') ? opt('--only').split(',') : null; const LIMIT = Number(opt('--limit') || 0), FORCE = argv.includes('--force') || argv.includes('--rescore');
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
// Generated cards carry the tags of the human card they were made from (seed_tags, or looked up by seed_id), as a
// creator would tag a card they had written with AI. Tags only feed read-outs (genre, card type), never the score.
let SEED_TAGS = null;
function* withSeedTags(rows) {
  if (!SEED_TAGS) { SEED_TAGS = new Map(); for (const f of [PATHS.seeds, PATHS.seedsWide]) if (f && existsSync(f)) for (const l of readFileSync(f, 'utf-8').split('\n')) { try { const r = l && JSON.parse(l); if (r && r.id != null && r.tags) SEED_TAGS.set(String(r.id), r.tags); } catch { /* skip */ } } }
  for (const r of rows) yield r.tags || r.seed_tags || !r.seed_id ? { ...r, tags: r.tags || r.seed_tags } : { ...r, tags: SEED_TAGS.get(String(r.seed_id)) };
}
const tagsOf = t => Array.isArray(t) ? t : typeof t === 'string' ? (t.match(/[^\[\]",']+/g) || []).map(x => x.trim()).filter(Boolean) : [];
const card = r => ({ id: r.id, name: r.name || r.card_name || '', createdAt: r.createdAt || r.created_at || null, description: r.description || '', personality: r.personality || '',
  scenario: r.scenario || '', first_mes: r.first_mes || '', tags: tagsOf(r.tags || r.topics), prov: r.prov });

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
  { name: 'generated_v1', label: 'ai', rows: () => withSeedTags(jsonlStream(PATHS.aiCardsV1)), need: PATHS.aiCardsV1,
    skip: (() => { try { return new Set(JSON.parse(readFileSync(PATHS.aiCardsV1Invalid, 'utf-8'))); } catch { return new Set(); } })() },
  { name: 'generated_v2', label: 'ai', rows: () => withSeedTags(jsonlStream(PATHS.aiCardsV2)), need: PATHS.aiCardsV2 },
  { name: 'jaicards', label: 'human', rows: null },
  // Cards of known or suspected provenance (tools/_provenance.mjs): label per card from provenance.csv.
  { name: 'provenance', label: r => r.prov ? r.prov.provenance : 'unknown', rows: () => provenanceCards(), need: join(PROVENANCE_DIR, 'provenance.csv') },   // filled in below (needs the cache)
];

// ---- extra datasets: any path the user points at (--add), remembered in eval/extra-datasets.json ----
const EXTRAS_FILE = join(ROOT, 'eval', 'extra-datasets.json');
const extras = existsSync(EXTRAS_FILE) ? JSON.parse(readFileSync(EXTRAS_FILE, 'utf-8')) : [];
const saveExtras = () => writeFileSync(EXTRAS_FILE, JSON.stringify(extras, null, 1));
if (argv.includes('--extras')) {
  console.log(extras.length ? extras.map(x => `${x.name} (${x.label}): ${x.path}  [added ${x.added.slice(0, 10)}]`).join('\n') : 'No extra datasets. Add one with --add <path> --name <name>.');
  dropLock(); process.exit(0);
}
if (opt('--remove-extra')) {
  const i = extras.findIndex(x => x.name === opt('--remove-extra'));
  console.log(i < 0 ? `No extra dataset called ${opt('--remove-extra')}.` : `Forgot ${extras.splice(i, 1)[0].name} (its scores stay in eval/scores).`); if (i >= 0) saveExtras();
  dropLock(); process.exit(0);
}
if (opt('--add')) {
  const path = resolve(opt('--add').replace(/^"|"$/g, '')), kind = sourceKind(path);
  if (!kind) { console.log(`Can't read cards at ${path}: give a folder, a Perchance characters folder, a .zip (optionally with a folder or *.png after it) or a .png/.json/.jsonl file.`); dropLock(); process.exit(2); }
  const auto = path.replace(/[\\/]\*.*$/, '').split(/[\\/]/).filter(Boolean).slice(-1)[0].replace(/\.zip$/i, '');
  const name = String(opt('--name') || auto).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'extra';
  if (DATASETS.some(d => d.name === name)) { console.log(`"${name}" is a built-in dataset name; pick another --name.`); dropLock(); process.exit(2); }
  const label = ['ai', 'human', 'mixed', 'unknown'].includes(opt('--label')) ? opt('--label') : 'unknown';
  const prev = extras.find(x => x.name === name);
  if (prev && prev.path !== path) { console.log(`"${name}" already points at ${prev.path}. Use another --name, or --remove-extra ${name} first.`); dropLock(); process.exit(2); }
  if (!prev) { extras.push({ name, path, label, kind, added: new Date().toISOString() }); saveExtras(); console.log(`Added extra dataset "${name}" (${kind}, label ${label}): ${path}`); }
  ONLY = [name];
}
for (const x of extras) DATASETS.push({ name: x.name, label: x.label, extra: true, source: x.path, rows: () => readCards(x.path) });

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
    .map(x => `  - ${x.disparity.flag === 'very_big' ? '**VERY BIG**' : 'big'} ${x.id}${x.name ? ` "${x.name}"` : ''}${x.model ? ` (${x.model})` : ''}: BBB ${x.score.toFixed(1)} vs original ${x.upstream.toFixed(1)} (${x.disparity.diff > 0 ? '+' : ''}${x.disparity.diff}); desc ${x.desc ?? '-'} / greet ${x.greet ?? '-'}; ${x.proseWords}/${x.totalWords} prose words, ${formatLabel(x.format).toLowerCase()}. ${x.disparity.why.join('; ') || 'no clear reason'}`).join('\n');
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

// Record exactly which scorer this run used (weights, lists, anchors, bands) next to its results.
if (!LIMIT) { try { const { spawnSync } = await import('child_process'); spawnSync(process.execPath, [join(ROOT, 'tools', 'scorer_manifest.mjs'), ...(opt('--scorer') ? ['--scorer', opt('--scorer')] : [])], { cwd: ROOT, stdio: 'ignore' }); } catch { /* manifest is optional */ } }
const todo = DATASETS.filter(ds => !ONLY || ONLY.includes(ds.name));
say(`BBBScorer ${SCORER_VERSION} (fingerprint ${FP}): ${todo.length} dataset(s) -> ${OUT}`);
let dsIndex = 0;
for (const ds of DATASETS) {
  if (ONLY && !ONLY.includes(ds.name)) continue;
  dsIndex++;
  const outFile = join(OUT, ds.name + '.jsonl');
  // Keep this version's existing rows (or a stopped run's checkpoint) and score only cards whose id isn't among them.
  const partial = outFile + '.partial';
  if (FORCE || LIMIT) { try { unlinkSync(partial); } catch { /* none */ } }
  const resumeFrom = FORCE || LIMIT ? null : existsSync(outFile) ? outFile : existsSync(partial) ? partial : null;
  const read = resumeFrom ? readFileSync(resumeFrom, 'utf-8').split('\n').flatMap(l => { try { return l ? [JSON.parse(l)] : []; } catch { return []; } }).filter(x => !x.error) : null;   // a checkpoint's last line may be cut off
  // Rows scored with other lists or settings (another fingerprint) are scored again; rows from before fingerprints existed are kept.
  const kept = read ? read.filter(x => !x.fp || x.fp === FP) : null;
  if (read && kept.length < read.length) say(`${ds.name}: ${(read.length - kept.length).toLocaleString()} row(s) were scored with other lists or settings (fingerprint changed): scoring them again`);
  const keptIds = kept ? new Set(kept.map(x => x.id)) : null;
  if (resumeFrom === partial) say(`${ds.name}: resuming a stopped run (${kept.length.toLocaleString()} cards already scored)`);
  if (ds.name === 'jaicards') { const c = await jaicardsCache(); if (!c) { console.log('jaicards: not found, skipped'); continue; } ds.rows = () => jsonlStream(c); }
  if (ds.need && !existsSync(ds.need)) { console.log(`${ds.name}: ${ds.need} not found, skipped`); continue; }
  if (ds.extra && !sourceKind(ds.source)) { console.log(`${ds.name}: ${ds.source} not found, skipped`); continue; }
  const t0 = Date.now(), startedAt = new Date().toISOString(); let rows = []; let n = 0, totalWords = 0;   // rows are small (no card text)
  const total = ds.name === 'jaicards' ? countLines(join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl')) : ds.need ? countLines(ds.need) : null;
  say(`[${dsIndex}/${todo.length}] ${ds.name}: scoring${kept ? ` new cards only (${kept.length.toLocaleString()} already scored)` : total ? ` ${total.toLocaleString()} cards` : ''}…`);
  let lastSay = Date.now(), flushed = 0; const stillThere = new Set();   // ids still valid in the source
  if (!LIMIT && resumeFrom !== partial) { try { unlinkSync(partial); } catch { /* none */ } }   // a checkpoint only ever holds this run's rows
  for (const raw of ds.rows()) {
    if (raw.valid === false || (ds.skip && ds.skip.has(raw.id))) continue;
    if (LIMIT && n >= LIMIT) break;
    if (keptIds) { stillThere.add(raw.id); if (keptIds.has(raw.id)) continue; }
    const c = card(raw); n++;
    let r;
    try { r = scoreCard(c); } catch (e) { rows.push({ id: c.id, dataset: ds.name, version: SCORER_VERSION, error: e.message }); continue; }
    const up = upstreamParts(r.text), disp = disparity(r, up);
    rows.push({ id: c.id, name: String(c.name || '').slice(0, 60), dataset: ds.name, label: typeof ds.label === 'function' ? ds.label(c) : ds.label, createdAt: c.createdAt, model: raw.model, mode: raw.mode, style: raw.style_requested, round: raw.round,
      version: r.version, fp: FP, score: +r.score.toFixed(2), upstream: up ? up.score : null, upstreamParts: up, disparity: disp,
      desc: r.parts.description ? r.parts.description.score : null, greet: r.parts.greeting ? r.parts.greeting.score : null, joint: +r.joint.score.toFixed(2), mixed: r.mixed,
      repeats: { desc: r.repetition.description.per1k, greet: r.repetition.greeting.per1k, between: r.repetition.between.per1k }, low: +r.low.toFixed(2), high: +r.high.toFixed(2), band: r.band.id, reliable: r.reliable, nonEnglish: !!r.stats.nonEnglish,
      proseWords: r.stats.proseWords, totalWords: r.stats.totalWords, format: r.format.format, greeting: r.greeting ? r.greeting.primary : null, type: r.type,
      comp: Object.fromEntries(Object.entries(r.components).map(([k, v]) => [k, +v.toFixed(3)])), emdashPoints: +r.emdashPoints.toFixed(2), artifactPoints: r.artifactPoints,
      paraCv: r.texture.paraCv === null ? null : +r.texture.paraCv.toFixed(3), aiStyleLikelihood: r.experimental.aiStyleLikelihood === null ? null : +r.experimental.aiStyleLikelihood.toFixed(3),
      tags: r.tags.map(t => t.id), genre: r.genre.primary, genre2: r.genre.secondary, archetype: r.archetype.id,
      pulp: r.pulp ? r.pulp.score : null, pulpAdjusted: r.pulp ? r.pulp.adjusted : null, pulpFlag: r.pulp ? r.pulp.flag : null,
      rpSlop: r.cliches && r.cliches.rpHits ? r.cliches.rpHits.reduce((a, x) => a + x.count, 0) : null, temperature: raw.temperature ?? undefined, prov: c.prov || undefined });
    totalWords += r.stats.totalWords || 0;
    if (Date.now() - lastSay > 15000) {
      lastSay = Date.now(); touchLock();
      if (!LIMIT && rows.length > flushed) { appendFileSync(partial, rows.slice(flushed).map(x => JSON.stringify(x)).join('\n') + '\n'); flushed = rows.length; }
      const secs = (Date.now() - t0) / 1000, rate = n / Math.max(1, secs);
      say(`[${dsIndex}/${todo.length}] ${ds.name}: ${n.toLocaleString()}${total ? ` / ${total.toLocaleString()} (${(100 * n / total).toFixed(1)}%)` : ''} cards, ${Math.round(rate * 60).toLocaleString()} cards/min${total ? `, about ${fmtDur((total - n) / rate)} left` : ''}`);
    }
  }
  const scoredNow = rows.length;
  if (kept) {
    const gone = kept.filter(x => !stillThere.has(x.id)).length;   // cards since marked invalid or removed from the source
    if (!scoredNow && !gone && resumeFrom === outFile && kept.length === read.length) { say(`[${dsIndex}/${todo.length}] ${ds.name}: no new cards (${kept.length.toLocaleString()} already scored)`); continue; }
    rows = kept.filter(x => stillThere.has(x.id)).concat(rows);   // not unshift(...): spreading 100k+ rows overflows the stack
    if (gone) say(`  dropped ${gone} row(s) whose cards are no longer valid in the source`);
  }
  writeFileSync(outFile, rows.map(x => JSON.stringify(x)).join('\n') + '\n');
  try { unlinkSync(partial); } catch { /* none */ }
  const ok = rows.filter(x => !x.error && x.reliable && !x.nonEnglish);
  const bands = {}; for (const x of rows) if (!x.error) bands[x.band] = (bands[x.band] || 0) + 1;
  const byYear = {}; for (const x of ok) { const y = String(x.createdAt || '').slice(0, 4) || 'undated'; (byYear[y] = byYear[y] || []).push(x.score); }
  summary.datasets[ds.name] = { n: rows.length, reliable: ok.length, errors: rows.filter(x => x.error).length, median: median(ok.map(x => x.score)), bands,
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, v]) => [y, { n: v.length, median: median(v) }])), fp: FP, limit: LIMIT || undefined, at: new Date().toISOString() };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
  writeNotes(ds.name, rows);
  // performance log: one line per dataset run (eval/scores/v<version>/run-log.jsonl)
  const secs = (Date.now() - t0) / 1000;
  appendFileSync(join(OUT, 'run-log.jsonl'), JSON.stringify({ dataset: ds.name, version: SCORER_VERSION, startedAt, endedAt: new Date().toISOString(), cards: scoredNow, ...(kept ? { mode: 'new', total: rows.length } : {}), words: totalWords,
    seconds: +secs.toFixed(1), msPerCard: +(1000 * secs / Math.max(1, scoredNow)).toFixed(2), wordsPerSecond: Math.round(totalWords / Math.max(0.001, secs)), node: process.version, platform: process.platform }) + '\n');
  say(`[${dsIndex}/${todo.length}] ${ds.name} done: ${kept ? `${scoredNow} new + ${kept.length} already scored = ` : ''}${rows.length} cards, ${totalWords.toLocaleString()} words, ${Math.round(totalWords / Math.max(0.001, secs))} words/s, median ${summary.datasets[ds.name].median?.toFixed(1)} (reliable ${ok.length}) in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${outFile}`);
}
say(`done. Results in ${OUT}; read notes.md there first.`);
