// score-card.js - One call that runs the whole botstyle pipeline on a character card.
// Used by the page (js/app.js), the scoring tools (tools/score_all.mjs and others), and meant for platforms embedding
// the scorer. Works in the browser and in Node (the contrast detector's stage-2 POS
// patterns only run if a tagger is available; see pos-tagger.js / setPosTagger()).
//
//   import { loadAll, scoreCard } from './js/score-card.js';
//   await loadAll('./data/');
//   const r = scoreCard({ description, personality, scenario, first_mes, alternate_greetings });
//   r.score, r.band.label, r.format.label, r.tags, …
//
// A plain string is accepted too (treated as description + greeting pasted together).

import { loadBotstyle, scoreWeighted, computeBotstyleScore, peerPercentile, tallyNames, MIN_PROSE_WORDS, setWordFactors, ngramTokens } from './botstyle.js';
import { scorerProfile, scorerVersion, DEFAULT_SCORER, NEXT_SCORER, PROFILES } from './scorer-profile.js';
import { preprocessCard } from './card-preprocess.js';
import { scoreStructures } from './ai-structures.js';
import { findArtifacts } from './ai-artifacts.js';
import { checkCard, loadExtraWords } from './human-tells.js';
import { loadCliches, tallyCliches } from './cliches.js';
import { descriptionFormat, greetingStyle, cardType } from './card-style.js';
import { bonusTags, tagInputs } from './bonus-tags.js';
import { scoreText as scoreContrast } from './contrast-detector.js';
import { textureFeatures, aiStyleLikelihood } from './texture.js';
import { detectGenre } from './genre.js';
import { loadPulp, pulpScore, pulpWords } from './pulp.js';
import { archetype } from './archetypes.js';
import { cardRepetition } from './repetition.js';

// Version of the scoring pipeline, shown as "BBBScorer v…" (package.json holds the app version, which
// can be ahead of it for page-only changes). Bump it (and CHANGELOG.md) whenever a change can move
// scores or labels: lists, weights, calibration, bands, preprocessing. Every result carries it, so
// stored scores can be regression-tested against a new version (tools/compare_scores.mjs).
// The default stays here as a literal (tools/scorer_manifest.mjs reads it from the source); it must equal DEFAULT_SCORER in
// scorer-profile.js (a test checks). Newer versions are prepared there and only used when a tool opts in.
export const SCORER_VERSION = '0.9.1';
export { NEXT_SCORER };
// Versions whose botstyle *numbers* are identical to this one, so references built with them still apply.
// 0.7.0 re-anchored the scale to AI-written cards and made repeat damping length-independent, so older
// references don't apply.
export const SAME_SCORES_AS = ['0.9.1'];
// Card fields scored by default (scoreCard opts.fields overrides): what the page says it scores.
export const DEFAULT_FIELDS = ['description', 'first_mes'];

// Writing-style bands, tentative. Set for scorer 0.8.0 (parts blended, card-anchored scale) on 5,313 human
// 2023 cards vs 1,061 AI-written cards (tools/eval_cards.mjs): under 40 / 40-60 / 60+ puts human cards at
// 93 / 5 / 2% and AI cards at 30 / 40 / 30%. (0.7.0: 50 / 75; 0.5.0-0.6.0: 35 / 50 on the old scale.)
// Ids stay original / mixed / common for platforms.
// 0.8.2: four bands. Familiar is the old Common (60+, 2% of 2023 cards); Common is now the top 0.5% of 2023 cards (80+).
export const WRITING_STYLE_BANDS = { original: 40, familiar: 60, common: 80 };
// Under this many prose words the band carries a "too short to tell" stamp (about a quarter of cards).
export const SHORT_STAMP_WORDS = 250;
// Band names (descriptive), plus a just-for-fun tagline for each shown next to them on the page.
export const BAND_LABELS = { original: 'Original-ish', mixed: 'Mixed', familiar: 'Familiar', common: 'Common' };
export const BAND_TAGLINES = { original: 'Meatbag adjacent', mixed: 'Mixed signals', familiar: 'Rings a bell', common: 'Might just be slop' };
// Band schemes. 'four' (0.8.2-0.9.x): Original-ish / Mixed / Familiar / Common. 'v10' (0.10.0): Original / Fresh / Mixed /
// Common, all cut by length: Fresh from the 65th percentile of human cards of that length, Mixed from the 94th, Common
// from the 98th (Familiar merges into Common). A profile picks one with `bandScheme`.
export const BAND_SCHEMES = {
  four: { ids: ['original', 'mixed', 'familiar', 'common'], labels: BAND_LABELS, taglines: BAND_TAGLINES },
  v10: { ids: ['original', 'fresh', 'mixed', 'common'],
    labels: { original: 'Original', fresh: 'Fresh', mixed: 'Mixed', common: 'Common' },
    taglines: { original: 'Meatbag adjacent', fresh: 'Certified flesh?', mixed: 'Big cyborg energy', common: 'Might just be slop' } },
};
export function bandScheme() { return BAND_SCHEMES[scorerProfile().bandScheme] || BAND_SCHEMES.four; }
/** Band id for a score under the given cut-offs (from bandCuts) and the active scheme. */
export function bandIdFor(score, cuts = WRITING_STYLE_BANDS) {
  if (cuts.scheme === 'v10') return score >= cuts.common ? 'common' : score >= cuts.mixed ? 'mixed' : score >= cuts.fresh ? 'fresh' : 'original';
  return score < cuts.original ? 'original' : score < cuts.familiar ? 'mixed' : score < cuts.common ? 'familiar' : 'common';
}

