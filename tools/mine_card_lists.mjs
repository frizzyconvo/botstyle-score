#!/usr/bin/env node
// mine_card_lists.mjs - Mine AI-favored words and phrases from the character cards we generated, against 2023 cards
// (mostly human). The scored lists (tools/build_lists.py) come from 22 models' *stories*; this finds what models do in
// *cards*, with every model counted equally (each model's share of cards using an item is averaged, so a model with
// 120 cards doesn't outvote one with 20). That way the models the story lists never saw count as much as the ones
// they did.
//
//   node tools/mine_card_lists.mjs [--human eval/experiments/v090_sample.jsonl] [--out data/botstyle_card_lists.json]
//        [--models-include a,b] [--models-exclude a,b] [--min-models 3] [--min-seeds 6] [--min-ratio 3]
//
// AI side: eval/ai-cards/ai_cards_v2.jsonl + ai_cards.jsonl, valid cards, plain and "don't sound like AI" requests
// (rewrites are left out: they contain the human original), default sampling only, failed models left out.
// Human side: the "human" rows of --human (description + first message), e.g. the fixed 0.9.0 evaluation sample.
// Topic filter: an item must turn up in cards about at least --min-seeds different characters, no one character may
// account for more than 35% of the cards using it (55% for the top two), and a card's own request words (name, creator
// note, tags) never count for that card, so "piranha" from one Petey Piranha prompt can't become slop.
// Items capitalized mid-sentence 90%+ of the time go to `names` (unscored candidates).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
globalThis.fetch = async u => ({ ok: existsSync(join(ROOT, u.replace(/^\.\//, ''))), json: async () => JSON.parse(readFileSync(join(ROOT, u.replace(/^\.\//, '')), 'utf-8')) });
const { preprocessCard } = await import('../js/card-preprocess.js');
const B = await import('../js/botstyle.js');
await B.loadBotstyle('./data/');
const { FAILED } = await import('./_model_groups.mjs');

const readJsonl = p => existsSync(p) ? readFileSync(p, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const nonDefault = id => /\|(?:t|mp)\d[\d.]*(?:\||$)/.test(String(id || ''));
export function loadAiCards() {
  const bad = (() => { try { return new Set(JSON.parse(readFileSync(join(ROOT, 'eval/ai-cards/ai_cards_invalid_ids.json'), 'utf-8'))); } catch { return new Set(); } })();
  const v1 = readJsonl(join(ROOT, 'eval/ai-cards/ai_cards.jsonl')).filter(c => c.valid !== false && !bad.has(c.id)).map(c => ({ ...c, mode: c.mode || 'fresh', seed: c.seed_name }));
  const v2 = readJsonl(join(ROOT, 'eval/ai-cards/ai_cards_v2.jsonl')).filter(c => c.valid).map(c => ({ ...c, seed: c.seed_id || c.seed_name }));
  return [...v1, ...v2].filter(c => (c.mode === 'fresh' || c.mode === 'antislop') && !nonDefault(c.id) && !FAILED[c.model]);
}
// One card -> sets of items (words, two- and three-word phrases, the same tokens the scorer uses) + name-like casing.
export function cardItems(c) {
  const prose = preprocessCard((c.description || '') + '\n\n' + (c.first_mes || '')).prose;
  // words from this card's own request (the character's name, creator note and tags) never count for this card
  const own = new Set(B.ngramTokens(String(c.prompt || '').replace(/Format your answer as:[\s\S]*$/, '')));
  const t = B.ngramTokens(prose), w = new Set(t.filter(x => !own.has(x))), bi = new Set(), tri = new Set();
  for (let i = 0; i + 1 < t.length; i++) if (!own.has(t[i]) && !own.has(t[i + 1])) bi.add(t[i] + ' ' + t[i + 1]);
  for (let i = 0; i + 2 < t.length; i++) if (!own.has(t[i]) && !own.has(t[i + 1]) && !own.has(t[i + 2])) tri.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
  const caps = new Map(); for (const m of prose.matchAll(/(?<![.!?"“*]\s|^)\b([A-Z][a-z]+)\b/gm)) caps.set(m[1].toLowerCase(), (caps.get(m[1].toLowerCase()) || 0) + 1);
  return { w, bi, tri, nWords: (prose.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length, caps };
}
const topicWords = c => new Set(String((c.seed_name || c.name || '') + ' ' + (Array.isArray(c.tags) ? c.tags.join(' ') : '')).toLowerCase().match(/[a-z]+/g) || []);
/** ai: [{ model, seed, items, topic }], human: [{ items }] -> lists */
export function mine(ai, human, o = {}) {
  const MINM = o.minModels ?? 3, MINS = o.minSeeds ?? 6, MINR = o.minRatio ?? 3, MINCARDS = o.minCards ?? 12;
  const byModel = new Map(); for (const c of ai) { if (!byModel.has(c.model)) byModel.set(c.model, []); byModel.get(c.model).push(c); }
  const models = [...byModel.entries()].filter(([, a]) => a.length >= MINCARDS);
  const out = {};
  for (const kind of ['w', 'bi', 'tri']) {
    const hdf = new Map(); for (const h of human) for (const x of h.items[kind]) hdf.set(x, (hdf.get(x) || 0) + 1);
    const per = new Map();   // item -> { shares: [], seeds: Set, topical }
    for (const [m, cards] of models) {
      const df = new Map(); for (const c of cards) for (const x of c.items[kind]) df.set(x, (df.get(x) || 0) + 1);
      for (const [x, n] of df) { const e = per.get(x) || { sum: 0, models: 0, seeds: new Set(), cap: 0, low: 0 }; const s = n / cards.length; e.sum += s; per.set(x, e); }
    }
    // seed spread: how many cards about each character use the item (a word from one prompt's premise piles up there)
    for (const c of ai) for (const x of c.items[kind]) { const e = per.get(x); if (e) { e.seeds.add(c.seed); (e.bySeed = e.bySeed || new Map()).set(c.seed, (e.bySeed.get(c.seed) || 0) + 1); } }
    const rows = [];
    for (const [x, e] of per) {
      const aiMacro = e.sum / models.length, h = (hdf.get(x) || 0) / human.length;
      if (aiMacro < 0.012 || e.seeds.size < MINS) continue;
      const counts = [...e.bySeed.values()].sort((a, b) => b - a), tot = counts.reduce((a, b) => a + b, 0);
      if (counts[0] / tot > (o.maxSeedShare ?? 0.35) || (counts[0] + (counts[1] || 0)) / tot > (o.maxTop2Share ?? 0.55)) continue;
      let strong = 0; for (const [, cards] of models) { const n = cards.filter(c => c.items[kind].has(x)).length / cards.length; if (n >= 0.02 && n >= 2 * h) strong++; }
      const ratio = (aiMacro + 0.0005) / (h + 0.0005);
      if (strong < MINM || ratio < MINR) continue;
      if (x.split(' ').some(t => o.topic && o.topic.has(t))) continue;
      rows.push([x, +Math.max(0.5, Math.min(4, Math.log2(ratio / 2))).toFixed(3), +(100 * aiMacro).toFixed(2), +(100 * h).toFixed(3), strong, e.seeds.size]);
    }
    rows.sort((a, b) => b[1] - a[1] || b[2] - a[2]);
    out[kind] = rows;
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('mine_card_lists.mjs')) {
  const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const t0 = Date.now();
  const inc = opt('--models-include') ? new Set(opt('--models-include').split(',')) : null, exc = new Set((opt('--models-exclude') || '').split(',').filter(Boolean));
  const aiRaw = loadAiCards().filter(c => (!inc || inc.has(c.model)) && !exc.has(c.model));
  const topic = new Set(); for (const c of aiRaw) for (const t of topicWords(c)) topic.add(t);
  const ai = aiRaw.map(c => ({ model: c.model, seed: c.seed, items: cardItems(c) }));
  console.log(`characters (seeds) behind the AI cards: ${new Set(aiRaw.map(c => c.seed)).size}`);
  // --human-every 2: use every 2nd human card, so the other half stays unseen for setting cut-offs and testing
  const every = +opt('--human-every', 1);
  const human = readJsonl(resolve(opt('--human', join(ROOT, 'eval/experiments/v090_sample.jsonl')))).filter(r => r.set === 'human').filter((_, i) => i % every === 0).map(r => ({ items: cardItems(r) }));
  const L = mine(ai, human, { minModels: +opt('--min-models', 3), minSeeds: +opt('--min-seeds', 6), minRatio: +opt('--min-ratio', 3), topic });
  // known = already in the story-built lists; name-like words split off
  const known = { w: B.botstyleLoaded() ? null : null };
  const words = JSON.parse(readFileSync(join(ROOT, 'data/botstyle_words.json'), 'utf-8')), bis = JSON.parse(readFileSync(join(ROOT, 'data/botstyle_bigrams.json'), 'utf-8')), tris = JSON.parse(readFileSync(join(ROOT, 'data/botstyle_trigrams.json'), 'utf-8'));
  const K = { w: new Set(words.map(r => r[0])), bi: new Set(bis.map(r => r[0])), tri: new Set(tris.map(r => r[0])) };
  const capShare = new Map(); for (const c of ai) for (const [x, n] of c.items.caps) capShare.set(x, (capShare.get(x) || 0) + n);
  const wordCount = new Map(); for (const c of aiRaw) for (const x of ((c.description || '') + ' ' + (c.first_mes || '')).toLowerCase().match(/[a-z]+/g) || []) wordCount.set(x, (wordCount.get(x) || 0) + 1);
  const names = L.w.filter(r => (capShare.get(r[0]) || 0) >= 0.9 * (wordCount.get(r[0]) || 1));
  const nameSet = new Set(names.map(r => r[0]));
  const tag = (rows, k) => rows.filter(r => k !== 'w' || !nameSet.has(r[0])).map(r => [...r, K[k].has(r[0]) ? 'known' : 'new']);
  const res = { about: 'Words and phrases AI-written character cards use far more than 2023 cards (mostly human), mined from our generated cards with every model counted equally (tools/mine_card_lists.mjs). Columns: item, weight (log2 of ratio/2, 0.5-4), % of cards using it (AI, averaged over models), % of human cards, models where it is 2x+ more common, distinct characters it appears with, known (already in the story-built lists) or new.',
    built: new Date().toISOString().slice(0, 10), models: [...new Set(ai.map(c => c.model))].sort(), aiCards: ai.length, humanCards: human.length,
    settings: { minModels: +opt('--min-models', 3), minSeeds: +opt('--min-seeds', 6), minRatio: +opt('--min-ratio', 3) },
    words: tag(L.w, 'w'), bigrams: tag(L.bi, 'bi'), trigrams: tag(L.tri, 'tri'), names: names.map(r => r.slice(0, 6)) };
  // scale for the scorer (BBBScorer 0.9.0 cardLists): p90 over the mined AI cards of the summed weights of the words and
  // phrases a card uses, per 1,000 prose words (60 minimum)
  const Wm = new Map(res.words.map(r => [r[0], r[1]])), Bm = new Map(res.bigrams.map(r => [r[0], r[1]]));
  const rate = x => { let t = 0; for (const it of x.items.w) t += Wm.get(it) || 0; for (const it of x.items.bi) t += Bm.get(it) || 0; return 1000 * t / Math.max(60, x.items.nWords); };
  const rs = ai.map(rate).sort((a, b) => a - b); res.p90 = +rs[Math.floor(0.9 * rs.length)].toFixed(3); res.humanEvery = every;
  writeFileSync(resolve(opt('--out', join(ROOT, 'data/botstyle_card_lists.json'))), JSON.stringify(res, null, 0).replace(/\],\[/g, '],\n[') + '\n');
  const nNew = a => a.filter(r => r[r.length - 1] === 'new').length;
  console.log(`${ai.length} AI cards from ${res.models.length} models, ${human.length} human cards, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`words ${res.words.length} (${nNew(res.words)} new), bigrams ${res.bigrams.length} (${nNew(res.bigrams)} new), trigrams ${res.trigrams.length} (${nNew(res.trigrams)} new), names ${names.length}`);
  for (const k of ['words', 'bigrams', 'trigrams']) console.log(`top new ${k}: ` + res[k].filter(r => r[r.length - 1] === 'new').slice(0, 30).map(r => `${r[0]} (${r[2]}% vs ${r[3]}%)`).join(', '));
  console.log('names: ' + names.slice(0, 25).map(r => r[0]).join(', '));
}
