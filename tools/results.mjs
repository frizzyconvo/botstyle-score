#!/usr/bin/env node
// results.mjs - Show the current results without changing anything. Read-only: safe while a scoring run or card
// generation is running (half-written lines are skipped; nothing is written, no lock is taken).
//
//   node tools/results.mjs [--quick] [--modes fresh]
//
// Prints:
//   - what's running: the scoring lock, when the generated-cards file last changed, cards not scored yet
//   - every dataset in the current scoring run: reliable cards, median, band shares, original slop-score median
//   - AI models (plain requests by default): cards, BBBScorer and original medians, residual against the regression
//     of BBBScorer on the original, $ per card; failed and just-for-fun models are marked
//   - the headline numbers the page currently shows (data/botstyle_reference.json)
// --quick skips score files over 20 MB (the big JanitorAI set) for a faster read.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';
import { PATHS, ROOT, runDir } from './_paths.mjs';
import { SCORER_VERSION, WRITING_STYLE_BANDS as WB } from '../js/score-card.js';
import { FAILED, JUST_FOR_FUN } from './_model_groups.mjs';

const argv = process.argv.slice(2), opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const QUICK = argv.includes('--quick'), MODES = (opt('--modes') || 'fresh').split(',');
const RUN = runDir(SCORER_VERSION);
const lines = f => existsSync(f) ? readFileSync(f, 'utf-8').split('\n') : [];
const parse = f => lines(f).map(l => { if (!l) return null; try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); // partial last line → skipped
const ok = r => !r.error && r.reliable && !r.nonEnglish;
const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '–';
const ago = ms => { const m = (Date.now() - ms) / 60000; return m < 1 ? 'just now' : m < 90 ? `${m.toFixed(0)} min ago` : `${(m / 60).toFixed(1)} h ago`; };
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);

console.log(`BBBScorer ${SCORER_VERSION} · current run: ${RUN.replace(ROOT, '.')}\n`);

// 1. What's running
const lock = join(ROOT, 'eval', 'scores', '.score_all.lock');
if (existsSync(lock)) { const age = Date.now() - statSync(lock).mtimeMs; console.log(`Scoring: lock file updated ${ago(statSync(lock).mtimeMs)}${age < 10 * 60000 ? ' (a scoring run looks active)' : ' (stale: no run has touched it for 10+ minutes)'}`); }
else console.log('Scoring: no scoring run active');
const cards = parse(PATHS.aiCardsV2);
if (existsSync(PATHS.aiCardsV2)) {
  const t = statSync(PATHS.aiCardsV2).mtimeMs, last = cards[cards.length - 1];
  console.log(`Card generation: ${cards.length} cards, file last changed ${ago(t)}${Date.now() - t < 3 * 60000 ? ' (generation looks active)' : ''}${last ? `; last card: ${last.model} (round ${last.round || 1})` : ''}`);
}
const scoredV2 = parse(join(RUN, 'generated_v2.jsonl')), scoredIds = new Set(scoredV2.map(r => r.id));
const unscored = cards.filter(c => c.valid !== false && !scoredIds.has(c.id)).length;
console.log(`Not scored yet: ${unscored} valid generated card(s)${unscored ? ' (scored at the end of a generation step, or: node tools/score_all.mjs --only generated_v2)' : ''}\n`);

// 2. Datasets in the run
const rowsBy = {};
console.log(`${pad('Dataset', 22)}${lpad('cards', 8)}${lpad('median', 8)}${lpad('<' + WB.original, 6)}${lpad(WB.common + '+', 6)}${lpad('orig', 7)}`);
for (const f of (existsSync(RUN) ? readdirSync(RUN) : []).filter(f => f.endsWith('.jsonl') && f !== 'run-log.jsonl').sort()) {
  const p = join(RUN, f), name = f.replace(/\.jsonl$/, '');
  if (QUICK && statSync(p).size > 20e6) { console.log(`${pad(name, 22)}  (skipped by --quick, ${(statSync(p).size / 1e6).toFixed(0)} MB)`); continue; }
  const rows = parse(p).filter(ok); rowsBy[name] = rows;
  const v = rows.map(r => r.score), share = t => rows.length ? Math.round(100 * v.filter(t).length / rows.length) + '%' : '–';
  console.log(`${pad(name, 22)}${lpad(rows.length.toLocaleString('en-US'), 8)}${lpad(f1(q(v, .5)), 8)}${lpad(share(x => x < WB.original), 6)}${lpad(share(x => x >= WB.common), 6)}${lpad(f1(q(rows.map(r => r.upstream), .5)), 7)}`);
}

