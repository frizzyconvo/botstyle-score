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
  'microsoft/phi-4': 'a small general model trained mostly on synthetic textbook-style data, not one people use for roleplay or card writing',
};

// HOLDOUT: models whose cards are a test set only (eval/ai-cards/ai_cards_holdout.jsonl, dev\generate-cards-holdout.cmd).
// Chosen from model families the card lists were never mined from. mine_card_lists.mjs never uses them, even if their
// cards end up in another file. The note says how close each is to a mined family (fine-tune bases count).
const HO = (note, ...ids) => Object.fromEntries(ids.map(id => [id, note]));
export const HOLDOUT = {
  ...HO('related: one mined model (Magnum v4 72B) is a Qwen 2.5 fine-tune', 'qwen/qwen3.8-flash', 'qwen/qwen3.7-flash', 'qwen/qwen3.8-27b', 'qwen/qwen3.8-max-0902'),
  ...HO('unseen family', 'minimax/minimax-m3.1-flash', 'minimax/minimax-m3', 'nvidia/nemotron-3.5-lightning', 'nvidia/nemotron-3-ultra-550b-a55b',
    'stepfun/step-3.5-flash', 'stepfun/step-5-preview', 'xiaomi/mimo-v2.6-flash', 'xiaomi/mimo-v2.6-pro', 'bytedance-seed/seed-2.0-mini',
    'bytedance-seed/seed-2-1-turbo', 'upstage/solar-pro4', 'inclusionai/ling-3.1-flash', 'amazon/nova-lite-v1', 'amazon/nova-pro-v1',
    'ibm-granite/granite-4.2-8b', 'liquid/lfm-2.5-24b-a2b', 'inception/mercury-3', 'cohere/command-r7b-12-2024', 'cohere/command-a-plus',
    'meituan/longcat-2.0', 'thinkingmachines/inkling-small', 'thinkingmachines/inkling', 'x-ai/grok-4.3', 'x-ai/grok-4.7', 'writer/palmyra-x5'),
  ...HO('same lab as a mined family (Meta Llama), different model line', 'meta/muse-glimmer-30b', 'meta/muse-spark-1.3'),
};
// FAMILY: base family of a model, for leave-one-family-out tests (fine-tunes count as their base model's family).
const BASE = {
  'anthracite-org/magnum-v4-72b': 'qwen', 'sao10k/l3-lunaris-8b': 'llama', 'sao10k/l3.1-euryale-70b': 'llama',
  'nousresearch/hermes-4-405b': 'llama', 'aion-labs/aion-rp-llama-3.1-8b': 'llama', 'nousresearch/hermes-3-llama-3.1-70b': 'llama',
  'thedrummer/cydonia-24b-v4.1': 'mistral', 'thedrummer/skyfall-36b-v2': 'mistral', 'thedrummer/unslopnemo-12b': 'mistral',
  'gryphe/mythomax-l2-13b': 'llama', 'microsoft/phi-4': 'phi', 'tencent/hy4-preview': 'hunyuan',
};
const LAB = { 'meta-llama': 'llama', mistralai: 'mistral', 'z-ai': 'glm', moonshotai: 'kimi', anthropic: 'claude', openai: 'gpt', 'bytedance-seed': 'seed' };
export function FAMILY(model) {
  const m = String(model || '').toLowerCase(); if (BASE[m]) return BASE[m];
  const lab = m.split('/')[0], name = m.split('/')[1] || '';
  if (lab === 'google') return name.startsWith('gemma') ? 'gemma' : 'gemini';
  return LAB[lab] || lab;
}
// Display name of a model's family for the leaderboard tag ("l3.1-euryale-70b [Llama]"). Fine-tunes show their base
// model's family (BASE above). Unknown labs fall back to the lab name.
const FAMILY_NAMES = { claude: 'Claude', gpt: 'GPT', gemini: 'Gemini', gemma: 'Gemma', llama: 'Llama', qwen: 'Qwen', mistral: 'Mistral',
  deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM', hunyuan: 'Hunyuan', phi: 'Phi', xiaomi: 'MiMo', nvidia: 'Nemotron', minimax: 'MiniMax',
  stepfun: 'Step', seed: 'Seed', 'x-ai': 'Grok', cohere: 'Command', amazon: 'Nova', 'ibm-granite': 'Granite', liquid: 'LFM',
  inception: 'Mercury', inclusionai: 'Ling', meituan: 'LongCat', thinkingmachines: 'Inkling', writer: 'Palmyra', upstage: 'Solar', meta: 'Muse' };
export function familyLabel(model) { const f = FAMILY(model); return FAMILY_NAMES[f] || (f ? f[0].toUpperCase() + f.slice(1) : ''); }
