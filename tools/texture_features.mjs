#!/usr/bin/env node
// texture_features.mjs - Experimental: whole-text "texture" features that don't depend on
// word lists (burstiness, paragraph evenness, vocabulary spread, punctuation habits), plus a
// variant botstyle score that also reads sentence-like list items. For testing alternative
// signals against labeled sets; nothing here feeds the page score.
// Usage: node tools/texture_features.mjs <cards.jsonl> <out.jsonl> [--label human|ai] [--field persona_text]
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { loadAll, scoreCard } from '../js/score-card.js';
import { preprocessCard } from '../js/card-preprocess.js';
import { setPosTagger } from '../js/pos-tagger.js';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(u.replace(/^\.\//, ''), root), 'utf-8')) });
await loadAll('./data/'); setPosTagger(require('wink-pos-tagger')());
const args = process.argv.slice(2);
const [inP, outP] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : '';
const field = args.includes('--field') ? args[args.indexOf('--field') + 1] : null;

const cv = a => { if (a.length < 3) return null; const m = a.reduce((x, y) => x + y, 0) / a.length; if (!m) return null; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); return sd / m; };
function mattr(toks, w = 100) {   // moving-average type-token ratio
  if (toks.length < w) return toks.length ? new Set(toks).size / toks.length : null;
  let s = 0, n = 0; for (let i = 0; i + w <= toks.length; i += 25) { s += new Set(toks.slice(i, i + w)).size / w; n++; } return s / n;
}
function features(prose) {
  const narr = prose.replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
  const sents = prose.split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(s => /[A-Za-z]/.test(s));
  const slen = sents.map(s => (s.match(/[A-Za-z']+/g) || []).length).filter(n => n > 0);
  const paras = prose.split(/\n\s*\n/).map(p => (p.match(/[A-Za-z']+/g) || []).length).filter(n => n >= 5);
  const toks = (prose.toLowerCase().match(/[a-z']+/g) || []);
  const nw = toks.length || 1;
  const per1k = n => n * 1000 / nw;
  return {
    sentCv: cv(slen), paraCv: cv(paras), meanSent: slen.length ? slen.reduce((a, b) => a + b, 0) / slen.length : null,
    shortSentShare: slen.length ? slen.filter(n => n <= 4).length / slen.length : null,
    mattr: mattr(toks), wordLen: toks.reduce((a, t) => a + t.length, 0) / nw,
    contractions: per1k((prose.match(/\b\w+['’](?:s|re|ll|ve|d|t|m)\b/gi) || []).length),
    exclaim: per1k((prose.match(/!/g) || []).length), question: per1k((prose.match(/\?/g) || []).length),
    ellipsis: per1k((prose.match(/\.\.\.|…/g) || []).length), emdash: per1k((prose.match(/—|--/g) || []).length),
    semicolon: per1k((narr.match(/;/g) || []).length), colon: per1k((narr.match(/:/g) || []).length),
    parens: per1k((narr.match(/\(/g) || []).length), lowerStart: sents.length ? sents.filter(s => /^[a-z]/.test(s)).length / sents.length : null,
    triads: per1k((narr.match(/\b\w+, \w+,? and \w+\b/g) || []).length),
    fragments: sents.length ? sents.filter(s => /^[A-Z][^.!?]{0,30}[.!?]$/.test(s) && (s.match(/[A-Za-z']+/g) || []).length <= 3).length / sents.length : null,
  };
}
// list items that read as sentences (>= 7 words), bullets and "Key:" prefixes stripped
function sentenceLikeListText(text) {
  const pre = preprocessCard(text);
  const lines = pre.segments.filter(s => s.kind === 'structured').flatMap(s => s.text.split('\n'))
    .map(l => l.replace(/^\s*(?:[-*•+]|\d+[.)])\s*/, '').replace(/^\**[\w' /&-]{1,30}\**\s*:\s*/, '').trim())
    .filter(l => (l.match(/[A-Za-z']+/g) || []).length >= 7);
  return lines.map(l => /[.!?]$/.test(l) ? l : l + '.').join(' ');
}
const out = [];
for (const line of readFileSync(inP, 'utf-8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (r.valid === false) continue;
  const card = field ? { description: r[field] } : { description: r.description, personality: r.personality, scenario: r.scenario, first_mes: r.first_mes };
  const res = scoreCard(card);
  if (res.stats.nonEnglish) continue;
  const full = [card.description, card.personality, card.scenario, card.first_mes].filter(Boolean).join('\n\n');
  const extra = sentenceLikeListText(full);
  const withLists = extra ? scoreCard({ description: res.prose + '\n\n' + extra }).score : res.score;
  out.push({ id: r.id, label: label || r.source || '', createdAt: r.createdAt, model: r.model, style: r.style_requested,
    score: res.score, scoreWithLists: withLists, listWords: (extra.match(/[A-Za-z']+/g) || []).length, proseWords: res.stats.proseWords,
    format: res.format.format, tells: res.checks.humanTells.reduce((a, x) => a + x.count, 0) * 1000 / Math.max(1, res.stats.totalWords),
    ...features(res.prose) });
}
writeFileSync(outP, out.map(o => JSON.stringify(o)).join('\n') + '\n');
console.log('wrote', out.length, outP);