let REFERENCE = null;   // data/botstyle_reference.json: score quantiles of human and AI cards
let LENGTH_BANDS = {};     // file -> data/botstyle_length_bands*.json: band cut-offs by prose length (0.9.x lengthBands)
let CARD_LISTS = {};       // file -> data/botstyle_card_lists*.json: words and phrases mined from AI-written cards (0.9.x cardLists)
// Each prepared profile names its own list and length-band files (by default botstyle_card_lists.json / botstyle_length_bands.json),
// so re-mining for a new version never changes an older version's scores.
const cardListsFile = () => { const c = scorerProfile().cardLists; return (c && c.file) || 'botstyle_card_lists.json'; };
const lengthBandsFile = () => { const l = scorerProfile().lengthBands; return (l && typeof l === 'object' && l.file) || 'botstyle_length_bands.json'; };

export async function loadAll(base = './data/') {
  // extra_words.txt (~0.6 MB compressed) only feeds the typo read-out, so it loads alongside the rest
  await Promise.all([loadBotstyle(base), loadCliches(base), loadPulp(base), loadExtraWords(base)]);
  try { const r = await fetch(base + 'botstyle_reference.json'); if (r.ok) REFERENCE = await r.json(); } catch { REFERENCE = null; }
  // Only the files some profile uses (the page's default profile uses none of them).
  const files = (k, def) => [...new Set(Object.values(PROFILES).map(p => p[k]).filter(Boolean).map(v => (typeof v === 'object' && v.file) || def))];
  for (const f of files('lengthBands', 'botstyle_length_bands.json')) { try { const r = await fetch(base + f); if (r.ok) LENGTH_BANDS[f] = await r.json(); } catch { /* none */ } }
  for (const f of files('cardLists', 'botstyle_card_lists.json')) {
    try { const r = await fetch(base + f); if (r.ok) { const j = await r.json(); CARD_LISTS[f] = { p90: j.p90, words: new Map(j.words.map(x => [x[0], x[1]])), bigrams: new Map(j.bigrams.map(x => [x[0], x[1]])) }; } } catch { /* none */ }
  }
  setWordFactors(pulpWords());
}

// 0.9.x lengthBands: the cut-offs for a card with this many prose words. Same 40 / 60 / 80 everywhere otherwise.
// The length-bands file gives the Original-ish and Familiar cut-offs (its `common` key); the top band stays at 80+.
// Scheme 'v10' returns where each band starts: { scheme: 'v10', fresh, mixed, common } (the file's fresh / original / common).
export function bandCuts(proseWords) {
  const LB = LENGTH_BANDS[lengthBandsFile()];
  if (!scorerProfile().lengthBands || !LB || !LB.bins) return { ...WRITING_STYLE_BANDS, byLength: false };
  const b = LB.bins.find(x => proseWords >= x.from && (x.to === null || proseWords < x.to)) || LB.bins[LB.bins.length - 1];
  if (scorerProfile().bandScheme === 'v10' && b.fresh !== undefined) return { scheme: 'v10', fresh: b.fresh, mixed: b.original, common: b.common, byLength: true, from: b.from, to: b.to };
  return { original: b.original, familiar: b.common, common: Math.max(WRITING_STYLE_BANDS.common, b.common + 10), byLength: true, from: b.from, to: b.to };
}

