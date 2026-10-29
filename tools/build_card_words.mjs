#!/usr/bin/env node
// build_card_words.mjs - Reference data for the fun vocabulary reads, from 2023 cards (mostly human):
//   data/botstyle_card_words.json  how many reference cards use each word (signature words, unusual vocabulary)
//   data/botstyle_mood.json        Empath emotion word lists + where 2023 cards sit on each (mood read)
//
//   node tools/build_card_words.mjs [--human eval/experiments/v090_sample.jsonl] [--empath <empath categories.tsv>]
// --human: JSONL with description / first_mes; rows with set "human" are used (the 0.9.x evaluation sample: Korshuk,
// Chub before Jul 2023, JanitorAI May 2023–Feb 2024). --empath: categories.tsv from the empath package (MIT,
// github.com/Ejhfast/empath-client); default ../_scratch/s2/emp/categories.tsv, else the mood file is kept.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const argv = process.argv.slice(2), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const HUMAN = opt('--human', join(ROOT, 'eval', 'experiments', 'v090_sample.jsonl')), EMPATH = opt('--empath', join(ROOT, '..', '_scratch', 's2', 'emp', 'categories.tsv'));
globalThis.fetch = async u => { const p = join(ROOT, String(u).replace(/^\.\//, '')); return { ok: existsSync(p), json: async () => JSON.parse(readFileSync(p, 'utf-8')), text: async () => readFileSync(p, 'utf-8'), arrayBuffer: async () => readFileSync(p) }; };
const M = await import('../js/metrics.js'); await M.loadWordfreq();
const { candidateWords, signatureRead } = await import('../js/signature.js');
const { setMoodData, moodRates } = await import('../js/mood.js');

const cards = readFileSync(HUMAN, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(r => r.set === 'human')
  .map(r => [r.description, r.first_mes].filter(Boolean).join('\n\n')).filter(t => (t.match(/[A-Za-z']+/g) || []).length >= 100);
const q21 = v => { const s = [...v].sort((a, b) => a - b); return Array.from({ length: 21 }, (_, i) => +s[Math.min(s.length - 1, Math.round(i / 20 * (s.length - 1)))].toFixed(4)); };

// 1. document frequency
const df = {};
for (const t of cards) for (const w of candidateWords(t, M.lookupZipf)) df[w] = (df[w] || 0) + 1;
const kept = Object.fromEntries(Object.entries(df).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]));
const data = { about: 'How many 2023 reference cards (mostly human) use each word; words in fewer than 3 cards are left out. tools/build_card_words.mjs', n: cards.length, df: kept };
const shares = cards.map(t => signatureRead(t, data, M.lookupZipf, { self: true })).filter(Boolean).map(x => x.unusualShare);
data.unusualQ = q21(shares);
writeFileSync(join(ROOT, 'data', 'botstyle_card_words.json'), JSON.stringify(data));
console.log(`card words: ${cards.length} cards, ${Object.keys(kept).length} words kept (of ${Object.keys(df).length}); unusual-share median ${data.unusualQ[10]}`);

// 2. Empath: mood lists and where 2023 cards sit on each
if (existsSync(EMPATH)) {
  const cats = Object.fromEntries(readFileSync(EMPATH, 'utf-8').split('\n').filter(Boolean).map(l => { const [k, ...w] = l.split('\t'); return [k, w.filter(Boolean)]; }));
  const MOODS = { sadness: 'Melancholy', joy: 'Joyful', fear: 'Uneasy', anger: 'Fiery', affection: 'Tender', lust: 'Sultry', nervousness: 'Jittery',
    pride: 'Proud', shame: 'Sheepish', optimism: 'Hopeful', zest: 'Zesty', suffering: 'Aching', disgust: 'Grossed out', surprise: 'Startled',
    contentment: 'Cozy', trust: 'Trusting', cheerfulness: 'Cheery', timidity: 'Shy', sympathy: 'Caring', irritability: 'Grumpy', envy: 'Envious', confusion: 'Bewildered' };
  const mood = { about: 'Mood read: Empath emotion lists (MIT, Fast et al. 2016) and 21 quantiles of each rate per 1,000 words over 2023 cards. tools/build_card_words.mjs', moods: {}, q: {} };
  // Sexual words Empath files under other feelings ("moan", "orgasm" and "arouse" under contentment) stay only in Sultry,
  // so explicit cards don't read as Cozy.
  const SEXUAL = new Set(['moan', 'moans', 'moaning', 'moaned', 'orgasm', 'orgasms', 'arouse', 'aroused', 'arousal']);
  for (const [id, label] of Object.entries(MOODS)) if (cats[id]) mood.moods[id] = { label, words: id === 'lust' ? cats[id] : cats[id].filter(w => !SEXUAL.has(w)) };
  setMoodData(mood);
  const per = Object.fromEntries(Object.keys(mood.moods).map(k => [k, []]));
  for (const t of cards) { const { rates } = moodRates(t); for (const k in per) per[k].push(rates[k].rate); }
  for (const k in per) mood.q[k] = q21(per[k]);
  writeFileSync(join(ROOT, 'data', 'botstyle_mood.json'), JSON.stringify(mood));
  console.log(`mood: ${Object.keys(mood.moods).length} moods`);
} else console.log(`Empath categories not found at ${EMPATH}: mood file kept as it is`);
