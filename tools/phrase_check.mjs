#!/usr/bin/env node
// phrase_check.mjs - How often a list of phrases shows up in human vs AI-written cards.
// Use it to vet an outside slop list (e.g. data/unslopnemo_targets.json) before adding anything to
// the scorer. Counts prefix matches at a word start ("glint" also counts "glinting") in
// description + first message, per million words and as the share of cards containing it.
//
//   node tools/phrase_check.mjs [data/unslopnemo_targets.json] [--every 5] [--out eval/experiments/phrase_check.json]
//
// Sets: human 2023 (Korshuk, Chub before Jul 2023, JanitorAI before Mar 2024 sampled --every N),
// Chub 2025 (mixed), AI-written (SPB personas + our generated cards). Card folder: ../card-datasets
// or BOTSTYLE_CARDS.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { PATHS } from './_paths.mjs';
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const listFile = args.find(a => !a.startsWith('--') && a !== opt('--every') && a !== opt('--out')) || join(ROOT, 'data', 'unslopnemo_targets.json');
const EVERY = +opt('--every', 5), OUT = opt('--out', PATHS.phraseCheck);
const t0 = Date.now(), stamp = () => new Date().toISOString().slice(11, 19);
const L = JSON.parse(readFileSync(listFile, 'utf-8')); const phrases = [...new Set((L.phrases || L).map(p => String(p).toLowerCase().trim()).filter(Boolean))];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RX = phrases.map(p => new RegExp((/^\w/.test(p) ? '\\b' : '') + esc(p).replace(/'/g, "'").replace(/ /g, '\\s+'), 'g'));
function* jsonl(p) { if (!existsSync(p)) { console.log(`  missing ${p}`); return; } const fd = openSync(p, 'r'), buf = Buffer.alloc(4 << 20); let rest = '', n;
  try { while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) { const ls = (rest + buf.toString('utf-8', 0, n)).split('\n'); rest = ls.pop(); for (const l of ls) if (l.trim()) yield JSON.parse(l); } if (rest.trim()) yield JSON.parse(rest); } finally { closeSync(fd); } }
const sets = {};
const add = (set, r) => {
  const text = `${r.description || r.persona_text || ''}\n${r.first_mes || ''}`.toLowerCase().replace(/[’‘]/g, "'").replace(/…/g, '...');
  const words = (text.match(/[a-z']+/g) || []).length; if (words < 40) return;
  const s = sets[set] = sets[set] || { cards: 0, words: 0, hits: phrases.map(() => 0), cardsWith: phrases.map(() => 0) };
  s.cards++; s.words += words;
  RX.forEach((rx, i) => { const m = text.match(rx); if (m) { s.hits[i] += m.length; s.cardsWith[i]++; } });
};
const created = r => String(r.createdAt || r.created_at || '');
console.log(`[${stamp()}] ${phrases.length} phrases from ${listFile}`);
for (const r of jsonl(join(CARDS, 'korshuk-roleplay-characters', 'korshuk_cards.jsonl'))) add('human_2023', r);
for (const r of jsonl(join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl'))) { const c = created(r); if (c && c < '2023-07') add('human_2023', r); else if (c.startsWith('2025')) add('chub_2025', r); }
let i = 0; for (const r of jsonl(join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl'))) { if (created(r) < '2024-03' && i++ % EVERY === 0) add('human_2023', r); }
console.log(`[${stamp()}] human done (${sets.human_2023 ? sets.human_2023.cards : 0} cards)`);
for (const r of jsonl(join(CARDS, 'spb-2602-ai-personas', 'data.jsonl'))) add('ai', r);
let bad = new Set(); try { bad = new Set(JSON.parse(readFileSync(PATHS.aiCardsV1Invalid, 'utf-8'))); } catch { /* none */ }
for (const r of jsonl(PATHS.aiCardsV1)) if (!bad.has(r.id)) add('ai', r);
for (const r of jsonl(PATHS.aiCardsV2)) if (!r.invalid) add('ai', r);
const per = (s, j) => s ? +(s.hits[j] / s.words * 1e6).toFixed(1) : null, share = (s, j) => s ? +(100 * s.cardsWith[j] / s.cards).toFixed(2) : null;
const H = sets.human_2023, A = sets.ai, C = sets.chub_2025;
const rows = phrases.map((p, j) => ({ phrase: p, human_per_m: per(H, j), ai_per_m: per(A, j), chub2025_per_m: per(C, j), human_cards_pct: share(H, j), ai_cards_pct: share(A, j),
  ratio: H && A ? +((A.hits[j] / A.words + 1e-6) / (H.hits[j] / H.words + 1e-6)).toFixed(2) : null })).sort((a, b) => b.ratio - a.ratio);
const out = { list: listFile, built: new Date().toISOString(), every: EVERY, sets: Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, { cards: s.cards, words: s.words }])), rows };
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(Object.entries(out.sets).map(([k, s]) => `${k}: ${s.cards} cards, ${s.words} words`).join(' · '));
console.log('phrase'.padEnd(32) + 'AI/M'.padStart(8) + 'human/M'.padStart(9) + 'ratio'.padStart(8) + '  AI cards%  human cards%');
for (const r of rows) console.log(r.phrase.padEnd(32) + String(r.ai_per_m).padStart(8) + String(r.human_per_m).padStart(9) + String(r.ratio).padStart(8) + String(r.ai_cards_pct).padStart(10) + String(r.human_cards_pct).padStart(13));
console.log(`[${stamp()}] done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${OUT}`);
