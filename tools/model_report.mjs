#!/usr/bin/env node
// model_report.mjs - How each AI model's generated cards score with BBBScorer and with the original slop-score
// formula, and how the two relate (regression). Reads the current scoring run's generated_v1 / generated_v2 rows.
//
//   node tools/model_report.mjs [eval/scores/v0.8.1] [--modes fresh] [--out <file>]
//
// Writes <run>/ai-models.md (and prints it):
//   - per model: cards, BBBScorer and original medians and IQRs, cost per card, band shares
//   - regression of BBBScorer on the original score over all AI cards (slope, intercept, R²), and each model's mean
//     residual: how far its cards sit above (+) or below (−) what the original score would predict
//   - within-model agreement (Spearman), and agreement between the two model rankings
//   - per request style: BBBScorer and original medians
//   - the upstream slop-score leaderboard (stories and essays) for models in both, so card scores can be set
//     against story scores
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PATHS, runDir } from './_paths.mjs';
import { SCORER_VERSION, WRITING_STYLE_BANDS as WB } from '../js/score-card.js';
import { requestStyleLabel } from '../js/card-style.js';
const argv = process.argv.slice(2), opt = k => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const RUN = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || runDir(SCORER_VERSION);
const MODES = (opt('--modes') || 'fresh').split(',');
const L = f => existsSync(join(RUN, f)) ? readFileSync(join(RUN, f), 'utf-8').split('\n').filter(Boolean).map(JSON.parse) : [];
// Cards made at a non-default temperature / min_p (ids with |t… or |mp…) are sampler tests, not leaderboard cards.
const defaultSampling = r => !/\|(?:t|mp)\d[\d.]*(?:\||$)/.test(String(r.id || ''));
const rows = [...L('generated_v1.jsonl').map(r => ({ ...r, mode: r.mode || 'fresh' })), ...L('generated_v2.jsonl')]
  .filter(r => !r.error && r.reliable && !r.nonEnglish && r.upstream !== null && MODES.includes(r.mode || 'fresh') && defaultSampling(r));
// cost per card from the generator's records
const cost = {}; for (const f of [PATHS.aiCardsV1, PATHS.aiCardsV2]) if (existsSync(f)) for (const l of readFileSync(f, 'utf-8').split('\n')) { if (!l) continue; try { const c = JSON.parse(l); if (c.cost != null) (cost[c.model] = cost[c.model] || []).push(c.cost); } catch { /* */ } }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); let k = 0; while (k < idx.length) { let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++; for (let t = k; t <= j; t++) r[idx[t][1]] = (k + j) / 2; k = j + 1; } return r; };
const pearson = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN; };
const spearman = (x, y) => x.length < 3 ? NaN : pearson(rank(x), rank(y));
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '–', f2 = v => Number.isFinite(v) ? v.toFixed(2) : '–';

