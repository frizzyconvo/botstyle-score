#!/usr/bin/env node
// organize_eval.mjs - Keep eval/ in one tidy layout (see tools/_paths.mjs) and rewrite eval/README.md:
//
//   eval/ai-cards/      AI cards we generated and the generator's error / invalid logs
//   eval/inputs/        generation seeds, flattened / cut test sets
//   eval/experiments/   one-off experiments (eval_cards.mjs, phrase_check.mjs)
//   eval/scores/v<ver>/ the run for the current scorer only, with its notes.md and comparison with the previous run
//   eval/old/           superseded: older runs (old/scores/), pre-versioning scores (old/unversioned-scores/),
//                       stale backups (old/backups/)
//
// Also writes Windows shortcuts in docs/ (not in git) to every doc: README, BOTSTYLE, CHANGELOG, dev/CHATLOG,
// dev/NOTES, and the current run's notes, comparison and SCORER.md.
//
//   node tools/organize_eval.mjs [--dry-run]
// Refuses while a scoring run holds the lock or a generated-cards file changed in the last 3 minutes.
// Safe to run again: it only moves what is out of place, and always rewrites the README.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { existsSync, mkdirSync, renameSync, statSync, readdirSync, readFileSync, writeFileSync, rmdirSync } from 'fs';
import { join, relative } from 'path';
import { execFileSync } from 'child_process';
import { EVAL, ROOT, PATHS, runDirs } from './_paths.mjs';
const DRY = process.argv.includes('--dry-run');
const lock = join(EVAL, 'scores', '.score_all.lock');
if (!DRY && existsSync(lock) && Date.now() - statSync(lock).mtimeMs < 10 * 60000) { console.log('A scoring run is active (eval/scores/.score_all.lock). Try again when it has finished.'); process.exit(3); }
if (!DRY && existsSync(PATHS.aiCardsV2) && Date.now() - statSync(PATHS.aiCardsV2).mtimeMs < 3 * 60000) { console.log('ai_cards_v2.jsonl changed in the last 3 minutes (card generation running?). Try again later.'); process.exit(3); }
let current = null; try { current = readFileSync(join(ROOT, 'js', 'score-card.js'), 'utf-8').match(/SCORER_VERSION = '([0-9.]+)'/)[1]; } catch { /* ignore */ }

let moved = 0;
const rel = p => relative(EVAL, p).replace(/\\/g, '/');
function move(from, toDir, name = null) {
  const to = join(toDir, name || from.split(/[\\/]/).pop());
  if (!existsSync(from)) return;
  if (existsSync(to)) { console.log(`  skip ${rel(from)}: ${rel(to)} already exists`); return; }
  console.log(`  ${DRY ? 'would move' : 'move'} ${rel(from)} -> ${rel(to)}`);
  if (!DRY) { mkdirSync(toDir, { recursive: true }); renameSync(from, to); } moved++;
}
const rmEmpty = d => { try { if (existsSync(d) && !readdirSync(d).length && !DRY) { rmdirSync(d); console.log(`  removed empty ${rel(d)}/`); } } catch { /* ignore */ } };
const AI = join(EVAL, 'ai-cards'), OLD = join(EVAL, 'old');