// 0.9.0 compactValues: trait values inside W++ ("a" + "b") and PList ([x: a, b; y: c]) blocks. AI-written blocks use
// phrase-length values; 2023 cards mostly one or two words (mean 3.9 vs 2.4 words per value, AUC 0.79).
export function compactValueStats(text) {
  const t = String(text || ''), v = [];
  for (const m of t.matchAll(/"([^"\n]{1,200})"/g)) if (/\(\s*"|\+\s*"|"\s*\+/.test(t.slice(Math.max(0, m.index - 3), m.index + m[0].length + 3))) v.push(m[1]);
  for (const m of t.matchAll(/\[([^\[\]\n]{20,3000})\]/g)) { if (!/:/.test(m[1])) continue; for (const seg of m[1].split(/;/)) for (const x of seg.split(':').slice(1).join(':').split(/,/)) if (x.trim()) v.push(x.trim()); }
  const lens = v.map(x => (x.match(/[A-Za-z']+/g) || []).length).filter(n => n > 0);
  return { values: lens.length, meanWords: lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0 };
}
function compactPoints(stats) {
  const c = scorerProfile().compactValues;
  if (!c || stats.values < c.minValues) return 0;
  return c.max * Math.max(0, Math.min(1, (stats.meanWords - c.from) / (c.to - c.from)));
}
// 0.9.0 texture: paragraph-length evenness on the scored prose (each line is a paragraph, 5+ words).
export function paragraphCv(prose) {
  const p = String(prose || '').split(/\n+/).map(x => (x.match(/[A-Za-z']+/g) || []).length).filter(n => n >= 5);
  if (p.length < 2) return { paragraphs: p.length, cv: null };
  const m = p.reduce((a, b) => a + b, 0) / p.length, sd = Math.sqrt(p.reduce((a, b) => a + (b - m) ** 2, 0) / p.length);
  return { paragraphs: p.length, cv: sd / m };
}
// 0.9.0 cardLists: each mined word or two-word phrase counts once per card (presence), weighted; per 1,000 prose words.
export function cardListHits(prose) {
  const CL = CARD_LISTS[cardListsFile()];
  if (!CL) return { rate: 0, hits: [] };
  const t = ngramTokens(String(prose || '')), seen = new Set(), hits = [];
  for (let i = 0; i < t.length; i++) {
    for (const [g, L] of [[t[i], CL.words], [i + 1 < t.length ? t[i] + ' ' + t[i + 1] : null, CL.bigrams]]) if (g && !seen.has(g) && L.has(g)) { seen.add(g); hits.push({ item: g, weight: L.get(g) }); }
  }
  const n = (String(prose || '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  return { rate: 1000 * hits.reduce((a, h) => a + h.weight, 0) / Math.max(60, n), hits: hits.sort((a, b) => b.weight - a.weight) };
}
function cardListPoints(h) { const c = scorerProfile().cardLists, CL = CARD_LISTS[cardListsFile()]; return c && CL ? c.weight * 100 * Math.min(1, h.rate / CL.p90) : 0; }
// 0.9.3 boldLabels: bold used as labels or headings ("**Appearance:**", "- **Likes:** ...", a line that is only "**Backstory**").
// Rare on early-2023 human cards (2+ on 0-1.2% of them) and common on AI-written ones (33%), whatever the format.
const BOLD_LABEL = /^[ \t]*(?:[-*\u2022+]|\d+[.)])?[ \t]*(?:\*\*|__)[^*_\n]{1,40}?(?::[ \t]*(?:\*\*|__)|(?:\*\*|__)[ \t]*:)/gm;
const BOLD_HEAD = /^[ \t]*(?:\*\*|__)[^*_\n]{1,40}(?:\*\*|__)[ \t]*$/gm;
export function boldLabelCount(text) { const t = String(text || ''); return (t.match(BOLD_LABEL) || []).length + (t.match(BOLD_HEAD) || []).length; }
function boldPoints(n) { const c = scorerProfile().boldLabels; return !c || n < c.min ? 0 : Math.min(c.max, c.base + c.per * (n - c.min)); }
// 0.10.1 constructionTells: rhetorical constructions newer chat models put on cards (RESCORE_IDEAS #51), from a blind
// read of missed AI cards. Any of them: 0.13% of early-2023 human cards, 7 of 47 provenance cards (all AI or hybrid),
// 8% of missed hold-out AI cards. Points per distinct construction, capped.
const SUBJ = "(?:He|She|They|It|I|You|This|That)", BE = "(?:'s|’s| is| are|'re|’re|'m|’m| am| was| were)";
export const CONSTRUCTION_TELLS = {
  not_x_not_y: new RegExp(SUBJ + BE + " not [^.!?\\n]{1,60}[.!?]\\s+" + SUBJ + BE + " not\\b"),           // "He is not cruel. He is not kind."
  its_not_x_its_y: new RegExp("\\b(?:It|That|This)" + BE + " not [^.!?\\n]{1,60}[.!?]\\s+(?:It|That|This)" + BE + "\\b(?! not)"),   // "It's not fear. It's ..."
  not_x_just_y: /\bnot\b[^.,;!?\n]{1,40}[,—–]\s*just\b/i,                                   // "not angry, just tired"
  not_because: /\bNot because\b[^.!?\n]{1,80}[.!?]\s+(?:But )?[Bb]ecause\b/,                 // "Not because X. Because Y."
  no_more_no_less: /\bno more[,.]\s*no less\b/i,
  and_honestly: /\bhonestly\?/i,                                                          // "And honestly?"
  a_beat: /(?:^|[*_\s(])A beat\./m,                                                        // "*A beat.*"
  like_someone_who: /\blike (?:someone|somebody|a (?:man|woman|person|guy)) who\b/i,         // "smiles like someone who ..."
  somehow_worse: /\bsomehow (?:worse|better|more|less)\b/i,                                // "and that's somehow worse"
};
export function constructionTells(text) { const t = String(text || ''); return Object.keys(CONSTRUCTION_TELLS).filter(k => CONSTRUCTION_TELLS[k].test(t)); }
function constructionPoints(ids) { const c = scorerProfile().constructionTells; return !c || !ids.length ? 0 : Math.min(c.max, c.per * ids.length); }
function texturePoints(pc, proseWords) {
  const c = scorerProfile().texture;
  if (!c || pc.cv === null || pc.paragraphs < c.minParagraphs || proseWords < c.minWords) return 0;
  return Math.max(c.min, Math.min(c.max, c.perUnit * (c.pivot - pc.cv)));
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

export function writingStyleBand(score, reliable, format, stats = {}, obviousTell = false, cuts = WRITING_STYLE_BANDS) {
  if (format === 'boilerplate') return { id: 'na', label: 'Not enough character writing to judge' };
  if (stats.nonEnglish) return { id: 'na', label: 'Not English (the word lists are English-only)' };
  // an obvious chatbot tell ("Certainly! Here is…") is conclusive at any length
  if (!obviousTell && stats.proseWords !== undefined && stats.proseWords < MIN_JUDGE_WORDS)
    return { id: 'na', label: stats.structuredWords > stats.proseWords ? 'Mostly W++/lists: too little prose to judge' : 'Too little prose to judge' };
  const id = bandIdFor(score, cuts || WRITING_STYLE_BANDS), S = cuts && cuts.scheme === 'v10' ? BAND_SCHEMES.v10 : BAND_SCHEMES.four;
  return { id, label: S.labels[id] + (reliable ? '' : ' (low confidence)'), tagline: S.taglines[id],
    short: stats.proseWords !== undefined && stats.proseWords < SHORT_STAMP_WORDS };
}

function quietly(fn) {
  const saved = {};
  for (const k of ['log', 'group', 'groupEnd', 'warn', 'error']) { saved[k] = console[k]; console[k] = () => {}; }
  try { return fn(); } finally { Object.assign(console, saved); }
}

/**
 * @param {object|string} card  { description, personality, scenario, first_mes, alternate_greetings, tags }
 * @param {object} opts         { fields: DEFAULT_FIELDS, includeAltGreetings: false, includeExampleDialogue: false, lookupZipf: fn (typo check) }
 */
// Hybrid-card detection (see scoreCard): minimum prose words per part, and the gap in points. "Hybrid" (description
// and first message far apart, e.g. one written by hand and one with AI) is not the Mixed band.
export const PART_MIN_WORDS = 60, PART_WEIGHT_CAP = 400;   // card score = blend of parts (see scoreCard)
export const HYBRID_MIN_WORDS = 150;
export const HYBRID_GAP = 25;   // ~6% of human 2023 cards and ~6% of AI cards trip it (eval_cards.mjs)
export const MIXED_MIN_WORDS = HYBRID_MIN_WORDS, MIXED_GAP = HYBRID_GAP;   // old names
function partScore(text) {
  if (!String(text || '').trim()) return null;
  const p = preprocessCard(text), w = scoreWeighted(p.prose);
  if (!w.nWords) return { score: 0, low: 0, high: 0, proseWords: 0, reliable: false };
  const cm = quietly(() => scoreContrast(p.prose)), st = scoreStructures(p.prose, cm.matches || []), sc = computeBotstyleScore(w, st, 0);
  return { score: +sc.score.toFixed(1), low: +sc.low.toFixed(1), high: +sc.high.toFixed(1), proseWords: p.stats.proseWords, reliable: sc.reliable,
    rates: { words: +w.words.rate.toFixed(3), phrases: +w.phrases.rate.toFixed(3), structures: +st.rate.toFixed(3) }, emdash: st.emdash ? +st.emdash.points.toFixed(2) : 0 };
}
function partScores(definition, greetings) {
  return { description: partScore(definition), greeting: partScore(greetings.join('\n\n')) };
}

export function scoreCard(card, opts = {}) {
  const c = typeof card === 'string' ? { description: card } : (card || {});
  // Which card fields count. Default: description + first message, as the page says. Personality,
  // scenario and example dialogue only count when asked for (opts.fields, or the older
  // opts.includeExampleDialogue). Scorer 0.5.0 and earlier always added personality + scenario.
  const F = new Set(opts.fields || DEFAULT_FIELDS);
  if (opts.includeExampleDialogue) F.add('mes_example');
  const definition = ['description', 'personality', 'scenario', 'mes_example'].filter(k => F.has(k)).map(k => c[k]).filter(Boolean).join('\n\n');
  const greetings = (F.has('first_mes') ? [c.first_mes] : []).concat(opts.includeAltGreetings ? (c.alternate_greetings || []) : []).filter(Boolean);
  const text = [definition].concat(greetings).filter(Boolean).join('\n\n');

  const pre = preprocessCard(text);
  const w = scoreWeighted(pre.prose);
  const contrast = w.nWords ? quietly(() => scoreContrast(pre.prose)) : { rate_per_1k: 0, matches: [] };
  const st = scoreStructures(pre.prose, contrast.matches || []);
  const artifacts = findArtifacts([preprocessCard(definition).nonBoilerplate].concat(greetings.map(g => preprocessCard(g).nonBoilerplate)));
  const score = computeBotstyleScore(w, st, artifacts.points);
  // Hybrid cards: the description and the greeting(s) scored on their own. A card counts as hybrid when
  // both parts have enough prose and land HYBRID_GAP or more points apart (e.g. a hand-written
  // description with an AI-written greeting). Scorer 0.7.0 reports this (it was called "mixed" until app 0.35.0);
  // the card score stays a blend unless opts.hybridPolicy = 'higher'. (Since 0.8.0 the card score is a blend of the parts, below.)
  const parts = partScores(definition, greetings);
  const repetition = cardRepetition(definition, greetings[0] || '', c.alternate_greetings);
  const hybrid = parts.description && parts.greeting && parts.description.proseWords >= HYBRID_MIN_WORDS && parts.greeting.proseWords >= HYBRID_MIN_WORDS
    && Math.abs(parts.description.score - parts.greeting.score) >= HYBRID_GAP
    ? { higher: parts.greeting.score > parts.description.score ? 'greeting' : 'description', gap: +Math.abs(parts.description.score - parts.greeting.score).toFixed(1) } : null;
  // Card score (scorer 0.8.0+): the description and the greeting(s) are scored separately and blended,
  // each weighted by its prose words up to PART_WEIGHT_CAP, plus card-level chatbot-leftover points. A part
  // needs PART_MIN_WORDS of prose to count; with none, the joint score is used. Scoring the parts apart caught
  // nearly twice as many AI cards at a 2% false-positive rate on human cards (eval_cards.mjs). opts.joint = true
  // keeps the old one-text score.
  const joint = { score: score.score, low: score.low, high: score.high };
  if (!opts.joint) {
    const ps = ['description', 'greeting'].map(k => parts[k]).filter(p => p && p.proseWords >= PART_MIN_WORDS);
    if (ps.length) {
      const w = ps.map(p => Math.min(PART_WEIGHT_CAP, p.proseWords)), W = w.reduce((a, b) => a + b, 0);
      const blend = key => Math.min(100, ps.reduce((a, p, i) => a + p[key] * w[i], 0) / W + artifacts.points);
      score.score = blend('score'); score.low = blend('low'); score.high = blend('high');
    }
  }
  // 0.9.0 extra points (both 0 under 0.8.1): long W++ / PList trait values, and paragraph evenness (+) or
  // unevenness (−). Like em-dash and chatbot-leftover points, they sit on top of the word / phrase / pattern score.
  const compact = compactValueStats(definition), pCv = paragraphCv(pre.prose);
  const cl = scorerProfile().cardLists ? cardListHits(pre.prose) : { rate: 0, hits: [] };
  const bold = boldLabelCount(text);
  const ctells = scorerProfile().constructionTells ? constructionTells(text) : [];
  const extra = { compactValues: +compactPoints(compact).toFixed(2), texture: +texturePoints(pCv, pre.stats.proseWords).toFixed(2), cardLists: +cardListPoints(cl).toFixed(2), boldLabels: +boldPoints(bold).toFixed(2), construction: +constructionPoints(ctells).toFixed(2) };
  const extraPts = extra.compactValues + extra.texture + extra.cardLists + extra.boldLabels + extra.construction;
  if (extraPts) for (const k of ['score', 'low', 'high']) score[k] = Math.max(0, Math.min(100, score[k] + extraPts));
  if (hybrid && (opts.hybridPolicy || opts.mixedPolicy) === 'higher') {
    const hi = parts[hybrid.higher];
    if (hi.score > score.score) { score.score = hi.score; score.low = Math.max(score.low, hi.low); score.high = Math.max(score.high, hi.high); }
  }

  const defPre = preprocessCard(definition);
  const format = descriptionFormat(definition || text, (definition ? defPre : pre).stats);
  const greeting = greetings.length ? greetingStyle(greetings[0]) : null;
  const type = cardType(definition, greetings[0] || '', c.tags || []);
  const checks = pre.stats.nonEnglish ? { humanTells: [], craftNotes: [], summary: {} } : checkCard(pre.nonBoilerplate, { lookupZipf: opts.lookupZipf });
  const cliches = tallyCliches(pre.prose);
  const names = tallyNames(pre.prose);
  const rates = { words: w.words.rate, phrases: w.phrases.rate, structures: st.rate };
  const peers = Object.fromEntries(['words', 'phrases', 'structures'].map(k => [k, peerPercentile(format.format, k, rates[k])]));
  const genre = detectGenre(pre.prose, c.tags || []);
  const pulp = pulpScore(w, st, artifacts.points, genre, WRITING_STYLE_BANDS);
  const texture = textureFeatures(pre.prose);
  const likelihood = aiStyleLikelihood(score.score, texture, pre.stats.proseWords);
  const result = {
    version: scorerVersion(),
    score: score.score, low: score.low, high: score.high, base: score.base, reliable: score.reliable, joint, parts, hybrid, mixed: hybrid, repetition,   // mixed: old name of hybrid
    components: score.components, emdashPoints: score.emdashPoints, artifactPoints: score.artifactPoints,
    band: writingStyleBand(score.score, score.reliable, format.format, pre.stats, score.artifactPoints > 0, bandCuts(pre.stats.proseWords)),
    bandCuts: bandCuts(pre.stats.proseWords), extraPoints: extra, compactValues: compact, paragraphEvenness: pCv, cardListHits: cl.hits.slice(0, 20), constructionTells: ctells,
    rates, stats: pre.stats, format, greeting, type, peers,
    reference: referencePercentiles(score.score),
    genre, pulp, archetype: archetype({ format, greeting, genre, stats: pre.stats }),
    texture, experimental: { aiStyleLikelihood: likelihood, note: 'botstyle score + paragraph evenness; unscored, under evaluation' },
    hits: { words: w.words.hits, phrases: w.phrases.hits, structures: st.hits },
    partTexts: { description: definition, greeting: greetings.join('\n\n') },   // what each part score was computed on
    emdash: st.emdash, artifacts, checks, cliches, names, contrast,
    prose: pre.prose, text, definitionText: definition, minProseWords: MIN_PROSE_WORDS,
  };
  result.tagInputs = tagInputs(result);
  result.tags = bonusTags(result);
  return result;
}