// regression BBB = a + b·orig over all AI cards
const X = rows.map(r => r.upstream), Y = rows.map(r => r.score), mx = mean(X), my = mean(Y);
const b = X.reduce((s, x, i) => s + (x - mx) * (Y[i] - my), 0) / X.reduce((s, x) => s + (x - mx) ** 2, 0), a = my - b * mx, r2 = pearson(X, Y) ** 2;
const by = {}; for (const r of rows) (by[r.model] = by[r.model] || []).push(r);
const models = Object.entries(by).map(([m, rs]) => {
  const s = rs.map(r => r.score), u = rs.map(r => r.upstream), c = cost[m] || [];
  return { m, n: rs.length, bbb: q(s, .5), b25: q(s, .25), b75: q(s, .75), orig: q(u, .5), o25: q(u, .25), o75: q(u, .75),
    resid: mean(rs.map(r => r.score - (a + b * r.upstream))), rho: spearman(s, u), cost: c.length ? mean(c) : NaN,
    lo: 100 * s.filter(x => x < WB.original).length / s.length, hi: 100 * s.filter(x => x >= WB.familiar).length / s.length, under10: 100 * s.filter(x => x < 10).length / s.length, over90: 100 * s.filter(x => x >= 90).length / s.length };
}).sort((x, y) => y.bbb - x.bbb);
const rankAgree = spearman(models.map(x => x.bbb), models.map(x => x.orig));
// per request style
const styles = {}; for (const r of rows) { const k = r.style || String(r.id || '').split('|')[3] || '?'; (styles[k] = styles[k] || []).push(r); }
// upstream leaderboard (stories/essays), original formula, for models in both
let up = {}; try {
  const LB = JSON.parse(readFileSync(join(PATHS.scores, '..', '..', 'data', 'leaderboard_results.json'), 'utf-8')).results;
  const rng = v => { const mn = Math.min(...v), mxx = Math.max(...v), rr = mxx - mn; return { min: mn - rr * .1, max: mxx + rr * .1 }; };
  const UR = { w: rng(LB.map(r => r.metrics.slop_list_matches_per_1k_words || 0)), t: rng(LB.map(r => r.metrics.slop_trigram_matches_per_1k_words || 0)), c: rng(LB.map(r => r.metrics.not_x_but_y_per_1k_chars || 0)) };
  const nz = (v, r) => Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
  for (const r of LB) up[r.model.toLowerCase()] = (nz(r.metrics.slop_list_matches_per_1k_words, UR.w) * .6 + nz(r.metrics.not_x_but_y_per_1k_chars, UR.c) * .25 + nz(r.metrics.slop_trigram_matches_per_1k_words, UR.t) * .15) * 100;
} catch { /* optional */ }
const norm = x => x.toLowerCase().split('/').pop().replace(/[^a-z0-9]/g, '');
const upFor = m => Object.entries(up).find(([x]) => norm(x) === norm(m))?.[1];

const md = [`# AI-generated cards by model (BBBScorer ${SCORER_VERSION}, ${new Date().toISOString().slice(0, 16)} UTC)`, '',
  `${rows.length} reliable English cards (${MODES.join(' + ')} requests) from ${models.length} models. Cost = OpenRouter's reported $ per card.`, '',
  `**Regression over all cards:** BBBScorer = ${a.toFixed(1)} + ${b.toFixed(2)} × original (R² ${r2.toFixed(2)}, Spearman ${f2(spearman(X, Y))}). `
  + `The two rank the models ${rankAgree >= .7 ? 'similarly' : rankAgree >= .4 ? 'somewhat alike' : 'differently'} (Spearman of model medians ${f2(rankAgree)}). `
  + `Residual = how far a model's cards sit above (+) or below (−) what its original scores would predict: high residuals are what BBBScorer catches that the original misses.`, '',
  '| Model | n | BBB median (IQR) | Original median (IQR) | Residual | ρ within | <40 / 60+ | <10 / 90+ | $/card | Upstream stories (orig) |', '|---|---|---|---|---|---|---|---|---|---|',
  ...models.map(x => `| ${x.m} | ${x.n}${x.n < 20 ? '*' : ''} | ${f1(x.bbb)} (${f1(x.b25)}–${f1(x.b75)}) | ${f1(x.orig)} (${f1(x.o25)}–${f1(x.o75)}) | ${x.resid >= 0 ? '+' : ''}${f1(x.resid)} | ${f2(x.rho)} | ${x.lo.toFixed(0)}% / ${x.hi.toFixed(0)}% | ${x.under10.toFixed(0)}% / ${x.over90.toFixed(0)}% | ${Number.isFinite(x.cost) ? x.cost.toFixed(4) : '–'} | ${f1(upFor(x.m))} |`),
  '', '\\* fewer than 20 cards: the median can move a lot with one more card.', '',
  '## By request style', '', '| Request style | n | BBB median | Original median |', '|---|---|---|---|',
  ...Object.entries(styles).sort((x, y) => q(y[1].map(r => r.score), .5) - q(x[1].map(r => r.score), .5)).map(([k, rs]) => `| ${requestStyleLabel(k)} | ${rs.length} | ${f1(q(rs.map(r => r.score), .5))} | ${f1(q(rs.map(r => r.upstream), .5))} |`), ''].join('\n');
const out = opt('--out') || join(RUN, 'ai-models.md');
writeFileSync(out, md + '\n'); console.log(md); console.log(`\nSaved to ${out}`);
