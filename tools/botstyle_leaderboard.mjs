#!/usr/bin/env node
// botstyle_leaderboard.mjs - Botstyle scores for the leaderboard models, so "Your Text"
// is ranked on the same scale as the panel. Each model's score is the median over its
// creative-writing outputs cut to card length (first 700 words).
// Reference rows for human writing are merged in from evaluation score files.
//
// Note: these 22 models' outputs were used to build the lists and calibration, so their
// scores are in-sample (somewhat higher than an unseen model's would be).
//
// Usage: node tools/botstyle_leaderboard.mjs [--ref "Label=path/to/scores.jsonl[:filter]" ...]
//        filter: human | ai | before:YYYY-MM   (applied to score-file rows)

import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import { loadAll, scoreCard } from '../js/score-card.js';
import { setPosTagger } from '../js/pos-tagger.js';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
global.fetch = async (url) => { const c = readFileSync(new URL(url.replace(/^\.\//, ''), root), 'utf-8'); return { ok: true, json: async () => JSON.parse(c) }; };
await loadAll('./data/'); setPosTagger(require('wink-pos-tagger')());

const CHUNK = 700;
const firstWords = (t, n) => { const rx = /[A-Za-z]+(?:'[A-Za-z]+)?/g; let m, k = 0, end = t.length; while ((m = rx.exec(t))) if (++k === n) { end = m.index + m[0].length; break; } return t.slice(0, end); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const summary = a => ({ median: q(a, .5), p25: q(a, .25), p75: q(a, .75), n: a.length });

const models = {};
for (const f of readdirSync(new URL('upstream/results/', root)).filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(new URL('upstream/results/' + f, root), 'utf-8'));
  const key = Object.keys(d)[0], v = d[key];
  const scores = [];
  for (const s of v.samples || []) {
    if (s.prompt_index >= 150 || !s.output) continue;
    const r = scoreCard({ description: firstWords(s.output, CHUNK) });
    if (r.reliable) scores.push(r.score);
  }
  const sm = summary(scores);
  for (const name of new Set([key, v.test_model].filter(Boolean))) models[name] = sm;
  console.log(`${key.padEnd(48)} median ${sm.median.toFixed(1)}  (n=${sm.n})`);
}

const refs = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) if (args[i] === '--ref') {
  const [label, spec] = args[++i].split(/=(.*)/s);
  const [path, filter] = spec.split(/:(?=human$|ai$|before:)/);
  const rows = readFileSync(path, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.reliable !== false && !r.nonEnglish);
  const keep = rows.filter(r => !filter ? true : filter === 'human' ? r.source === 'Human' : filter === 'ai' ? r.source === 'AI'
    : filter.startsWith('before:') ? String(r.createdAt || '') < filter.slice(7) : true);
  const sm = summary(keep.map(r => r.score ?? r.botstyle));
  refs.push({ label, ...sm });
  console.log(`ref ${label.padEnd(44)} median ${sm.median.toFixed(1)}  (n=${sm.n})`);
}
writeFileSync(new URL('data/botstyle_leaderboard.json', root), JSON.stringify({
  _about: `Median botstyle score per model over creative outputs cut to ${CHUNK} words (in-sample: these outputs built the lists). Reference rows from evaluation sets. Built by tools/botstyle_leaderboard.mjs.`,
  models, references: refs }, null, 1));
