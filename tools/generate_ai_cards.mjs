#!/usr/bin/env node
// generate_ai_cards.mjs - Build a labeled AI side for evaluation: character cards written
// by several models, in each description format, in three ways:
//
//   fresh      from the *concept* of a real human card (name + creator note + tags only)
//   antislop   the same concept, plus instructions not to sound like AI (three strengths)
//   rewrite    the whole human card, handed to the model to polish / improve / expand
//
// Seeds are paired: every model gets the same seed for the same (format, k), fresh and
// antislop share seeds, and rewrites keep the human original next to them, so comparisons
// can hold the character fixed.
//
// Usage:
//   node tools/generate_ai_cards.mjs --models "m1,m2" [--seeds eval/inputs/seeds_jai_2023h1.jsonl]
//        [--modes fresh,antislop,rewrite] [--formats free_prose,default] [--per-style 1]
//        [--out eval/ai-cards/ai_cards_v2.jsonl] [--concurrency 3] [--max-tokens 6000]
//        [--reasoning low] [--temperature 0.8] [--max-usd 2] [--dry-run] [--retry-invalid] [--no-retry]
//
//   --per-style   cards per (model, mode, format). Keep it at 1 until the prompts are settled.
//   --dry-run     list the jobs and print one prompt per mode; no API calls.
//   --max-usd     stop starting new jobs once OpenRouter's reported cost passes this.
//   --reasoning   OpenRouter reasoning effort for thinking models (low keeps cost and the
//                 risk of running out of tokens down); omitted by default. A card whose reasoning
//                 eats the whole budget is retried once at effort=low (--no-retry to skip).
//   --retry-invalid  move cards flagged invalid to <out>_invalid.jsonl and generate them again.
//   --reparse     re-split / re-validate the existing cards with the current parser (no API calls).
//   --failures    list models with failed requests (<out>_errors.jsonl) or no valid cards, then exit.
//   --more        add another round for each model even if its cards exist (same prompts and seeds, new
//                 samples; ids end in |r2, |r3…). --round N fills a specific round instead.
//   --no-score    don't score the new cards when the run finishes (by default it runs
//                 score_all.mjs --only generated_v2 --force, unless another scoring run is active).
// Each card records at (timestamp), elapsed_ms and out_words; failed requests go to <out>_errors.jsonl.
//
// Reads BASE_URL and API_KEY from .env (OpenRouter works). Seeds: JSONL with name / tagline /
// tags / description / first_mes (tools/build_seeds.py makes a clean SFW, pre-Jul-2023 set).
// Output lines work with tools/score_cards.mjs. Each line records the prompt, the raw answer,
// finish reason, token usage and cost, and `valid` + `flags` (refusals, cut-off answers,
// clarifying questions, truncation, missing greeting, "original character inspired by"
// substitutions). Score only valid lines.

// ---------------------------------------------------------------- models (OpenRouter ids)
// Run 1 (eval/ai-cards/ai_cards.jsonl, old prompts, 20 per style, Oct 2026):
//   anthropic/claude-sonnet-4.5, openai/gpt-5-mini
// Run 2 (eval/ai-cards/ai_cards_v2.jsonl, v2 prompts, 1 per cell, Oct 2026):
//   openai/gpt-5-mini, anthropic/claude-sonnet-4.5, deepseek/deepseek-v3.2-exp,
//   moonshotai/kimi-k2-0905, z-ai/glm-4.5, meta-llama/llama-4-maverick
// Run 3 (planned, same file): community roleplay fine-tunes, the scorer's biggest blind spot
// on SlopReview (Gemmasutra, Impish Bloodmoon, Rocinante, Azure Starlight; the first two
// aren't on OpenRouter, so their nearest available relatives are used):
//   thedrummer/rocinante-12b, thedrummer/unslopnemo-12b (trained to avoid slop),
//   thedrummer/cydonia-24b-v4.1, thedrummer/skyfall-36b-v2, sao10k/l3.3-euryale-70b,
//   gryphe/mythomax-l2-13b (the 2023 classic), mistralai/mistral-nemo (base of most 12B RP tunes)
// Run 4 (planned 2026-10-28, dev/generate-cards.cmd): OpenRouter's most-used models in Oct 2026 and GPT-4o:
//   deepseek/deepseek-v4.1-flash, deepseek/deepseek-chat-v3-0324, z-ai/glm-5.3-flash, openai/gpt-6-luna,
//   google/gemini-3.8-flash, tencent/hy4-preview, openai/gpt-4o-2024-11-20; premium anthropic/claude-opus-5.5;
//   plus two more plain-request rounds (--more --modes fresh) for the models with 10-14 plain cards.
// Ids that OpenRouter doesn't serve fail with an HTTP error per card and the run continues.

