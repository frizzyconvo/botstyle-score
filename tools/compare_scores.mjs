#!/usr/bin/env node
// compare_scores.mjs - Regression check between two scorer versions' outputs from score_all.mjs.
//   node tools/compare_scores.mjs eval/scores/v0.4.0 eval/scores/v0.5.0 [--top 10]
// Per dataset: cards matched by id, median before/after, mean absolute change, share whose band changed,
// and the biggest movers. Nothing changes on disk.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
const [A, B] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const TOP = Number(process.argv.includes('--top') ? process.argv[process.argv.indexOf('--top') + 1] : 10);
if (!A || !B) { console.error('usage: node tools/compare_scores.mjs <old dir> <new dir> [--top 10]'); process.exit(2); }
const load = p => new Map(readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => !r.error).map(r => [r.id, r]));
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
for (const f of readdirSync(B).filter(f => f.endsWith('.jsonl')).sort()) {
  if (!existsSync(join(A, f))) { console.log(`${f}: new in ${B}`); continue; }
  const a = load(join(A, f)), b = load(join(B, f));
  const pairs = [...b.values()].filter(r => a.has(r.id)).map(r => [a.get(r.id), r]);
  if (!pairs.length) { console.log(`${f}: no common ids`); continue; }
  const d = pairs.map(([x, y]) => y.score - x.score), moved = pairs.filter(([x, y]) => x.band !== y.band).length;
  console.log(`\n${f.replace('.jsonl', '')}: ${pairs.length} cards (v${pairs[0][0].version} -> v${pairs[0][1].version})`);
  console.log(`  median ${med(pairs.map(p => p[0].score)).toFixed(2)} -> ${med(pairs.map(p => p[1].score)).toFixed(2)};  mean |change| ${(d.reduce((s, x) => s + Math.abs(x), 0) / d.length).toFixed(2)};  band changed ${(100 * moved / pairs.length).toFixed(1)}%`);
  const trans = {}; for (const [x, y] of pairs) if (x.band !== y.band) trans[`${x.band}->${y.band}`] = (trans[`${x.band}->${y.band}`] || 0) + 1;
  if (moved) console.log('  ' + Object.entries(trans).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k} ${v}`).join(', '));
  for (const [x, y] of pairs.sort((p, q) => Math.abs(q[1].score - q[0].score) - Math.abs(p[1].score - p[0].score)).slice(0, TOP).filter(([x, y]) => Math.abs(y.score - x.score) >= 0.5))
    console.log(`  ${(y.score - x.score >= 0 ? '+' : '') + (y.score - x.score).toFixed(1)}  ${x.score.toFixed(1)} -> ${y.score.toFixed(1)}  ${y.id}`);
}
