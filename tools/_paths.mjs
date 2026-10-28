// _paths.mjs - Where things live under eval/ (see eval/README.md, written by tools/organize_eval.mjs):
//
//   eval/ai-cards/      AI cards we generated (generate_ai_cards.mjs) and the generator's error / invalid logs
//   eval/inputs/        other inputs: generation seeds, flattened / cut test sets
//   eval/experiments/   one-off experiments (eval_cards.mjs sample and shards, phrase_check.mjs)
//   eval/scores/v<ver>/ the scoring run for the current scorer (score_all.mjs): what the page is built from
//   eval/old/           everything superseded: older runs (old/scores/v<ver>/), pre-versioning scores, stale backups
//
// Each path falls back to its older location while that still exists, so tools work before and after
// organize_eval.mjs has run.
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const EVAL = join(ROOT, 'eval');
const E = (...p) => join(EVAL, ...p);
const first = (...c) => c.find(p => existsSync(p)) || c[0];
const cards = f => first(E('ai-cards', f), E('generated', f), E(f));
export const PATHS = {
  // AI cards we generated (inputs to scoring; never overwritten by scoring)
  aiCardsV1: cards('ai_cards.jsonl'),
  aiCardsV1Invalid: cards('ai_cards_invalid_ids.json'),
  aiCardsV2: cards('ai_cards_v2.jsonl'),
  // other inputs: generation seeds, flattened/cut test sets
  seeds: first(E('inputs', 'seeds_jai_2023h1.jsonl'), E('seeds_jai_2023h1.jsonl')),
  gutenberg600: first(E('inputs', 'gutenberg_eval_600w.jsonl'), E('gutenberg_eval_600w.jsonl')),
  // experiments (eval_cards.mjs, phrase_check.mjs)
  sample: first(E('experiments', 'eval_sample.jsonl'), E('eval_sample.jsonl')),
  parts: first(E('experiments', 'eval_parts'), E('eval_parts')),
  evalCardsReport: E('experiments', 'eval_cards.json'),
  phraseCheck: E('experiments', 'phrase_check.json'),
  // scoring runs: the current one in eval/scores/v<version>/, superseded ones in eval/old/scores/v<version>/
  scores: E('scores'),
  oldScores: E('old', 'scores'),
};
const byVersion = (a, b) => a.localeCompare(b, undefined, { numeric: true });
/** Every scoring-run folder (current and old), oldest first: [{ version, dir }]. */
export function runDirs() {
  const out = [];
  for (const base of [PATHS.oldScores, PATHS.scores]) if (existsSync(base))
    for (const d of readdirSync(base).filter(d => /^v\d/.test(d))) out.push({ version: d.slice(1), dir: join(base, d) });
  return out.sort((a, b) => byVersion(a.version, b.version));
}
/** Folder of the run for one scorer version, wherever it is. */
export const runDir = v => (runDirs().find(r => r.version === v) || { dir: join(PATHS.scores, 'v' + v) }).dir;

// The scorer version the page uses (SCORER_VERSION in js/score-card.js) and its run folder. Tools that build what the page
// shows (leaderboard, reference) default to this folder, not the newest one: a prepared next version (e.g. an opt-in
// 0.9.0 rescore in progress) must not replace the live data.
export const PAGE_SCORER = (readFileSync(join(ROOT, 'js', 'score-card.js'), 'utf-8').match(/SCORER_VERSION = '([0-9.]+)'/) || [])[1];
// relative to the repo (the folder name ends up in data/ files, which are public: no local paths)
export const pageRunDir = () => runDir(PAGE_SCORER).slice(ROOT.length + 1).replace(/\\/g, '/');