import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { PATHS } from './_paths.mjs';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { config } from 'dotenv';
config();

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const models = list(args.models);
const DRY = !!args['dry-run'];
if (!models.length && !DRY && !args.reparse && !args.failures) { console.error('need --models "a,b" (or --dry-run)'); process.exit(1); }
const SEEDS = args.seeds || PATHS.seeds;
const PER = Number(args['per-style'] || 1), OUT = args.out || PATHS.aiCardsV2, CONC = Number(args.concurrency || 3);
const MAX_TOKENS = Number(args['max-tokens'] || 6000), TEMP = Number(args.temperature ?? 0.8), MAX_USD = args['max-usd'] ? Number(args['max-usd']) : Infinity;
let url = process.env.BASE_URL || 'https://openrouter.ai/api';
if (!/chat\/completions$/.test(url)) url = url.replace(/\/$/, '') + (/\/v1$/.test(url) ? '' : '/v1') + '/chat/completions';
const KEY = process.env.API_KEY || process.env.OPENAI_API_KEY;
if (!KEY && !DRY && !args.reparse && !args.failures) { console.error('API_KEY missing (.env)'); process.exit(1); }

// ---------------------------------------------------------------- formats
// How people actually ask. {C} is the character's name (see fill()). Phrasings rotate with k.
// W++ and PList share one slot: both are the "compact" family, rare after 2023, and some
// models answer a W++ request with YAML anyway (gpt-5-mini did in 11 of 20 in the first run).
const FORMATS = {
  compact: ['Write a SillyTavern character card for {C} in W++ format. Then write a first message.',
            'Make a character card for {C} using PList format ([Name\'s personality: …; appearance: …]) with a short prose scenario, and a first message.'],
  lists: ['Create a bot for {C}. Use markdown bullet lists for appearance, personality, likes, dislikes and backstory. Include a greeting.'],
  formatted_prose: ['Write a detailed character description for {C} for a roleplay bot, with sections like Appearance, Personality and Backstory. Then write the first message.',
                    'I\'m making a Chub card for {C}. Give me the description (with headers) and an opening message.'],
  free_prose: ['Write a character description for {C} as a few paragraphs of prose, no headers or lists. Then write a first message for the roleplay.',
               'Describe {C} for my JanitorAI bot in plain paragraphs, then write the intro message.'],
  // in-voice split in two: first-person monologue and Ali:Chat interview read differently, and
  // in-voice was the scorer's weakest format in the first run (AUC 0.62 vs ~0.9 elsewhere)
  first_person: ['Write a character card for {C} where the description is written in first person, in the character\'s own voice. Then a first message.'],
  interview: ['Write an interview-style card (Ali:Chat) for {C}: a few Q&A exchanges that show who they are, then a first message.'],
  default: ['make me a character bot for {C}, description and first message'],
};
// antislop runs on the formats most AI-assisted cards use, to keep the matrix small
const ANTISLOP_FORMATS = ['free_prose', 'formatted_prose', 'default'];

