#!/usr/bin/env node
// build_pulp_words.mjs - Genre ("pulp") vocabulary among the scored AI-favoured words
// (data/botstyle_pulp_words.json), for the experimental pulp score in js/pulp.js.
//
// A scored word counts as pulp vocabulary when, in share of cards using it (prose only):
//   human genre cards >= AI cards           (it isn't evidence of AI on genre cards), and
//   human genre cards >= 1.5 x other human cards, and >= 1%   (it really is genre vocabulary)
// Genre cards = human cards tagged with a fantasy/horror/adventure ("pulp") tag or a romance/smut
// ("steamy") tag. Nothing is dropped from the score; the page shows the score with and without them.
//
// Usage:
//   node tools/build_pulp_words.mjs --human <cards.jsonl>... --ai <cards.jsonl>... [--before 2024-03]
//        [--every 3] [--dry-run]
//   --every N   read every Nth human card (the JanitorAI cache is 600 MB; 3 keeps it to a few minutes)
import { readFileSync, writeFileSync, openSync, readSync, closeSync } from 'fs';
import { preprocessCard } from '../js/card-preprocess.js';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) { console.log(readFileSync(new URL(import.meta.url), 'utf-8').split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n')); process.exit(0); }
const files = flag => { const i = argv.indexOf(flag); if (i < 0) return []; const o = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) o.push(argv[j]); return o; };
const BEFORE = argv.includes('--before') ? argv[argv.indexOf('--before') + 1] : '2024-03';
const EVERY = Number(argv.includes('--every') ? argv[argv.indexOf('--every') + 1] : 1);
export const PULP_TAGS = ['fantasy', 'dark fantasy', 'magical', 'magic', 'monster', 'monster girl', 'villain', 'hero', 'rpg', 'royalty', 'non-human', 'demon', 'dragon',
  'horror', 'supernatural', 'sci-fi', 'science fiction', 'medieval', 'adventure', 'action', 'historical', 'elf', 'vampire', 'werewolf', 'post-apocalyptic', 'dungeon'];
export const STEAMY_TAGS = ['romance', 'romantic', 'smut', 'love', 'erotica', 'lovers'];
const PULP = new Set(PULP_TAGS), STEAMY = new Set(STEAMY_TAGS);
const W = new Set(JSON.parse(readFileSync(new URL('../data/botstyle_words.json', import.meta.url), 'utf-8')).map(r => r[0]));
const tagsOf = r => { let t = r.tags || r.topics || []; if (typeof t === 'string') t = t.match(/[^\[\]",']+/g) || []; return t.map(x => String(x).trim().toLowerCase()).filter(Boolean); };
const text = r => r.persona_text || ['description', 'personality', 'scenario', 'first_mes'].map(k => r[k] || '').join('\n\n');
function* rows(p) {
  const fd = openSync(p, 'r'), buf = Buffer.alloc(4 << 20); let rest = '', n;
  try { while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) { const ls = (rest + buf.toString('utf-8', 0, n)).split('\n'); rest = ls.pop(); for (const l of ls) if (l.trim()) yield JSON.parse(l); } if (rest.trim()) yield JSON.parse(rest); }
  finally { closeSync(fd); }
}
const groups = ['pulp', 'steamy', 'other', 'ai'], cnt = Object.fromEntries(groups.map(g => [g, new Map()])), n = Object.fromEntries(groups.map(g => [g, 0]));
function add(g, r) {
  const prose = preprocessCard(text(r)).prose.toLowerCase();
  if (prose.split(/\s+/).length < 50) return;
  for (const w of new Set((prose.match(/[a-z']+/g) || []).filter(w => W.has(w)))) cnt[g].set(w, (cnt[g].get(w) || 0) + 1);
  n[g]++;
}
const t0 = Date.now(); let i = 0;
for (const p of files('--human')) for (const r of rows(p)) {
  if (r.createdAt && String(r.createdAt).slice(0, 7) >= BEFORE) continue;
  if (i++ % EVERY) continue;
  const t = tagsOf(r);
  add(t.some(x => PULP.has(x)) ? 'pulp' : t.some(x => STEAMY.has(x)) ? 'steamy' : 'other', r);
}
for (const p of files('--ai')) for (const r of rows(p)) if (r.valid !== false) add('ai', r);
const df = (g, w) => (cnt[g].get(w) || 0) / Math.max(1, n[g]);
const words = {};
for (const w of [...W].sort()) {
  const genre = Math.max(df('pulp', w), df('steamy', w));
  if (genre >= 0.01 && genre >= df('ai', w) && genre >= 1.5 * df('other', w)) words[w] = { pulp: +df('pulp', w).toFixed(4), steamy: +df('steamy', w).toFixed(4), other: +df('other', w).toFixed(4), ai: +df('ai', w).toFixed(4) };
}
console.log(`${new Date().toISOString()} human pulp ${n.pulp}, steamy ${n.steamy}, other ${n.other}; AI ${n.ai}; ${Object.keys(words).length} pulp words; ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(Object.entries(words).sort((a, b) => Math.max(b[1].pulp, b[1].steamy) - Math.max(a[1].pulp, a[1].steamy)).slice(0, 50).map(([w]) => w).join(', '));
if (!argv.includes('--dry-run')) writeFileSync(new URL('../data/botstyle_pulp_words.json', import.meta.url), JSON.stringify({
  note: 'Genre vocabulary among the scored words: share of cards using each word (prose only) in human pulp / steamy / other cards and AI cards. Built by tools/build_pulp_words.mjs.',
  built: new Date().toISOString().slice(0, 10), counts: n, before: BEFORE, every: EVERY, words }, null, 0));
