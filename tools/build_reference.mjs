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
const argv = process.argv.slice(2);
const opt = (k, d) => argv.includes(k) ? argv[argv.indexOf(k) + 1] : d;
const latest = () => join('eval', 'scores', readdirSync(join('eval', 'scores')).filter(d => /^v\d/.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop());
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
const out = { note: 'Botstyle score quantiles (index = percentile). Built by tools/build_reference.mjs.', version: [...versions][0], built: new Date().toISOString().slice(0, 10),
  groups: {
    human_2023: { label: 'human-written cards (2023)', n: human.length, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length])), q: quantiles(human.map(r => r.score)) },
    ai_cards: { label: 'AI-written cards', n: ai.length, q: quantiles(ai.map(r => r.score)) },
  } };
writeFileSync('data/botstyle_reference.json', JSON.stringify(out, null, 1));
for (const [k, g] of Object.entries(out.groups)) console.log(k, g.n, g.parts ? JSON.stringify(g.parts) : '', 'p10/p50/p80/p90/p98', g.q[10], g.q[50], g.q[80], g.q[90], g.q[98]);
