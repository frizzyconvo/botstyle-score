#!/usr/bin/env node
// eval_botstyle.mjs - Score SlopReview texts with the BOTSTYLE pipeline and report
// separation of human vs AI (source labels). Optionally compare to upstream scores
// written by eval_slopreview.mjs --out.
//
// Usage: node tools/eval_botstyle.mjs <ensemble_predictions.jsonl> [--upstream upstream_scores.jsonl] [--out file.jsonl]

import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { loadBotstyle, scoreWeighted, computeBotstyleScore, BOTSTYLE_WEIGHTS, normRate } from '../js/botstyle.js';
import { preprocessCard } from '../js/card-preprocess.js';
import { checkCard } from '../js/human-tells.js';
import { scoreText as scoreContrast } from '../js/contrast-detector.js';
import { scoreStructures } from '../js/ai-structures.js';
import { setPosTagger } from '../js/pos-tagger.js';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const inPath = args.find(a => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

global.fetch = async (url) => {
  const content = readFileSync(new URL(url.replace(/^\.\//, ''), root), 'utf-8');
  return { ok: true, json: async () => JSON.parse(content) };
};
const quiet = () => { const o = { ...console }; for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) console[k] = () => {}; return () => Object.assign(console, o); };
function auc(pos, neg) {
  const all = pos.map(v => [v, 1]).concat(neg.map(v => [v, 0])).sort((a, b) => a[0] - b[0]);
  let rs = 0, i = 0;
  while (i < all.length) { let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (all[k][1]) rs += avg; i = j + 1; }
  return (rs - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length);
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

async function main() {
  await loadBotstyle('./data/');
  setPosTagger(require('wink-pos-tagger')());
  const rows = readFileSync(inPath, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  const out = [];
  for (const r of rows) {
    const pre = preprocessCard(r.text);
    const w = scoreWeighted(pre.prose);
    if (!w.nWords) continue;
    const restore = quiet(); const c = scoreContrast(pre.prose); restore();
    const sx = scoreStructures(pre.prose, c.matches || []);
    const s = computeBotstyleScore(w, sx);
    const tells = checkCard(r.text).summary;
    out.push({ source: r.source === 'AI' ? 'AI' : 'Human', model: r.model_identity || '', words: w.nWords,
      score: s.score, low: s.low, high: s.high, comp: s.components,
      word_rate: w.words.rate, phrase_rate: w.phrases.rate, con_rate: c.rate_per_1k, struct_rate: sx.rate, emdash_rate: sx.emdash.rate, emdash_pts: sx.emdash.points,
      n_phrase: w.phrases.hits.reduce((a, h) => a + h.count, 0), tells: tells.humanTellsPer1kWords });
  }
  if (opt('--out')) writeFileSync(opt('--out'), out.map(o => JSON.stringify(o)).join('\n'));

  const H = out.filter(o => o.source === 'Human'), A = out.filter(o => o.source === 'AI');
  const line = (name, f) => console.log(`  ${name.padEnd(28)} AUC ${auc(A.map(f), H.map(f)).toFixed(3)}   human med ${pct(H.map(f), .5).toFixed(2)} / p90 ${pct(H.map(f), .9).toFixed(2)}   AI med ${pct(A.map(f), .5).toFixed(2)}`);
  console.log(`\nBOTSTYLE on ${H.length} human / ${A.length} AI texts   weights ${JSON.stringify(BOTSTYLE_WEIGHTS)}`);
  line('composite score', o => o.score);
  line('weighted words /1k', o => o.word_rate);
  line('weighted phrases /1k', o => o.phrase_rate);
  line('not-x-but-y /1k chars', o => o.con_rate);
  line('structures /1k (incl. contrast)', o => o.struct_rate);
  line('em-dash /1k words', o => o.emdash_rate);
  line('human tells /1k (unscored)', o => -o.tells);
  const thr = pct(H.map(o => o.score), 0.9);
  console.log(`\n  threshold at human p90 = ${thr.toFixed(1)}  ->  AI above it: ${(100 * A.filter(o => o.score > thr).length / A.length).toFixed(1)}%`);
  for (const t of [25, 30, 35]) console.log(`  flagged at > ${t}: human ${(100 * H.filter(o => o.score > t).length / H.length).toFixed(1)}%  AI ${(100 * A.filter(o => o.score > t).length / A.length).toFixed(1)}%`);
  const hOne = H.filter(o => o.n_phrase === 1);
  console.log(`  human texts with exactly 1 phrase hit: ${hOne.length}; mean points from phrase component: ${mean(hOne.map(o => o.comp.phrases * BOTSTYLE_WEIGHTS.phrases * 100)).toFixed(1)}`);
  console.log(`  mean band width (high-low): human ${mean(H.map(o => o.high - o.low)).toFixed(1)}  AI ${mean(A.map(o => o.high - o.low)).toFixed(1)}`);

  console.log('\n  by length (words):');
  for (const [lo, hi] of [[0, 400], [400, 800], [800, 1500], [1500, 1e9]]) {
    const h = H.filter(o => o.words >= lo && o.words < hi), a = A.filter(o => o.words >= lo && o.words < hi);
    if (h.length > 20 && a.length > 20) console.log(`    ${String(lo).padStart(4)}-${hi > 1e8 ? '    ' : String(hi).padEnd(4)}  n=${h.length}/${a.length}  AUC ${auc(a.map(o => o.score), h.map(o => o.score)).toFixed(3)}  band ${mean(h.concat(a).map(o => o.high - o.low)).toFixed(1)}`);
  }

  let up = null;
  if (opt('--upstream')) up = readFileSync(opt('--upstream'), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  console.log('\n  by model: AUC vs all humans' + (up ? '   (upstream AUC)' : ''));
  const upAuc = m => { if (!up) return ''; const uh = up.filter(o => o.source === 'Human').map(o => o.score), ua = up.filter(o => o.model === m).map(o => o.score); return ua.length ? `   (${auc(ua, uh).toFixed(3)})` : ''; };
  const ms = [...new Set(A.map(o => o.model))].map(m => [m, A.filter(o => o.model === m)]).filter(([, a]) => a.length >= 50)
    .map(([m, a]) => [m, a.length, auc(a.map(o => o.score), H.map(o => o.score))]).sort((x, y) => y[2] - x[2]);
  for (const [m, n, a] of ms) console.log(`    ${m.slice(0, 46).padEnd(46)} n=${String(n).padEnd(5)} AUC ${a.toFixed(3)}${upAuc(m)}`);

  // Weight sweep (diagnostic only)
  console.log('\n  weight sweep (words/phrases/structures -> AUC):');
  for (const [a, b, c] of [[.6, .15, .25], [.55, .2, .25], [.5, .25, .25], [.45, .3, .25], [.5, .3, .2], [.6, .25, .15], [.7, .1, .2], [.4, .4, .2]]) {
    const f = o => a * o.comp.words + b * o.comp.phrases + c * o.comp.structures;
    console.log(`    ${a}/${b}/${c}: ${auc(A.map(f), H.map(f)).toFixed(3)}`);
  }
}
main();