// 1. generated cards: flat eval/ or eval/generated/ -> eval/ai-cards/; reparse backups -> old/backups/
const CARD_FILES = ['ai_cards.jsonl', 'ai_cards_invalid_ids.json', 'ai_cards_v2.jsonl', 'ai_cards_v2_errors.jsonl', 'ai_cards_v2_invalid.jsonl'];
for (const src of [EVAL, join(EVAL, 'generated')]) {
  for (const f of CARD_FILES) move(join(src, f), AI);
  if (existsSync(src)) for (const f of readdirSync(src).filter(f => /^ai_cards.*\.bak$/.test(f))) move(join(src, f), join(OLD, 'backups'));
}
for (const f of existsSync(AI) ? readdirSync(AI).filter(f => f.endsWith('.bak')) : []) move(join(AI, f), join(OLD, 'backups'));
rmEmpty(join(EVAL, 'generated'));
// 2. inputs and experiments left flat in eval/
for (const f of ['seeds_jai_2023h1.jsonl', 'gutenberg_eval_600w.jsonl', 'korshuk_cards.jsonl', 'perchance_cards.jsonl']) move(join(EVAL, f), join(EVAL, 'inputs'));
for (const f of ['eval_sample.jsonl', 'eval_parts', 'eval_cards.json', 'eval_cards.log', 'phrase_check.json', 'phrase_check.log']) move(join(EVAL, f), join(EVAL, 'experiments'));
// 3. scores from before runs were versioned -> old/unversioned-scores/
const UNVERSIONED = ['ai_cards_scores.jsonl', 'ai_cards_v2_scores.jsonl', 'botstyle_scores.jsonl', 'gutenberg_botstyle_scores.jsonl', 'gutenberg_upstream_scores.jsonl',
  'jaicards_june2023_scores.jsonl', 'korshuk_scores.jsonl', 'perchance_scores.jsonl', 'raincandy_scores.jsonl', 'spb_scores.jsonl', 'upstream_scores.jsonl'];
for (const src of [EVAL, join(EVAL, 'legacy', 'unversioned-scores')]) for (const f of UNVERSIONED) move(join(src, f), join(OLD, 'unversioned-scores'));
rmEmpty(join(EVAL, 'legacy', 'unversioned-scores')); rmEmpty(join(EVAL, 'legacy'));
// 4. superseded runs -> old/scores/; loose comparison files -> the newer run's folder
if (existsSync(PATHS.scores)) {
  for (const d of readdirSync(PATHS.scores).filter(d => /^v\d/.test(d) && d.slice(1) !== current)) move(join(PATHS.scores, d), PATHS.oldScores);
  for (const f of readdirSync(PATHS.scores).filter(f => /^compare-.*\.txt$/.test(f))) {
    const m = f.match(/^compare-v?([\d.]+)-v?([\d.]+)\.txt$/); const target = m && runDirs().find(r => r.version === m[2]);
    if (target) move(join(PATHS.scores, f), target.dir, `compare-v${m[1]}.txt`);
  }
}
// leftovers
const KNOWN = ['ai-cards', 'inputs', 'experiments', 'scores', 'old', 'README.md'];
const leftovers = readdirSync(EVAL).filter(f => !KNOWN.includes(f));
if (leftovers.length) console.log(`  not sorted (left in eval/): ${leftovers.join(', ')}`);

