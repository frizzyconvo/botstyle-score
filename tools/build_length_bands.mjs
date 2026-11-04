#!/usr/bin/env node
// build_length_bands.mjs - Band cut-offs by prose length (BBBScorer 0.9.x, lengthBands).
//
// With one 40 / 60 cut-off for every card, the false-positive rate depends on length: short cards have few chances to
// hit anything, so a human card under 150 prose words almost never reaches 60, while 3-4% of very long ones do. Here
// each length bin gets its own cut-offs at the same points of the 2023 cards (mostly human) in that bin: Original-ish
// below the 94th percentile, Common from the 98th (the overall 40 / 60 sit at about those points). Cut-offs never
// fall as length grows.
//
//   node tools/build_length_bands.mjs [eval/scores/v0.9.1]      # from a complete scoring run (the human 2023 sets)
//   node tools/build_length_bands.mjs --rows <file.json> --key <score field> [--note "..."]   # from an experiment
//
// Options:
//   --drop-oldschool strong|some   leave out rows whose `oldSchool` field (js/old-school.js level) is at least that
//                                  level: ChatGPT-era cards inside the 2023 sets, which otherwise count as human
//   --shared-from <words>          bins from this length up share one set of cut-offs, taken over every row with at
//                                  least --shared-pool prose words (default 150). Per-bin cut-offs for long cards rise
//                                  to ~72 and cost real AI cards, which are mostly long; short bins keep their own.
//   --fresh <percentile>           also cut a `fresh` line per bin at that point (0.10.0 bands: Original below it, Fresh
//                                  from it up to the `original` line); e.g. 0.65
//   --out <file>                   output file (default data/botstyle_length_bands.json)
//
// Writes data/botstyle_length_bands.json (or --out).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
export const BINS = [[0, 150], [150, 250], [250, 350], [350, 500], [500, 800], [800, null]];
export const POINTS = { original: 0.94, common: 0.98 };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function lengthBands(rows, { sharedFrom = null, sharedPool = 150, fresh = null } = {}) {   // rows: { score, proseWords } of human cards (reliable or not; English, labeled)
  let lastO = 0, lastC = 0, lastF = 0;
  const pooled = sharedFrom === null ? null : rows.filter(r => r.proseWords >= sharedPool).map(r => r.score);
  return BINS.map(([from, to]) => {
    const shared = pooled && from >= sharedFrom;
    const v = shared ? pooled : rows.filter(r => r.proseWords >= from && (to === null || r.proseWords < to)).map(r => r.score);
    const o = Math.max(lastO, +q(v, POINTS.original).toFixed(1)), c = Math.max(lastC, o + 5, +q(v, POINTS.common).toFixed(1));
    lastO = o; lastC = c;
    const f = fresh === null ? null : Math.min(o, Math.max(lastF, +q(v, fresh).toFixed(1)));
    if (f !== null) lastF = f;
    return { from, to, ...(f === null ? {} : { fresh: f }), original: o, common: c, n: v.length, ...(shared ? { shared: true } : {}) };
  });
}
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('build_length_bands.mjs')) {
  let rows, source;
  if (opt('--rows')) {
    const key = opt('--key', 'score');
    rows = JSON.parse(readFileSync(opt('--rows'), 'utf-8')).filter(r => r.set === 'human' && !r.nonEnglish && !r.na).map(r => ({ score: r[key], proseWords: r.pwCore ?? r.pw, oldSchool: r.oldSchool }));
    source = `experiment rows ${opt('--rows')} (${key})`;
  } else {
    const dir = argv.find(a => !a.startsWith('--')) || join('eval', 'scores', readdirSync(join('eval', 'scores')).filter(d => /^v\d/.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop());
    const load = n => { const p = join(dir, n + '.jsonl'); return existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(JSON.parse) : []; };
    const early = (r, b) => !!r.createdAt && String(r.createdAt).slice(0, 7) < b;
    const ok = r => !r.error && !r.nonEnglish && r.band !== 'na';
    rows = [...load('korshuk').filter(ok), ...load('raincandy_chub').filter(r => ok(r) && early(r, '2023-07')), ...load('jaicards').filter(r => ok(r) && early(r, '2024-03'))];
    source = `scoring run ${dir.replace(/\\/g, '/')}`;
  }
  const drop = opt('--drop-oldschool'), dropLevels = drop === 'some' ? ['some', 'strong'] : drop ? ['strong'] : [];
  const before = rows.length; rows = rows.filter(r => !dropLevels.includes(r.oldSchool));
  if (dropLevels.length) source += `; left out ${before - rows.length} rows with old-school level ${dropLevels.join(' / ')}`;
  const sharedFrom = opt('--shared-from') ? +opt('--shared-from') : null, sharedPool = +opt('--shared-pool', 150);
  const fresh = opt('--fresh') ? +opt('--fresh') : null;
  const bins = lengthBands(rows, { sharedFrom, sharedPool, fresh });
  const about = 'Band cut-offs by prose length for BBBScorer 0.9.x (tools/build_length_bands.mjs): Original-ish below the 94th percentile of 2023 cards (mostly human) of that length, Familiar from the 98th.' +
    (sharedFrom === null ? '' : ` From ${sharedFrom} prose words up, one set of cut-offs taken over all cards with ${sharedPool}+ prose words.`);
  const aboutV10 = `Band cut-offs by prose length for BBBScorer 0.10.0 (tools/build_length_bands.mjs), as percentiles of 2023 cards (mostly human) of that length: Original below the ${Math.round(fresh * 100)}th, Fresh to the 94th, Mixed to the 98th, Common from the 98th.` + (sharedFrom === null ? '' : ` From ${sharedFrom} prose words up, one set of cut-offs taken over all cards with ${sharedPool}+ prose words.`);
  const out = { about: fresh === null ? about : aboutV10, source, note: opt('--note', ''), built: new Date().toISOString().slice(0, 10), points: fresh === null ? POINTS : { fresh, ...POINTS }, ...(sharedFrom === null ? {} : { sharedFrom, sharedPool }), bins };
  writeFileSync(opt('--out', 'data/botstyle_length_bands.json'), JSON.stringify(out, null, 1) + '\n');
  for (const b of bins) console.log(`${b.from}–${b.to ?? '∞'} prose words: ${b.fresh !== undefined ? `Fresh from ${b.fresh}, Mixed from ${b.original}, Common from ${b.common}` : `Original-ish under ${b.original}, Familiar from ${b.common}`} (n=${b.n})`);
}