// ---------------------------------------------------------------- anti-slop instructions
// Three strengths of "don't sound like AI", modeled on what people paste into prompts:
//   simple   one line, what most people type
//   generic  a general humanizer list (the kind in avoid-ai-writing, blader/humanizer, "de-slop"
//            prompt stacks): punctuation, contrast frames, rule of three, filler, sign-offs
//   rp       a roleplay-specific ban list (Sukino's banned tokens, character-card-skills §7,
//            SloppySeconds): stock beats, purple atmosphere, AI-favorite names, user puppeting
// Written for this tool, not copied from those sources.
const ANTISLOP = {
  simple: 'Make it sound like a real person wrote it, not an AI.',
  generic: `Writing rules (it must not read as AI-written):
- No em dashes. Use commas, periods or parentheses.
- No "not X, but Y" / "it isn't X, it's Y" contrasts, and no groups of three adjectives or clauses for rhythm.
- Skip filler and grand words: tapestry, testament, delve, intricate, palpable, vibrant, unwavering, "a mix of".
- Vary sentence length. Plain words over fancy ones. Contractions are fine.
- No summary or moral at the end, no questions to me, no notes about what you wrote.`,
  rp: `Anti-slop rules for roleplay writing:
- Banned stock phrases: "barely above a whisper", "a shiver down her spine", "eyes sparkling with mischief", "a smirk playing on her lips", "the air was thick with", "ozone", "a mix of X and Y", "practiced ease", "a hint of", "a testament to", "maybe, just maybe", "for what felt like an eternity", "knuckles white", "breath hitched", "ministrations".
- No "not X, but Y" constructions and no em dashes.
- Don't use model-favorite names (Elara, Lyra, Kael, Seraphina, Aria, Silas, Vance, Thorne, Voss, Elias). If the character has a name, keep it.
- Concrete, specific details instead of mood words. Let the character sound like a person, with quirks and loose ends, not a polished summary.
- Never write {{user}}'s actions, words or feelings. End the greeting on something the character does, not "What will you do?".`,
};

// ---------------------------------------------------------------- rewrite requests
// The human card is pasted in full. Three kinds of request, light to heavy.
const REWRITE = {
  polish: 'Can you clean up this character card? Fix grammar and spelling and make it read better, but keep my style and don\'t change the character.',
  improve: 'Improve this character card so it\'s more engaging and immersive for roleplay. Keep the same character.',
  expand: 'Expand this bot\'s description and first message with more detail and depth.',
};

const FORMAT_SUFFIX = '\n\nFormat your answer as:\n### DESCRIPTION\n…\n### FIRST MESSAGE\n…';