// 3. AI models
// Cards made at a non-default temperature / min_p (ids with |t… or |mp…) are sampler tests, not leaderboard cards.
const defaultSampling = r => !/\|(?:t|mp)\d[\d.]*(?:\||$)/.test(String(r.id || ''));
const gen = [...(rowsBy.generated_v1 || parse(join(RUN, 'generated_v1.jsonl')).filter(ok)).map(r => ({ ...r, mode: r.mode || 'fresh' })), ...(rowsBy.generated_v2 || scoredV2.filter(ok))]
  .filter(r => r.upstream != null && MODES.includes(r.mode || 'fresh') && defaultSampling(r));
if (gen.length > 2) {
  const X = gen.map(r => r.upstream), Y = gen.map(r => r.score), mx = X.reduce((a, b) => a + b, 0) / X.length, my = Y.reduce((a, b) => a + b, 0) / Y.length;
  const sxy = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0), sxx = X.reduce((s, x) => s + (x - mx) ** 2, 0), syy = Y.reduce((s, y) => s + (y - my) ** 2, 0);
  const b = sxy / sxx, a = my - b * mx, r2 = sxy * sxy / (sxx * syy);
  const cost = {}; for (const c of [...parse(PATHS.aiCardsV1), ...cards]) if (c.cost != null) (cost[c.model] = cost[c.model] || []).push(c.cost);
  const by = {}; for (const r of gen) (by[r.model] = by[r.model] || []).push(r);
  console.log(`\nAI models (${MODES.join(' + ')} requests, ${gen.length} cards): BBBScorer = ${a.toFixed(1)} + ${b.toFixed(2)} × original, R² ${r2.toFixed(2)}`);
  console.log(`${pad('Model', 40)}${lpad('n', 5)}${lpad('BBB', 7)}${lpad('orig', 7)}${lpad('resid', 7)}${lpad('$/card', 9)}`);
  for (const [m, rows] of Object.entries(by).sort((x, y) => q(y[1].map(r => r.score), .5) - q(x[1].map(r => r.score), .5))) {
    const res = rows.reduce((s, r) => s + r.score - (a + b * r.upstream), 0) / rows.length, c = cost[m];
    const tag = FAILED[m] ? '  [failed]' : JUST_FOR_FUN[m] ? '  [just for fun]' : rows.length < 20 ? '  *' : '';
    console.log(`${pad(m, 40)}${lpad(rows.length, 5)}${lpad(f1(q(rows.map(r => r.score), .5)), 7)}${lpad(f1(q(rows.map(r => r.upstream), .5)), 7)}${lpad((res >= 0 ? '+' : '') + res.toFixed(1), 7)}${lpad(c ? (c.reduce((s, x) => s + x, 0) / c.length).toFixed(4) : '–', 9)}${tag}`);
  }
  console.log('* fewer than 20 cards');
}

// 4. What the page shows now
const ref = existsSync(join(ROOT, 'data', 'botstyle_reference.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'botstyle_reference.json'), 'utf-8')) : null;
if (ref?.summary) { const S = ref.summary;
  console.log(`\nPage reference (built ${ref.built}, v${ref.version}): 2023 cards (mostly human) n=${S.human.n.toLocaleString('en-US')} median ${S.human.median}, bands ${S.human.split.join('/')}%; AI cards n=${S.ai.n.toLocaleString('en-US')} median ${S.ai.median}, bands ${S.ai.split.join('/')}%; AUC ${S.auc}; ${S.at2pct.aiCaught}% of AI cards flagged at a 2% false-positive rate.`); }