// 5. docs/: Windows shortcuts to every doc (public and dev-only) so they can all be opened from one folder.
// Windows only (PowerShell); *.lnk is gitignored. Run-specific ones follow the current scorer version.
export const DOC_SHORTCUTS = cur => [
  ['Readme', 'README.md'], ['Documentation (BOTSTYLE)', 'BOTSTYLE.md'], ['Changelog', 'CHANGELOG.md'],
  ['Dev chat log', 'dev/CHATLOG.md'], ['Dev notes', 'dev/NOTES.md'], ['Dev scripts readme', 'dev/README.md'], ['Rescore ideas', 'dev/RESCORE_IDEAS.md'],
  ['Latest AI-model report', `eval/scores/v${cur}/ai-models.md`],
  ['Latest scorer notes', `eval/scores/v${cur}/notes.md`], ['Latest scorer comparison', `eval/scores/v${cur}`, 'compare'],
  ['Latest scorer manifest (SCORER)', `eval/scores/v${cur}/SCORER.md`], ['Eval folder guide', 'eval/README.md'],
  ['Upstream leftovers readme', 'upstream/README.md'],
];
if (!DRY && current && process.platform === 'win32') {
  const ps = [];
  for (const [name, target, kind] of DOC_SHORTCUTS(current)) {
    let t = join(ROOT, ...target.split('/'));
    if (!kind && !existsSync(t)) continue;
    if (kind === 'compare') { const f = existsSync(t) ? readdirSync(t).filter(x => /^compare-v.*\.txt$/.test(x)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop() : null; if (!f) continue; t = join(t, f); }
    const lnk = join(ROOT, 'docs', name + '.lnk').replace(/'/g, "''");
    ps.push(`$s = $w.CreateShortcut('${lnk}'); $s.TargetPath = '${t.replace(/'/g, "''")}'; $s.Save()`);
  }
  try { execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', '$w = New-Object -ComObject WScript.Shell; ' + ps.join('; ')], { stdio: 'ignore' });
    console.log(`  docs/: ${ps.length} shortcuts (latest scorer files -> eval/scores/v${current}/)`); }
  catch (e) { console.log(`  couldn't write the docs shortcuts: ${e.message}`); }
}

// 6. README
const EXPECTED = ['korshuk', 'raincandy_chub', 'perchance', 'spb_ai', 'example_cards', 'foreverse_ai', 'generated_v1', 'generated_v2', 'jaicards'];
const runRows = runDirs().map(({ version: v, dir }) => {
  const have = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.jsonl') && f !== 'run-log.jsonl').map(f => f.replace(/\.jsonl$/, '')) : [];
  const missing = EXPECTED.filter(x => !have.includes(x)), has = f => existsSync(join(dir, f)) ? 'yes' : 'no';
  const cmp = existsSync(dir) ? readdirSync(dir).filter(f => /^compare-/.test(f)).map(f => f.replace(/^compare-|\.txt$/g, '')).join(', ') : '';
  return `| ${rel(dir)}/ | ${v === current ? '**current**' : 'superseded'} | ${missing.length ? `partial (missing ${missing.join(', ')})` : 'complete'} | ${has('SCORER.md')} | ${has('notes.md')} | ${cmp || '–'} |`; });
const readme = `# eval/

Local data for building and testing BBBScorer (not in git). Kept tidy by \`node tools/organize_eval.mjs\`, which
the overnight scoring script runs first (last run ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC).

**Start here:** \`scores/v${current}/notes.md\` (also in \`docs/\` as "Latest scorer notes", with shortcuts to every other doc).

| Folder | What's in it |
|---|---|
| ai-cards/ | AI cards we generated with tools/generate_ai_cards.mjs: \`ai_cards.jsonl\` (run 1), \`ai_cards_v2.jsonl\` (run 2 onwards), and the generator's \`_errors\` / \`_invalid\` logs. Inputs to scoring; scoring never changes them. |
| inputs/ | Generation seeds (JanitorAI 2023 cards) and flattened or cut test sets (Gutenberg 600-word pairs, Korshuk, Perchance). The big card datasets live next to the repo in \`card-datasets/\`. |
| experiments/ | One-off experiments: tools/eval_cards.mjs sample, shards and report; tools/phrase_check.mjs output. Rebuildable. |
| scores/v${current}/ | The run for the current scorer (tools/score_all.mjs), which the page's leaderboard and reference are built from: one .jsonl per dataset, \`notes.md\` (BBBScorer vs the original slop score, read this first), \`compare-v<old>.txt\` (what moved since the previous run), \`summary.json\`, \`progress.log\`, \`run-log.jsonl\`, and \`SCORER.md\` / \`scorer.json\` saying exactly which scorer produced it. |
| old/ | Superseded and kept for reference: \`old/scores/v<version>/\` (earlier runs, same layout), \`old/unversioned-scores/\` (scorers 0.1–0.3, before runs were versioned; don't compare with versioned runs), \`old/backups/\` (stale backups). Safe to delete if space is needed. |

## Scoring runs

| Folder | Scorer | Datasets | SCORER.md | notes.md | Compared with |
|---|---|---|---|---|---|
${runRows.join('\n') || '| – | | | | | |'}

Only the current run feeds the page. Compare two runs with
\`node tools/compare_scores.mjs <old run folder> <new run folder>\`, or \`--previous\` for the current run against the
one before it; SCORER.md in each says what changed.
`;
if (!DRY) writeFileSync(join(EVAL, 'README.md'), readme);
console.log(`${DRY ? 'Would move' : 'Moved'} ${moved} item(s). ${DRY ? '' : 'Wrote eval/README.md.'}`);
