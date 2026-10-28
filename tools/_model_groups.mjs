// _model_groups.mjs - Models kept off the ranked leaderboard, shared by the card generator and the leaderboard builder.
//
// FAILED: models whose cards mostly fail the format checks (no section headers, no greeting, cut off mid-loop), so
// what's left isn't a fair sample. The generator skips them unless --include-failed; the leaderboard shows them under
// "Just for fun" with a failed mark.
// JUST_FOR_FUN: models that work but weren't made for writing cards, so ranking them isn't fair.
export const FAILED = {
  'gryphe/mythomax-l2-13b': 'ignores the output format: most cards have no section headers or no greeting',
  'nousresearch/hermes-3-llama-3.1-70b': 'loops: most cards run on until they are cut off',
  'aion-labs/aion-rp-llama-3.1-8b': 'about 40% of its cards fail the format checks (no headers or no greeting)',
};
export const JUST_FOR_FUN = {
  'thedrummer/unslopnemo-12b': 'tuned to strip stock phrasing from RP chat, not to write cards',
  'mistralai/mistral-nemo': 'base model of UnslopNemo',
};
