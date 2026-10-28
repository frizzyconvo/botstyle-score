#!/usr/bin/env node
// build_seeds_wide.mjs - A wider seed pool for rotated generation rounds (generate_ai_cards.mjs --rotate-seeds and
// rewrite rounds after the first). Same rules as tools/build_seeds.py, read from the flattened card files (fast):
// Chub cards from before Jul 2023 (with creator notes) and JanitorAI cards from before Jul 2023 (marked SFW; the flat
// file has no creator notes, so their request is name + tags only). SFW only, no characters described as children,
// no real people or school-age settings, English, 80-900-word description and 30-600-word greeting; half from each
// site, in a stable hash order. Canon characters who are minors can't all be caught by text rules: skim the pool.
//
//   node tools/build_seeds_wide.mjs [--n 400] [--out eval/inputs/seeds_wide.jsonl]
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { openSync, readSync, closeSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const N = +opt('--n', 400), OUT = opt('--out', join(ROOT, 'eval', 'inputs', 'seeds_wide.jsonl'));
function* jsonl(p) { if (!existsSync(p)) return; const fd = openSync(p, 'r'), buf = Buffer.alloc(4 << 20); let rest = '', n;
  try { while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) { const ls = (rest + buf.toString('utf-8', 0, n)).split('\n'); rest = ls.pop(); for (const l of ls) if (l.trim()) yield JSON.parse(l); } if (rest.trim()) yield JSON.parse(rest); } finally { closeSync(fd); } }
const NSFW = /\b(?:nsfw|nsfl|r18|r-18|18\+|lewd|smut|hentai|futa|breeding|fetish|kink|kinky|bdsm|incest|yandere|non-?con|rape|sex|sexy|sexual|horny|erotic|nude|naked|porn|whore|slut|dominant|submissive|femdom|maledom)\b/i;
// real people (celebrities, streamers) and school-age settings are left out too: cards about them aren't what we test
const OTHER = /\b(?:famous people|celebrity|celebrities|real person|real people|irl|youtuber|streamer|vtuber|lolcow|high ?school|schoolgirl|schoolboy|teen|teens|teenager|teenage|student council|middle schooler|high schooler|young au|young version|kid version|child au)\b/i;
const AGE = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)';
const MINOR = new RegExp(String.raw`\b(?:loli|shota|child|children|kid|kids|toddler|preteen|orphanage|middle school|elementary)\b|\b(?:[1-9]|1[0-7])\s*(?:-\s*\d+\s*)?(?:years?[ -]old|yrs?\b|y/o|yo\b)|\bage of (?:[1-9]|1[0-7]|${AGE})\b|\b${AGE}[ -]years?[ -]old\b`, 'i');
const FUNC = new Set('the a an and of to in is was he she they her his it that with for on as at but you'.split(' '));
const words = s => (String(s || '').match(/\S+/g) || []).length;
const tagsOf = t => Array.isArray(t) ? t : (String(t || '').match(/[^\[\]",']+/g) || []).map(x => x.trim()).filter(Boolean);
function keep(r, tags, tagline) {
  const desc = String(r.description || '').trim(), greet = String(r.first_mes || '').trim();
  const blob = [r.name, tags.join(' '), tagline, desc, greet].join(' ');
  if (NSFW.test(blob) || MINOR.test(blob) || OTHER.test(blob)) return null;
  if (!(words(desc) >= 80 && words(desc) <= 900 && words(greet) >= 30 && words(greet) <= 600)) return null;
  const toks = (desc + ' ' + greet).toLowerCase().match(/[a-z']+/g) || [];
  if (!toks.length || toks.filter(t => FUNC.has(t)).length / toks.length < 0.22) return null;
  return { name: r.name || '', tags, tagline: String(tagline || '').trim().slice(0, 300), description: desc, personality: r.personality || '', scenario: r.scenario || '', first_mes: greet };
}
const hash = id => createHash('sha1').update(String(id)).digest('hex');
const chub = [], jai = [];
for (const r of jsonl(join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl'))) {
  if (!r.createdAt || String(r.createdAt).slice(0, 7) >= '2023-07') continue;
  const k = keep(r, tagsOf(r.topics), r.tagline); if (k) chub.push({ id: 'chub/' + r.id, createdAt: r.createdAt, ...k, source: 'chub' });
}
for (const r of jsonl(join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl'))) {
  if (!r.createdAt || String(r.createdAt).slice(0, 7) >= '2023-07' || r.nsfw) continue;
  const k = keep(r, tagsOf(r.tags), ''); if (k) jai.push({ id: r.id, createdAt: r.createdAt, ...k, source: 'jaicards' });
}
const pick = (a, n) => a.sort((x, y) => hash(x.id) < hash(y.id) ? -1 : 1).slice(0, n);
const out = [...pick(chub, Math.min(chub.length, Math.ceil(N / 2))), ...pick(jai, N - Math.min(chub.length, Math.ceil(N / 2)))];
writeFileSync(OUT, out.map(r => JSON.stringify(r)).join('\n') + '\n');
console.log(`eligible: Chub ${chub.length}, JanitorAI ${jai.length}; wrote ${out.length} -> ${OUT}`);
