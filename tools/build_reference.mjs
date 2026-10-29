#!/usr/bin/env node
// build_reference.mjs - Score distributions the page grades against (data/botstyle_reference.json).
//
//   node tools/build_reference.mjs [eval/scores/v0.4.0] [--human-before 2023-07] [--jai-before 2024-03]
//   (or: npm run reference)
//
// Reads tools/score_all.mjs output for one scorer version and writes 101 quantiles (0th..100th
// percentile) of the botstyle score per reference group, reliable English cards only:
//   human_2023  Korshuk + Chub (raincandy) created before --human-before + JanitorAI created before
//               --jai-before (JanitorAI's dump runs May 2023-Feb 2024)
//   ai_cards    generated runs (valid cards) + SPB-2602. character-card-skills cards are left out:
//               they were written to evade exactly this kind of scoring.
// Rebuild whenever the scorer version changes. Node only, so it runs on Windows without Python.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { WRITING_STYLE_BANDS as WB } from '../js/score-card.js';
const argv = process.argv.slice(2);
const opt = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
import { pageRunDir } from './_paths.mjs';
// default: the page's scorer version's run (not the newest folder: a prepared next version may be mid-run)
const latest = () => pageRunDir();
const SC = argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')) || latest();
const HB = opt('--human-before', '2023-07'), JB = opt('--jai-before', '2024-03');
const load = n => { const p = join(SC, n + '.jsonl'); return existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(JSON.parse) : []; };
const ok = r => !r.error && r.reliable && !r.nonEnglish;
const early = (r, b) => !!r.createdAt && String(r.createdAt).slice(0, 7) < b;
const parts = {
  korshuk: load('korshuk').filter(ok),
  ['chub_before_' + HB]: load('raincandy_chub').filter(r => ok(r) && early(r, HB)),
  ['janitorai_before_' + JB]: load('jaicards').filter(r => ok(r) && early(r, JB)),
};
const human = Object.values(parts).flat();
const ai = ['generated_v1', 'generated_v2', 'spb_ai'].flatMap(n => load(n).filter(ok));
const versions = new Set([...human, ...ai].map(r => r.version));
if (versions.size !== 1) { console.error(`mixed scorer versions in ${SC}: ${[...versions].join(', ')}`); process.exit(1); }
const quantiles = v => { const s = [...v].sort((a, b) => a - b); return Array.from({ length: 101 }, (_, q) => +s[Math.min(s.length - 1, Math.round(q / 100 * (s.length - 1)))].toFixed(2)); };
// Headline numbers for the page and docs ("How it works", bands, AUC): band split and median per group, how well
// the score separates the two groups (AUC), and how many AI cards score above the human 98th percentile.
const med = s => s[Math.floor((s.length - 1) / 2)];
// four bands (0.8.2): Original-ish, Mixed, Familiar, Common; one decimal, since Common is about 0.5% of 2023 cards
const bandSplit = v => { const n = v.length || 1; const c = [WB.original, WB.familiar, WB.common, Infinity].map((hi, i, a) => v.filter(x => x >= (i ? a[i - 1] : -Infinity) && x < hi).length);
  return c.map(x => +(100 * x / n).toFixed(1)); };
function auc(neg, pos) { // Mann-Whitney U / (n0 n1), ties count half
  const all = [...neg.map(x => [x, 0]), ...pos.map(x => [x, 1])].sort((a, b) => a[0] - b[0]);
  let r = 0, i = 0; while (i < all.length) { let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++; const avg = (i + j + 2) / 2; for (let k = i; k <= j; k++) if (all[k][1]) r += avg; i = j + 1; }
  return (r - pos.length * (pos.length + 1) / 2) / (neg.length * pos.length); }
const hs = human.map(r => r.score).sort((a, b) => a - b), as = ai.map(r => r.score).sort((a, b) => a - b);
const fp2 = hs[Math.min(hs.length - 1, Math.floor(0.98 * hs.length))];
const summary = { bands: [WB.original, WB.familiar, WB.common],
  human: { n: hs.length, median: +med(hs).toFixed(1), split: bandSplit(hs) },
  ai: { n: as.length, median: +med(as).toFixed(1), split: bandSplit(as) },
  auc: +auc(hs, as).toFixed(3), at2pct: { threshold: +fp2.toFixed(1), aiCaught: Math.round(100 * as.filter(x => x > fp2).length / as.length) } };
const out = { note: 'Botstyle score quantiles (index = percentile). Built by tools/build_reference.mjs.', version: [...versions][0], built: new Date().toISOString().slice(0, 10),
  summary,
  groups: {
    human_2023: { label: '2023 cards (mostly human)', n: human.length, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), q: quantiles(human.map(r => r.score)) },
    ai_cards: { label: 'AI-written cards', n: ai.length, q: quantiles(ai.map(r => r.score)) },
  } };
writeFileSync('data/botstyle_reference.json', JSON.stringify(out, null, 1));
console.log('summary', JSON.stringify(summary));
for (const [k, g] of Object.entries(out.groups)) console.log(k, g.n, g.parts ? JSON.stringify(g.parts) : '', 'p10/p50/p80/p90/p98', g.q[10], g.q[50], g.q[80], g.q[90], g.q[98]);
