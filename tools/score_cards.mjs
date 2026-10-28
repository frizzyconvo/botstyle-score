#!/usr/bin/env node
// score_cards.mjs - Score card datasets (JSONL with description / first_mes / …) with
// botstyle (js/score-card.js, the same pipeline as the page) and, for comparison,
// upstream slop-score. Writes one JSON line per card.
// Usage: node tools/score_cards.mjs <cards.jsonl> <out.jsonl> [--alt]   (--alt: include alternate greetings)
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { loadAll, scoreCard } from '../js/score-card.js';
import { loadSlopSets, computeSlopIndex } from '../js/metrics.js';
import { wordsOnlyLower, alphaTokens } from '../js/utils.js';
import { scoreText as scoreContrast } from '../js/contrast-detector.js';
import { setPosTagger } from '../js/pos-tagger.js';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
global.fetch = async (url) => { const c = readFileSync(new URL(url.replace(/^\.\//, ''), root), 'utf-8'); return { ok: true, json: async () => JSON.parse(c) }; };
const quiet = () => { const o = { ...console }; for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) console[k] = () => {}; return () => Object.assign(console, o); };
const lb = JSON.parse(readFileSync(new URL('data/leaderboard_results.json', root))).results;
const range = v => { const mn = Math.min(...v), mx = Math.max(...v), r = mx - mn; return { min: mn - r * .1, max: mx + r * .1 }; };
const R = { w: range(lb.map(r => r.metrics.slop_list_matches_per_1k_words || 0)), t: range(lb.map(r => r.metrics.slop_trigram_matches_per_1k_words || 0)), c: range(lb.map(r => r.metrics.not_x_but_y_per_1k_chars || 0)) };
const nz = (v, r) => Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min)));
const args = process.argv.slice(2);
const [inP, outP] = args.filter(a => !a.startsWith('--'));
const includeAlt = args.includes('--alt');
await loadAll('./data/'); await loadSlopSets(); setPosTagger(require('wink-pos-tagger')());
const out = [];
for (const line of readFileSync(inP, 'utf-8').split('\n')) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  const alt = Array.isArray(r.alternate_greetings) ? r.alternate_greetings : (() => { try { return JSON.parse(r.alternate_greetings || '[]'); } catch { return []; } })();
  const card = { description: r.description, personality: r.personality, scenario: r.scenario, first_mes: r.first_mes, alternate_greetings: alt, tags: r.tags || r.topics };
  const b = scoreCard(card, { includeAltGreetings: includeAlt });
  const text = b.text;
  const toks = alphaTokens(wordsOnlyLower(text)); if (!toks.length) continue;
  const restore = quiet(); const cu = scoreContrast(text).rate_per_1k; restore();
  const s = computeSlopIndex(toks, false);
  const upstream = (nz(s.wordScore, R.w) * .6 + nz(cu, R.c) * .25 + nz(s.trigramScore, R.t) * .15) * 100;
  const tells = b.checks.humanTells || [];
  out.push({
    id: r.id, createdAt: r.createdAt, stars: r.starCount ?? r.stars, chats: r.chats, model: r.model, style_requested: r.style_requested,
    words: toks.length, proseWords: b.stats.proseWords, proseShare: b.stats.proseShare, boilerShare: b.stats.totalWords ? b.stats.boilerplateWords / b.stats.totalWords : 0,
    upstream, botstyle: b.score, base: b.base, low: b.low, high: b.high, reliable: b.reliable, band: b.band.id,
    comp: b.components, rates: b.rates, emdashPoints: b.emdashPoints, emdashRate: b.emdash.rate, artifactPoints: b.artifactPoints,
    artifacts: b.artifacts.hits.map(h => h.id), artifactNotes: (b.artifacts.notes || []).map(h => h.id), structHits: b.hits.structures.map(h => h.id),
    tellsPer1k: b.stats.totalWords ? tells.reduce((a, x) => a + x.count, 0) * 1000 / b.stats.totalWords : 0, tellIds: tells.map(x => x.id), craft: (b.checks.craftNotes || []).map(x => x.id),
    clichesPer1k: b.cliches ? b.cliches.phrasesPer1k : 0, names: b.names.map(n => n.item), tags: b.tags.map(t => t.id), tagInputs: b.tagInputs,
    nonEnglish: b.stats.nonEnglish, family: b.format.format, familyShares: b.format.shares, defStyle: b.format.definition.primary,
    labelProse: b.format.definition.signals.labelProseSections, greet: b.greeting ? b.greeting.primary : null, tense: b.greeting ? b.greeting.tense : null,
    greetParaCv: b.greeting ? b.greeting.paraLenCv : null, endsQ: b.greeting ? b.greeting.endsWithQuestion : null, type: b.type,
  });
}
writeFileSync(outP, out.map(o => JSON.stringify(o)).join('\n') + '\n');
console.log('scored', out.length);