function cleanName(n) { return String(n || '').replace(/[\(\[][^)\]]*(?:r-?18|nsfw|18\+|lewd)[^)\]]*[\)\]]/gi, '').replace(/\s*-\s*r-?18\+?/gi, '').replace(/\s+/g, ' ').trim(); }
// {C} becomes the name; what else the seed's creator said about them goes on its own line,
// the way people paste a concept ("Brett Hand. Yes-man, very optimistic. Tags: …").
function conceptParts(r) {
  const tags = (Array.isArray(r.tags) ? r.tags : String(r.tags || r.topics || '').replace(/[\[\]"']/g, '').split(',')).map(t => String(t).trim())
    .filter(t => t && !/^(?:tavern|root|sfw|nsfw|male|female|oc|scenario|multiple|fictional)$/i.test(t)).slice(0, 6);
  const tagline = String(r.tagline || r.creator_notes || '').replace(/\([^()]*\bns(?:fw|vv|fvv)\b[^()]*\)|\bns(?:fw|vv|fvv)\b/gi, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const name = cleanName(r.name || r.card_name) || 'an original character';
  const about = [tagline && `About them: ${tagline}`, tags.length && `Tags: ${tags.join(', ')}`].filter(Boolean).join('\n');
  return { name, about };
}
function fill(template, seed) {
  const { name, about } = conceptParts(seed);
  return template.replace('{C}', name) + (about ? '\n\n' + about : '');
}
function cardText(r) {
  const parts = [`Name: ${cleanName(r.name)}`, `Description:\n${r.description || ''}`];
  if (String(r.personality || '').trim()) parts.push(`Personality:\n${r.personality}`);
  if (String(r.scenario || '').trim()) parts.push(`Scenario:\n${r.scenario}`);
  parts.push(`First message:\n${r.first_mes || ''}`);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- API
async function ask(model, prompt, over = {}) {
  const body = { model, temperature: TEMP, max_tokens: over.maxTokens || MAX_TOKENS, usage: { include: true }, messages: [{ role: 'user', content: prompt }] };
  const effort = over.reasoning || args.reasoning;
  if (effort) body.reasoning = { effort: String(effort) };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      const c = j.choices && j.choices[0];
      if (!c) throw new Error('no choices: ' + JSON.stringify(j).slice(0, 200));
      return { text: c.message && c.message.content || '', finish: c.finish_reason || c.native_finish_reason || null, usage: j.usage || null, provider: j.provider || null, gen_id: j.id || null };
    } catch (e) { lastErr = e; await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- parse + validate
function split(raw) {
  const t = String(raw || '');
  // '### DESCRIPTION', 'DESCRIPTION:', '**Description**' ... (MythoMax drops the ###)
  const m = t.match(/^[ \t]*(?:#{1,3}[ \t]*)?\**[ \t]*DESCRIPTION[ \t]*\**[ \t]*:?[ \t]*\**[ \t]*$/im);
  const preamble = m ? t.slice(0, m.index).trim() : '';
  const body = m ? t.slice(m.index + m[0].length) : t;
  const g = body.match(/^[ \t]*(?:#{1,3}[ \t]*)?\**[ \t]*FIRST MESSAGE[ \t]*\**[ \t]*:?[ \t]*\**[ \t]*$/im);
  const description = (g ? body.slice(0, g.index) : body).trim();
  let first_mes = g ? body.slice(g.index + g[0].length).trim() : '';
  // trailing notes after the greeting ("---\nNotes: …", "### Tips") are the model talking to the
  // requester; a creator would not paste them into the card
  let postscript = '';
  const ps = first_mes.match(/\n\s*(?:-{3,}|\*{3,}|_{3,}|#{1,3}\s*(?:notes?|tips?|usage|author'?s? notes?|creator'?s? notes?)\b)[^\n]*\n[\s\S]*$/i);
  if (ps) { postscript = first_mes.slice(ps.index).trim(); first_mes = first_mes.slice(0, ps.index).trim(); }
  return { description, first_mes, preamble, postscript, headers_found: !!m };
}

const REFUSAL = /^\W*(?:i['’]?m sorry|sorry|i can(?:not|['’]t)|i won['’]?t|i['’]?m not able|i am not able|i['’]?m unable|i am unable)\b/i;
function validate(raw, parts, finish) {
  const flags = [];
  const t = String(raw || '').trim();
  if (!t) flags.push('empty');
  if (REFUSAL.test(t) && !parts.headers_found) flags.push('refusal');
  if (/i['’]?m sorry,? but i (?:can(?:not|['’]t)|won['’]t) (?:assist|help|continue|comply) with (?:that|this)(?: request)?\.?\s*$/i.test(t) && t.length > 200) flags.push('cut_off');
  if (!parts.headers_found && /\?\s*\)?\s*$/.test(t) && t.length < 1500) flags.push('asked_question');
  if (finish === 'length' || finish === 'max_tokens') flags.push(t ? 'truncated' : 'reasoning_exhausted');
  if (finish === 'content_filter') flags.push('content_filter');   // soft: OpenAI sometimes flags complete answers
  if (parts.headers_found && !parts.first_mes) flags.push('no_greeting');
  if (!parts.headers_found && !flags.length) flags.push('no_headers');
  // soft flags: kept valid, but worth knowing about
  if (/(?:can['’]?t|cannot|won['’]?t) (?:write|reproduce|use) (?:in )?(?:the )?(?:exact )?(?:voice|words|likeness) of|original (?:character|card|version)[^.\n]{0,40}(?:inspired by|that captures)|copyright/i.test(parts.preamble + ' ' + t.slice(0, 400))) flags.push('substituted');
  if (/\b(?:non-?explicit|suggestive \(non|can['’]?t create explicit)/i.test(parts.preamble)) flags.push('toned_down');
  if (parts.preamble && !/^#+\s|^\**[\w' ]{0,60}(?:card|bot|profile)\**$/i.test(parts.preamble)) flags.push('has_preamble');
  if (parts.postscript) flags.push('has_postscript');
  const hard = ['empty', 'refusal', 'cut_off', 'asked_question', 'truncated', 'reasoning_exhausted', 'no_greeting', 'no_headers'];
  return { valid: !flags.some(f => hard.includes(f)), flags };
}

// ---------------------------------------------------------------- jobs
if (args.failures) {
  const cards = existsSync(OUT) ? readFileSync(OUT, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const errs = existsSync(OUT.replace(/\.jsonl$/, '') + '_errors.jsonl') ? readFileSync(OUT.replace(/\.jsonl$/, '') + '_errors.jsonl', 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  const by = {};
  for (const c of cards) { const b = by[c.model] = by[c.model] || { cards: 0, valid: 0, errors: 0, flags: {} }; b.cards++; if (c.valid) b.valid++; for (const f of c.flags || []) b.flags[f] = (b.flags[f] || 0) + 1; }
  for (const e of errs) { const b = by[e.model] = by[e.model] || { cards: 0, valid: 0, errors: 0, flags: {} }; b.errors++; b.lastError = e.error; }
  for (const m of models) if (!by[m]) by[m] = { cards: 0, valid: 0, errors: 0, flags: {}, note: 'nothing recorded (run predates the error log?)' };
  for (const [m, b] of Object.entries(by).sort()) console.log(`${b.valid ? 'ok  ' : 'FAIL'} ${m}: ${b.cards} cards, ${b.valid} valid, ${b.errors} failed requests${Object.keys(b.flags).length ? ' ' + JSON.stringify(b.flags) : ''}${b.lastError ? ' | ' + b.lastError.slice(0, 120) : ''}${b.note ? ' | ' + b.note : ''}`);
  process.exit(0);
}
const seeds = readFileSync(SEEDS, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.name || r.card_name);
if (!seeds.length) { console.error('no seeds in ' + SEEDS); process.exit(1); }
const pick = key => seeds[parseInt(createHash('sha1').update(key).digest('hex').slice(0, 8), 16) % seeds.length];

const MODES = list(args.modes || 'fresh,antislop,rewrite');
const FMT = args.formats ? list(args.formats) : Object.keys(FORMATS);
for (const f of FMT) if (!FORMATS[f]) { console.error(`unknown format ${f}; known: ${Object.keys(FORMATS).join(', ')}`); process.exit(1); }
const plan = [];   // { mode, variant, format, k, seed, prompt }
for (let k = 0; k < PER; k++) {
  if (MODES.includes('fresh')) for (const f of FMT) {
    const seed = pick(`concept|${f}|${k}`);
    plan.push({ mode: 'fresh', variant: '', format: f, k, seed, prompt: fill(FORMATS[f][k % FORMATS[f].length], seed) + FORMAT_SUFFIX });
  }
  if (MODES.includes('antislop')) for (const f of FMT.filter(x => ANTISLOP_FORMATS.includes(x))) for (const [v, rules] of Object.entries(ANTISLOP)) {
    const seed = pick(`concept|${f}|${k}`);   // same seed as the fresh card of this format
    plan.push({ mode: 'antislop', variant: v, format: f, k, seed, prompt: fill(FORMATS[f][k % FORMATS[f].length], seed) + '\n\n' + rules + FORMAT_SUFFIX });
  }
  if (MODES.includes('rewrite')) for (const [v, req] of Object.entries(REWRITE)) {
    const seed = pick(`rewrite|${k}`);        // the three rewrite kinds share the human original
    plan.push({ mode: 'rewrite', variant: v, format: 'as_original', k, seed, prompt: req + '\n\n' + cardText(seed) + FORMAT_SUFFIX });
  }
}
// --reparse: re-split and re-validate the cards already in OUT with the current parser (no API calls),
// e.g. after the parser learns a new heading style. Rewrites OUT in place (backup: OUT.bak).
if (args.reparse) {
  const lines = readFileSync(OUT, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  writeFileSync(OUT + '.bak', lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  let fixed = 0;
  for (const r of lines) {
    const parts = split(r.raw); const v = validate(r.raw, parts, r.finish_reason);
    if (v.valid !== r.valid) fixed++;
    Object.assign(r, { description: parts.description, first_mes: parts.first_mes, preamble: parts.preamble, postscript: parts.postscript, valid: v.valid, flags: v.flags.concat((r.flags || []).filter(f => f === 'retried_low_reasoning')) });
  }
  writeFileSync(OUT, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  console.log(`reparsed ${lines.length} cards in ${OUT}; ${fixed} changed validity (backup ${OUT}.bak)`);
  process.exit(0);
}
if (args['retry-invalid'] && existsSync(OUT) && !DRY) {
  const lines = readFileSync(OUT, 'utf-8').split('\n').filter(Boolean);
  const keep = lines.filter(l => JSON.parse(l).valid !== false), drop = lines.filter(l => JSON.parse(l).valid === false);
  if (drop.length) {
    appendFileSync(OUT.replace(/\.jsonl$/, '') + '_invalid.jsonl', drop.join('\n') + '\n');
    writeFileSync(OUT, keep.length ? keep.join('\n') + '\n' : '');
    console.log(`--retry-invalid: moved ${drop.length} invalid card(s) to ${OUT.replace(/\.jsonl$/, '')}_invalid.jsonl; they'll be regenerated`);
  }
}
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
// Rounds: round 1 ids have no suffix; later rounds end in |r2, |r3… --more adds the next round for each model
// (one past the highest it already has); --round N fills round N. Same prompts and seeds, new samples.
const roundOf = id => { const m = /\|r(\d+)$/.exec(id); return m ? +m[1] : 1; };
const lastRound = model => Math.max(0, ...[...done].filter(id => id.startsWith(model + '|')).map(roundOf));
const jobs = [];
for (const model of (models.length ? models : ['(dry-run)'])) {
  const round = args.round ? Number(args.round) : args.more ? Math.max(1, lastRound(model) + 1) : 1;
  for (const p of plan) {
    const id = [model, p.mode, p.variant, p.format, p.k].join('|') + (round > 1 ? `|r${round}` : '');
    if (!done.has(id)) jobs.push({ id, model, round, ...p });
  }
}
if (args.more || args.round) console.log('rounds: ' + [...new Set(jobs.map(j => `${j.model} r${j.round}`))].join(', '));

console.log(`${plan.length} prompts × ${models.length || 1} model(s) = ${jobs.length} cards to generate (skipping ${done.size} already in ${OUT})`);
const byMode = {};
for (const j of jobs) byMode[j.mode + (j.variant ? ':' + j.variant : '')] = (byMode[j.mode + (j.variant ? ':' + j.variant : '')] || 0) + 1;
console.log('  ' + Object.entries(byMode).map(([k, v]) => `${k} ${v}`).join(', '));
if (DRY) {
  const shown = new Set();
  for (const j of jobs) {
    const key = j.mode + j.variant;
    if (shown.has(key)) continue; shown.add(key);
    console.log(`\n=== ${j.mode}${j.variant ? ':' + j.variant : ''} / ${j.format} / seed "${j.seed.name}" ===\n${j.prompt.slice(0, 1200)}${j.prompt.length > 1200 ? '\n…' : ''}`);
  }
  process.exit(0);
}

let n = 0, bad = 0, spent = 0;
const modelErrors = {};   // consecutive request errors per model; 3 in a row skips that model
async function worker() {
  while (jobs.length) {
    if (spent >= MAX_USD) { console.log(`  stopping: reported cost $${spent.toFixed(3)} reached --max-usd`); jobs.length = 0; break; }
    const j = jobs.shift();
    if ((modelErrors[j.model] || 0) >= 3) continue;
    try {
      const t0 = Date.now();
      let res = await ask(j.model, j.prompt);
      let parts = split(res.text);
      let v = validate(res.text, parts, res.finish);
      let cost = res.usage && typeof res.usage.cost === 'number' ? res.usage.cost : 0;
      // A thinking model that spends the whole budget reasoning returns nothing (GLM-4.5 did, with
      // 6,000 reasoning tokens). Retry once with low reasoning effort and twice the budget.
      if (v.flags.includes('reasoning_exhausted') && !args['no-retry']) {
        console.log(`  retry ${j.id}: reasoning used the whole budget, trying effort=low, ${MAX_TOKENS * 2} tokens`);
        res = await ask(j.model, j.prompt, { reasoning: 'low', maxTokens: MAX_TOKENS * 2 });
        parts = split(res.text); v = validate(res.text, parts, res.finish); v.flags.push('retried_low_reasoning');
        if (res.usage && typeof res.usage.cost === 'number') cost += res.usage.cost;
      }
      cost = cost || null;
      if (cost) spent += cost;
      appendFileSync(OUT, JSON.stringify({
        id: j.id, round: j.round || 1, createdAt: 'generated', model: j.model, mode: j.mode, variant: j.variant, style_requested: j.format, k: j.k,
        seed_id: j.seed.id, seed_name: j.seed.name || j.seed.card_name, prompt: j.prompt,
        description: parts.description, first_mes: parts.first_mes, preamble: parts.preamble, postscript: parts.postscript,
        raw: res.text, finish_reason: res.finish, usage: res.usage, cost, provider: res.provider, gen_id: res.gen_id,
        at: new Date().toISOString(), elapsed_ms: Date.now() - t0, out_words: (res.text.match(/[A-Za-z']+/g) || []).length,
        valid: v.valid, flags: v.flags, source: 'AI',
      }) + '\n');
      n++; if (!v.valid) bad++; modelErrors[j.model] = 0;
      console.log(`  ${v.valid ? 'ok ' : 'BAD'} ${j.id}${v.flags.length ? ' [' + v.flags.join(',') + ']' : ''}${cost ? ` $${cost.toFixed(4)}` : ''}`);
    } catch (e) {
      console.error(`  ERR ${j.id}: ${e.message}`);
      // failed requests are logged so failed models can be listed later (node tools/generate_ai_cards.mjs --failures)
      appendFileSync(OUT.replace(/\.jsonl$/, '') + '_errors.jsonl', JSON.stringify({ at: new Date().toISOString(), id: j.id, model: j.model, error: String(e.message).slice(0, 300) }) + '\n');
      if ((modelErrors[j.model] = (modelErrors[j.model] || 0) + 1) === 3) console.error(`  skipping the rest of ${j.model}: 3 failed requests in a row (wrong id or unavailable?)`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`finished: ${n} written to ${OUT} (${bad} flagged invalid); reported cost $${spent.toFixed(3)}`);

// Score the new cards straight away (BBBScorer + original formula), unless --no-score or nothing was written.
// score_all refuses to start while another scoring run is active (exit code 3), so they never collide.
const DATASET_FOR = { 'ai_cards_v2.jsonl': 'generated_v2', 'ai_cards.jsonl': 'generated_v1' };
const dsName = DATASET_FOR[OUT.replace(/\\/g, '/').split('/').pop()];
if (n > 0 && !args['no-score'] && dsName) {
  console.log(`\nscoring ${dsName} with the current scorer…`);
  const { spawnSync } = await import('child_process');
  const r = spawnSync(process.execPath, ['tools/score_all.mjs', '--only', dsName, '--force'], { stdio: 'inherit' });
  if (r.status === 3) console.log(`Not scored now: another scoring run is active. Run later: node tools/score_all.mjs --only ${dsName} --force`);
} else if (n > 0 && !dsName) console.log(`(not scored automatically: ${OUT} isn't one of the scored datasets)`);
