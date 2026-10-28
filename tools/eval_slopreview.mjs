#!/usr/bin/env node
// eval_slopreview.mjs - Score SlopReview texts with the UPSTREAM slop-score formula
// and report how well it separates human from AI text (source labels).
//
// Usage: node tools/eval_slopreview.mjs <ensemble_predictions.jsonl> [--no-pos] [--out file.jsonl]
//
// Replicates slop-score.html exactly: slop-word rate, slop-trigram rate and
// not-x-but-y rate, min-max normalised against data/leaderboard_results.json,
// combined 60/25/15. Uses wink-pos-tagger locally so stage-2 contrast patterns
// run the same way they do in the browser (pass --no-pos to mimic the Node
// leaderboard script, which never loads the tagger).

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { loadSlopSets, computeSlopIndex } from '../js/metrics.js';
import { wordsOnlyLower, alphaTokens } from '../js/utils.js';
import { scoreText as scoreContrast } from '../js/contrast-detector.js';
import { setPosTagger } from '../js/pos-tagger.js';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const inPath = args.find(a => !a.startsWith('--'));
const usePos = !args.includes('--no-pos');
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

global.fetch = async (url) => {
  const content = readFileSync(new URL('../' + url.replace(/^\.\//, ''), import.meta.url), 'utf-8');
  return { ok: true, json: async () => JSON.parse(content) };
};

const quiet = () => { const o = { ...console }; for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) console[k] = () => {}; return () => Object.assign(console, o); };

// --- upstream normalisation (slop-score.html loadLeaderboard / computeSlopScore) ---
const lb = JSON.parse(readFileSync(new URL('../data/leaderboard_results.json', import.meta.url))).results;
const range = (vals) => { const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn; return { min: mn - r * 0.1, max: mx + r * 0.1 }; };
const R = {
  words: range(lb.map(r => r.metrics.slop_list_matches_per_1k_words || 0)),
  tri: range(lb.map(r => r.metrics.slop_trigram_matches_per_1k_words || 0)),
  con: range(lb.map(r => r.metrics.not_x_but_y_per_1k_chars || 0)),
};
const norm = (v, r) => Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
export const upstreamScore = (w, t, c) => (norm(w, R.words) * 0.6 + norm(c, R.con) * 0.25 + norm(t, R.tri) * 0.15) * 100;

// --- metrics helpers ---
export function auc(pos, neg) {
  // Mann-Whitney U with tie handling
  const all = pos.map(v => [v, 1]).concat(neg.map(v => [v, 0])).sort((a, b) => a[0] - b[0]);
  let rankSumPos = 0, i = 0;
  while (i < all.length) {
    let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (all[k][1]) rankSumPos += avg;
    i = j + 1;
  }
  return (rankSumPos - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

async function main() {
  await loadSlopSets();
  if (usePos) setPosTagger(require('wink-pos-tagger')());

  const rows = readFileSync(inPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const out = [];
  for (const r of rows) {
    const toks = alphaTokens(wordsOnlyLower(r.text));
    if (!toks.length) continue;
    const s = computeSlopIndex(toks, false);
    const restore = quiet();
    const c = scoreContrast(r.text).rate_per_1k;
    restore();
    out.push({
      source: r.source === 'AI' ? 'AI' : 'Human', model: r.model_identity || '', words: toks.length,
      word_rate: s.wordScore, tri_rate: s.trigramScore, con_rate: c,
      n_tri: Math.round(s.trigramScore * toks.length / 1000),
      score: upstreamScore(s.wordScore, s.trigramScore, c),
      comp: { w: norm(s.wordScore, R.words), t: norm(s.trigramScore, R.tri), c: norm(c, R.con) },
    });
  }
  if (outPath) writeFileSync(outPath, out.map(o => JSON.stringify(o)).join('\n'));

  const H = out.filter(o => o.source === 'Human'), A = out.filter(o => o.source === 'AI');
  const line = (name, f) => console.log(`  ${name.padEnd(26)} AUC ${auc(A.map(f), H.map(f)).toFixed(3)}   human med ${pct(H.map(f), .5).toFixed(2)} / p90 ${pct(H.map(f), .9).toFixed(2)}   AI med ${pct(A.map(f), .5).toFixed(2)}`);
  console.log(`\nUPSTREAM slop-score on ${H.length} human / ${A.length} AI texts  (POS stage2: ${usePos ? 'on' : 'off'})`);
  line('composite score', o => o.score);
  line('slop words /1k', o => o.word_rate);
  line('slop trigrams /1k', o => o.tri_rate);
  line('not-x-but-y /1k chars', o => o.con_rate);
  const flag = a => (100 * a.filter(o => o.score > 25).length / a.length).toFixed(1) + '%';
  console.log(`\n  flagged "slop" (score > 25):  human ${flag(H)}   AI ${flag(A)}`);
  const sat = a => (100 * a.filter(o => o.comp.t >= 0.8).length / a.length).toFixed(1) + '%';
  console.log(`  trigram component >= 0.8 (near-saturated): human ${sat(H)}   AI ${sat(A)}`);
  const anyTri = a => (100 * a.filter(o => o.n_tri >= 1).length / a.length).toFixed(1) + '%';
  console.log(`  texts with >= 1 trigram hit:                human ${anyTri(H)}   AI ${anyTri(A)}`);
  const hOne = H.filter(o => o.n_tri === 1);
  console.log(`  human texts with exactly 1 trigram hit: ${hOne.length}; mean points from trigram component: ${mean(hOne.map(o => o.comp.t * 15)).toFixed(1)}`);

  console.log('\n  by length (words):');
  for (const [lo, hi] of [[0, 400], [400, 800], [800, 1500], [1500, 1e9]]) {
    const h = H.filter(o => o.words >= lo && o.words < hi), a = A.filter(o => o.words >= lo && o.words < hi);
    if (h.length > 20 && a.length > 20) console.log(`    ${String(lo).padStart(4)}-${hi > 1e8 ? '   ' : String(hi).padEnd(4)}  n=${h.length}/${a.length}  AUC ${auc(a.map(o => o.score), h.map(o => o.score)).toFixed(3)}  flagged human ${flag(h)} AI ${flag(a)}`);
  }

  console.log('\n  by model (mean score, AUC vs all humans):');
  const models = [...new Set(A.map(o => o.model))];
  const rowsM = models.map(m => { const a = A.filter(o => o.model === m); return [m, a.length, mean(a.map(o => o.score)), auc(a.map(o => o.score), H.map(o => o.score))]; })
    .filter(r => r[1] >= 50).sort((x, y) => y[3] - x[3]);
  console.log(`    ${'Human/Reddit'.padEnd(48)} n=${String(H.length).padEnd(5)} mean ${mean(H.map(o => o.score)).toFixed(1)}`);
  for (const [m, n, mu, a] of rowsM) console.log(`    ${m.slice(0, 48).padEnd(48)} n=${String(n).padEnd(5)} mean ${mu.toFixed(1).padStart(5)}  AUC ${a.toFixed(3)}`);
}
main();
