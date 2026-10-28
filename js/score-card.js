// score-card.js - One call that runs the whole botstyle pipeline on a character card.
// Used by slop-score.html, tools/score_cards.mjs, and meant for platforms embedding
// the scorer. Works in the browser and in Node (the contrast detector's stage-2 POS
// patterns only run if a tagger is available; see pos-tagger.js / setPosTagger()).
//
//   import { loadAll, scoreCard } from './js/score-card.js';
//   await loadAll('./data/');
//   const r = scoreCard({ description, personality, scenario, first_mes, alternate_greetings });
//   r.score, r.band.label, r.format.label, r.tags, …
//
// A plain string is accepted too (treated as description + greeting pasted together).

import { loadBotstyle, scoreWeighted, computeBotstyleScore, peerPercentile, tallyNames, MIN_PROSE_WORDS } from './botstyle.js';
import { preprocessCard } from './card-preprocess.js';
import { scoreStructures } from './ai-structures.js';
import { findArtifacts } from './ai-artifacts.js';
import { checkCard } from './human-tells.js';
import { loadCliches, tallyCliches } from './cliches.js';
import { descriptionFormat, greetingStyle, cardType } from './card-style.js';
import { bonusTags, tagInputs } from './bonus-tags.js';
import { scoreText as scoreContrast } from './contrast-detector.js';
import { textureFeatures, aiStyleLikelihood } from './texture.js';

// The platform's "writing style" labels. Cut-offs from the card and story sets (BOTSTYLE.md):
// at 20/40, ~87% of 2023 human cards are Original and 2-4% Common, while AI-written cards
// (SPB) are 4% Original / 19% Common and AI stories 7% / 60%. The older 30/60 split put
// 42% of AI cards in Original and almost nothing in Common. Change here if needed.
// Version of the scoring pipeline. Bump it (and package.json, CHANGELOG.md) whenever a change can
// move scores or labels: lists, weights, calibration, bands, preprocessing. Every result carries it,
// so stored scores can be regression-tested against a new version (tools/compare_scores.mjs).
export const SCORER_VERSION = '0.4.0';

export const WRITING_STYLE_BANDS = { original: 20, common: 40 };

let REFERENCE = null;   // data/botstyle_reference.json: score quantiles of human and AI cards

export async function loadAll(base = './data/') {
  await loadBotstyle(base);
  await loadCliches(base);
  try { const r = await fetch(base + 'botstyle_reference.json'); if (r.ok) REFERENCE = await r.json(); } catch { REFERENCE = null; }
}

// Share of a reference group scoring below `score` (0-100), from its 101 stored quantiles.
function percentileIn(q, score) {
  if (score <= q[0]) return 0;
  if (score >= q[100]) return 100;
  let i = 0; while (i < 100 && q[i + 1] <= score) i++;
  const span = q[i + 1] - q[i];
  return Math.min(100, i + (span > 0 ? (score - q[i]) / span : 0));
}

/** Where a score sits among human-written and AI-written cards: the grading the score itself
 *  can't give (a 0-100 score isn't a percentage of anything). */
export function referencePercentiles(score) {
  if (!REFERENCE || !REFERENCE.groups) return null;
  const out = {};
  for (const [k, g] of Object.entries(REFERENCE.groups)) out[k] = { label: g.label, n: g.n, percentile: percentileIn(g.q, score) };
  out.version = REFERENCE.version || null;   // scorer version the reference was built with
  return out;
}

// Below this many prose words no label is given: one stray hit in a 17-word greeting can
// reach 40+ (2023 human cards under 20 prose words: 4% would land in Common).
export const MIN_JUDGE_WORDS = 40;

