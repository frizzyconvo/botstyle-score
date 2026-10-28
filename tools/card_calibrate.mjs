#!/usr/bin/env node
// card_calibrate.mjs - Drop slop words that human character cards use at least as often as AI cards.
//
// The word list was weighted by AI fiction vs Reddit stories. On character cards some of those
// words are ordinary card vocabulary, above all in fantasy / horror / action ("pulp") cards: hero,
// legendary, realm, abyss, primal, amidst. A word is dropped when, in share of cards using it
// (prose only, so pasted instructions don't count):
//     max(human cards, human pulp cards) >= AI cards   and that human share >= 1%.
//
// Usage:
//   node tools/card_calibrate.mjs --human <cards.jsonl>... --ai <cards.jsonl>... [--before 2023-07]
//        [--exclude-model-tags] [--dry-run]
// Human rows dated on/after --before are skipped; --exclude-model-tags also skips Chub cards tagged
// OAI/GPT4/GPT3.5Turbo/Claude (made for those models, so more likely written with them). AI rows
// with valid=false are skipped; SPB rows (persona_text) work too. Writes data/botstyle_card_drop.json,
// which botstyle.js applies at load. Rerun node tools/calibrate.mjs afterwards.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync } from 'fs';
import { preprocessCard } from '../js/card-preprocess.js';

const argv = process.argv.slice(2);
const files = flag => { const i = argv.indexOf(flag); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out; };
const BEFORE = argv.includes('--before') ? argv[argv.indexOf('--before') + 1] : '2023-07';
const EXCL = argv.includes('--exclude-model-tags');
const PULP = new Set(['fantasy', 'horror', 'adventure', 'action', 'rpg', 'science fiction', 'sci-fi', 'monster', 'monster girl', 'dark fantasy',
  'villain', 'medieval', 'magic', 'magical', 'demon', 'supernatural', 'dragon', 'post-apocalyptic', 'dungeon']);
const MODEL_TAGS = /^(?:oai|gpt4|gpt-4|gpt3\.5turbo|gpt-3\.5|claude|chatgpt)$/i;
const W = new Set(JSON.parse(readFileSync(new URL('../data/botstyle_words.json', import.meta.url), 'utf-8')).map(r => r[0]));
const tagsOf = r => { let t = r.tags || r.topics || []; if (typeof t === 'string') t = t.match(/[^\[\]",']+/g) || []; return t.map(x => String(x).trim().toLowerCase()).filter(Boolean); };
const text = r => r.persona_text || ['description', 'personality', 'scenario', 'first_mes'].map(k => r[k] || '').join('\n\n');
function* rows(p) { for (const l of readFileSync(p, 'utf-8').split('\n')) if (l.trim()) yield JSON.parse(l); }
const cnt = { human: new Map(), pulp: new Map(), ai: new Map() }, n = { human: 0, pulp: 0, ai: 0 };
function add(group, r) {
  const prose = preprocessCard(text(r)).prose.toLowerCase();
  if (prose.split(/\s+/).length < 50) return false;
  const seen = new Set((prose.match(/[a-z']+/g) || []).filter(w => W.has(w)));
  for (const w of seen) cnt[group].set(w, (cnt[group].get(w) || 0) + 1);
  n[group]++; return true;
}
for (const p of files('--human')) for (const r of rows(p)) {
  if (r.createdAt && String(r.createdAt).slice(0, 7) >= BEFORE) continue;
  const t = tagsOf(r);
  if (EXCL && t.some(x => MODEL_TAGS.test(x))) continue;
  if (add('human', r) && t.some(x => PULP.has(x))) add('pulp', r);
}
for (const p of files('--ai')) for (const r of rows(p)) if (r.valid !== false) add('ai', r);
const df = (g, w) => (cnt[g].get(w) || 0) / Math.max(1, n[g]);
const words = {};
for (const w of [...W].sort()) {
  const h = Math.max(df('human', w), df('pulp', w));
  if (h >= 0.01 && h >= df('ai', w)) words[w] = [+df('human', w).toFixed(4), +df('pulp', w).toFixed(4), +df('ai', w).toFixed(4)];
}
console.log(`human ${n.human} cards (pulp ${n.pulp}), AI ${n.ai}: dropping ${Object.keys(words).length} of ${W.size} words`);
const top = Object.entries(words).sort((a, b) => Math.max(b[1][0], b[1][1]) - Math.max(a[1][0], a[1][1])).slice(0, 30).map(([w]) => w);
console.log('most common in human cards: ' + top.join(', '));
if (!argv.includes('--dry-run'))
  writeFileSync(new URL('../data/botstyle_card_drop.json', import.meta.url), JSON.stringify({ note: 'Slop words not scored on character cards: [human share, human pulp share, AI share] of cards using each word (prose only). Built by tools/card_calibrate.mjs.',
    built: new Date().toISOString().slice(0, 10), counts: n, before: BEFORE, excludeModelTags: EXCL, words }, null, 0));
