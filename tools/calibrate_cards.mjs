#!/usr/bin/env node
// calibrate_cards.mjs - Anchor the 0-100 scale to AI-written character cards.
//
//   node tools/calibrate_cards.mjs [eval/experiments/eval_sample.jsonl]
//
// Scores the AI rows of the sample (description + first message, the default fields) and writes the
// percentiles of each component's raw rate to data/botstyle_calibration.json under "cards". botstyle.js
// maps a rate to 0..1 as rate / cards.p90, so 100 = as AI-styled as the most AI-styled tenth of AI cards.
// The older anchor (700-word AI fiction chunks, tools/calibrate.mjs) stays in the file for reference.
// Build the sample first: node tools/eval_cards.mjs --build-sample
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { PATHS } from './_paths.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(ROOT);
globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, String(u).replace(/^\.\//, '')), 'utf-8')) });
const { loadAll, scoreCard } = await import('../js/score-card.js');
const { setPosTagger } = await import('../js/pos-tagger.js');
await loadAll('./data/'); setPosTagger(createRequire(import.meta.url)('wink-pos-tagger')());
const src = process.argv.slice(2).find(a => !a.startsWith('--')) || PATHS.sample;
const R = { words: [], phrases: [], structures: [] }; const by = {};
for (const l of readFileSync(src, 'utf-8').split('\n')) {
  if (!l.trim()) continue; const c = JSON.parse(l); if (c.set !== 'ai') continue;
  const r = scoreCard(c); if (!r.reliable || r.stats.nonEnglish) continue;
  for (const k of Object.keys(R)) R[k].push(r.rates[k]); by[c.src] = (by[c.src] || 0) + 1;
}
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
const P = a => ({ n: a.length, p10: q(a, .1), p25: q(a, .25), p50: q(a, .5), p75: q(a, .75), p90: q(a, .9), p99: q(a, .99) });
const file = join(ROOT, 'data', 'botstyle_calibration.json'), cal = JSON.parse(readFileSync(file, 'utf-8'));
cal.cards = { _about: `Percentiles of raw component rates over ${R.words.length} reliable English AI-written cards (description + first message; ${Object.entries(by).map(([k, n]) => `${k} ${n}`).join(', ')}). Built by tools/calibrate_cards.mjs. The scorer normalises against these p90s.`,
  words: P(R.words), phrases: P(R.phrases), structures: P(R.structures) };
writeFileSync(file, JSON.stringify(cal, null, 2));
console.log(JSON.stringify(cal.cards, null, 1));