export function writingStyleBand(score, reliable, format, stats = {}, obviousTell = false) {
  if (format === 'boilerplate') return { id: 'na', label: 'Not enough character writing to judge' };
  if (stats.nonEnglish) return { id: 'na', label: 'Not English (the word lists are English-only)' };
  // an obvious chatbot tell ("Certainly! Here is…") is conclusive at any length
  if (!obviousTell && stats.proseWords !== undefined && stats.proseWords < MIN_JUDGE_WORDS)
    return { id: 'na', label: stats.structuredWords > stats.proseWords ? 'Mostly W++/lists: too little prose to judge' : 'Too little prose to judge' };
  const B = WRITING_STYLE_BANDS;
  const id = score < B.original ? 'original' : score < B.common ? 'mixed' : 'common';
  return { id, label: { original: 'Original', mixed: 'Mixed', common: 'Common' }[id] + (reliable ? '' : ' (low confidence)') };
}

function quietly(fn) {
  const saved = {};
  for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return fn(); } finally { Object.assign(console, saved); }
}

/**
 * @param {object|string} card  { description, personality, scenario, first_mes, alternate_greetings, tags }
 * @param {object} opts         { includeAltGreetings: false, lookupZipf: fn (typo check) }
 */
export function scoreCard(card, opts = {}) {
  const c = typeof card === 'string' ? { description: card } : (card || {});
  const definition = [c.description, c.personality, c.scenario].filter(Boolean).join('\n\n');
  const greetings = [c.first_mes].concat(opts.includeAltGreetings ? (c.alternate_greetings || []) : []).filter(Boolean);
  const text = [definition].concat(greetings).filter(Boolean).join('\n\n');

  const pre = preprocessCard(text);
  const w = scoreWeighted(pre.prose);
  const contrast = w.nWords ? quietly(() => scoreContrast(pre.prose)) : { rate_per_1k: 0, matches: [] };
  const st = scoreStructures(pre.prose, contrast.matches || []);
  const artifacts = findArtifacts([preprocessCard(definition).nonBoilerplate].concat(greetings.map(g => preprocessCard(g).nonBoilerplate)));
  const score = computeBotstyleScore(w, st, artifacts.points);

  const defPre = preprocessCard(definition);
  const format = descriptionFormat(definition || text, (definition ? defPre : pre).stats);
  const greeting = greetings.length ? greetingStyle(greetings[0]) : null;
  const type = cardType(definition, greetings[0] || '', c.tags || []);
  const checks = pre.stats.nonEnglish ? { humanTells: [], craftNotes: [], summary: {} } : checkCard(pre.nonBoilerplate, { lookupZipf: opts.lookupZipf });
  const cliches = tallyCliches(pre.prose);
  const names = tallyNames(pre.prose);
  const rates = { words: w.words.rate, phrases: w.phrases.rate, structures: st.rate };
  const peers = Object.fromEntries(['words', 'phrases', 'structures'].map(k => [k, peerPercentile(format.format, k, rates[k])]));
  const texture = textureFeatures(pre.prose);
  const likelihood = aiStyleLikelihood(score.score, texture, pre.stats.proseWords);
  const result = {
    version: SCORER_VERSION,
    score: score.score, low: score.low, high: score.high, base: score.base, reliable: score.reliable,
    components: score.components, emdashPoints: score.emdashPoints, artifactPoints: score.artifactPoints,
    band: writingStyleBand(score.score, score.reliable, format.format, pre.stats, score.artifactPoints > 0),
    rates, stats: pre.stats, format, greeting, type, peers,
    reference: referencePercentiles(score.score),
    texture, experimental: { aiStyleLikelihood: likelihood, note: 'botstyle score + paragraph evenness; unscored, under evaluation' },
    hits: { words: w.words.hits, phrases: w.phrases.hits, structures: st.hits },
    emdash: st.emdash, artifacts, checks, cliches, names, contrast,
    prose: pre.prose, text, definitionText: definition, minProseWords: MIN_PROSE_WORDS,
  };
  result.tagInputs = tagInputs(result);
  result.tags = bonusTags(result);
  return result;
}
