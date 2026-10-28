// _paths.mjs - Where things live under eval/ (see eval/README.md). Each path falls back to its pre-reorganisation
// location while that still exists, so tools work before and after tools/organize_eval.mjs is run.
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const EVAL = join(ROOT, 'eval');
const pick = (now, before) => (existsSync(now) || !existsSync(before) ? now : before);
const E = (...p) => join(EVAL, ...p);
export const PATHS = {
  // AI cards we generated (inputs to scoring; never overwritten by scoring)
  aiCardsV1: pick(E('generated', 'ai_cards.jsonl'), E('ai_cards.jsonl')),
  aiCardsV1Invalid: pick(E('generated', 'ai_cards_invalid_ids.json'), E('ai_cards_invalid_ids.json')),
  aiCardsV2: pick(E('generated', 'ai_cards_v2.jsonl'), E('ai_cards_v2.jsonl')),
  // other inputs: generation seeds, flattened/cut test sets
  seeds: pick(E('inputs', 'seeds_jai_2023h1.jsonl'), E('seeds_jai_2023h1.jsonl')),
  gutenberg600: pick(E('inputs', 'gutenberg_eval_600w.jsonl'), E('gutenberg_eval_600w.jsonl')),
  // experiments (eval_cards.mjs, phrase_check.mjs)
  sample: pick(E('experiments', 'eval_sample.jsonl'), E('eval_sample.jsonl')),
  parts: pick(E('experiments', 'eval_parts'), E('eval_parts')),
  evalCardsReport: E('experiments', 'eval_cards.json'),
  phraseCheck: E('experiments', 'phrase_check.json'),
  // versioned scoring runs: eval/scores/v<version>/
  scores: E('scores'),
};
