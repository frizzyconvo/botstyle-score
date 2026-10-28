#!/usr/bin/env node
// organize_eval.mjs - Sort eval/ into a layout where it's clear what each file is (and rewrite eval/README.md):
//
//   eval/generated/     AI cards we generated (generate_ai_cards.mjs) and their error / invalid logs
//   eval/inputs/        other inputs: generation seeds, flattened / cut test sets
//   eval/experiments/   one-off experiments (eval_cards.mjs sample and shards, phrase_check.mjs)
//   eval/scores/v<ver>/ one complete scoring run per scorer version, with SCORER.md saying exactly which scorer
//   eval/legacy/        scores from before runs were versioned (scorer 0.1–0.3); kept for reference only
//
//   node tools/organize_eval.mjs [--dry-run]
// Refuses while a scoring run holds the lock or a generated-cards file changed in the last 3 minutes.
// Safe to run again: it only moves what is still in the old place, and always rewrites the README.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { existsSync, mkdirSync, renameSync, statSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EVAL } from './_paths.mjs';
const DRY = process.argv.includes('--dry-run');
const lock = join(EVAL, 'scores', '.score_all.lock');
if (!DRY && existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 10 * 60000) { console.log('A scoring run is active (eval/scores/.score_all.lock). Try again when it has finished.'); process.exit(3); }
if (!DRY) for (const f of ['ai_cards_v2.jsonl', join('generated', 'ai_cards_v2.jsonl')]) { const p = join(EVAL, f); if (existsSync(p) && Date.now() - statSync(p).mtimeMs < 3 * 60000) { console.log(`${f} changed in the last 3 minutes (card generation running?). Try again later.`); process.exit(3); } }

const MOVES = {
  generated: ['ai_cards.jsonl', 'ai_cards_invalid_ids.json', 'ai_cards_v2.jsonl', 'ai_cards_v2.jsonl.bak', 'ai_cards_v2_errors.jsonl', 'ai_cards_v2_invalid.jsonl'],
  inputs: ['seeds_jai_2023h1.jsonl', 'gutenberg_eval_600w.jsonl', 'korshuk_cards.jsonl', 'perchance_cards.jsonl'],
  experiments: ['eval_sample.jsonl', 'eval_parts', 'eval_cards.json', 'eval_cards.log', 'phrase_check.json', 'phrase_check.log'],
  [join('legacy', 'unversioned-scores')]: ['ai_cards_scores.jsonl', 'ai_cards_v2_scores.jsonl', 'botstyle_scores.jsonl', 'gutenberg_botstyle_scores.jsonl', 'gutenberg_upstream_scores.jsonl',
    'jaicards_june2023_scores.jsonl', 'korshuk_scores.jsonl', 'perchance_scores.jsonl', 'raincandy_scores.jsonl', 'spb_scores.jsonl', 'upstream_scores.jsonl'],
};
let moved = 0;
for (const [dir, files] of Object.entries(MOVES)) for (const f of files) {
  const from = join(EVAL, f), to = join(EVAL, dir, f);
  if (!existsSync(from)) continue;
  if (existsSync(to)) { console.log(`  skip ${f}: ${dir}/${f} already exists`); continue; }
  console.log(`  ${DRY ? 'would move' : 'move'} ${f} -> ${dir}/`);
  if (!DRY) { mkdirSync(join(EVAL, dir), { recursive: true }); renameSync(from, to); } moved++;
}
const known = new Set(Object.values(MOVES).flat());
const leftovers = readdirSync(EVAL).filter(f => !['generated', 'inputs', 'experiments', 'scores', 'legacy', 'README.md'].includes(f) && !known.has(f));
if (leftovers.length) console.log(`  not sorted (left in eval/): ${leftovers.join(', ')}`);

// README with the status of every versioned run
const EXPECTED = ['korshuk', 'raincandy_chub', 'perchance', 'spb_ai', 'example_cards', 'foreverse_ai', 'generated_v1', 'generated_v2', 'jaicards'];
const vers = existsSync(join(EVAL, 'scores')) ? readdirSync(join(EVAL, 'scores')).filter(d => /^v\d/.test(d)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
let current = null; try { current = readFileSync(join(EVAL, '..', 'js', 'score-card.js'), 'utf-8').match(/SCORER_VERSION = '([0-9.]+)'/)[1]; } catch { /* ignore */ }
const runRows = vers.map(d => { const have = readdirSync(join(EVAL, 'scores', d)).filter(f => f.endsWith('.jsonl') && f !== 'run-log.jsonl').map(f => f.replace(/\.jsonl$/, ''));
  const missing = EXPECTED.filter(x => !have.includes(x)); const v = d.slice(1);
  const status = missing.length ? `partial (missing ${missing.join(', ')})` : 'complete';
  return `| ${d} | ${v === current ? '**current scorer**' : 'superseded'} | ${status} | ${existsSync(join(EVAL, 'scores', d, 'SCORER.md')) ? 'yes' : 'no'} | ${existsSync(join(EVAL, 'scores', d, 'notes.md')) ? 'yes' : 'no'} |`; });
const legacyDir = join(EVAL, 'legacy', 'unversioned-scores');
const legacyRows = existsSync(legacyDir) ? readdirSync(legacyDir).filter(f => f.endsWith('.jsonl')).map(f => `| ${f} | ${statSync(join(legacyDir, f)).mtime.toISOString().slice(0, 16).replace('T', ' ')} UTC |`) : [];
const readme = `# eval/

Local data for building and testing BBBScorer (not in git). Rewritten by \`node tools/organize_eval.mjs\` (last ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC).

| Folder | What's in it |
|---|---|
| generated/ | AI cards we generated with tools/generate_ai_cards.mjs: \`ai_cards.jsonl\` (run 1), \`ai_cards_v2.jsonl\` (run 2 onwards, all later models and rounds), plus error and invalid-card logs. Inputs to scoring; scoring never changes them. |
| inputs/ | Generation seeds (JanitorAI 2023 cards) and flattened or cut test sets (Gutenberg 600-word pairs, Korshuk, Perchance). |
| experiments/ | One-off experiments: tools/eval_cards.mjs sample, shards and report; tools/phrase_check.mjs output. Rebuildable. |
| scores/v<version>/ | One scoring run per scorer version (tools/score_all.mjs): one .jsonl per dataset, summary.json, notes.md (BBBScorer vs original), progress.log, run-log.jsonl, and SCORER.md / scorer.json saying exactly which scorer produced it. |
| legacy/unversioned-scores/ | Scores written before runs were versioned (scorers 0.1–0.3, 27–28 Oct 2026). Which exact scorer made each is not recorded; for reference only, don't compare with versioned runs. |

## Scoring runs

| Folder | Scorer | Datasets | SCORER.md | notes.md |
|---|---|---|---|---|
${runRows.join('\n') || '| – | | | | |'}

Only the run for the current scorer should feed the page (leaderboard, reference). Compare runs with
\`node tools/compare_scores.mjs eval/scores/v<old> eval/scores/v<new>\`; SCORER.md in each says what changed.

## Legacy files

| File | Last written |
|---|---|
${legacyRows.join('\n') || '| – | |'}
`;
if (!DRY) writeFileSync(join(EVAL, 'README.md'), readme);
console.log(`${DRY ? 'Would move' : 'Moved'} ${moved} item(s). ${DRY ? '' : 'Wrote eval/README.md.'}`);
