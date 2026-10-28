// botstyle.js - Weighted slop scoring for character cards
//
// Differences from upstream slop-score (js/metrics.js computeSlopIndex):
//  * Every list entry carries a weight = log2(AI rate / human rate / 2), built by
//    tools/build_lists.py from AI creative writing vs human fiction. Phrases that
//    humans use about as often as models ("took deep breath") are gone.
//  * N-grams are matched on stopword-free tokens with contractions split the way
//    the lists were built ("couldn't help but feel" -> "could help feel").
//    Upstream matched stopword-free trigrams against the full token stream, so
//    many entries could never fire.
//  * Repeats have diminishing returns, judged by density rather than raw count (repeatWeight): an item
//    seen k times in a 700-word text counts w * (1 + ln k), and a text twice as long needs twice the hits
//    for the same weight. (Before scorer 0.7.0 it was w * (1 + ln k) at any length, which pushed long
//    cards down: the same text pasted 16 times scored about half.)
//  * Bigrams are scored too; a bigram inside a matched trigram is not double counted.
//  * Rates are normalized against card-sized (~700 word) chunks of AI fiction
//    (data/botstyle_calibration.json), not whole-corpus leaderboard averages, and the
//    score carries a confidence band from the hit counts.

import { normalizeQuotes } from './utils.js';
import { scorerProfile } from './scorer-profile.js';

const STOPWORDS = new Set(`i me my myself we our ours ourselves you your yours yourself yourselves
he him his himself she her hers herself it its itself they them their theirs themselves what
which who whom this that these those am is are was were be been being have has had having do
does did doing a an the and but if or because as until while of at by for with about against
between into through during before after above below to from up down in out on off over under
again further then once here there when where why how all any both each few more most other
some such no nor not only own same so than too very s t can will just don should now`.split(/\s+/));

// Composite weights. Kept in one place so the platform can tune them.
// words / phrases / structures. Structures = not-x-but-y + AI sentence patterns
// (js/ai-structures.js). 60/25/15 was best on both SlopReview (0.978) and the
// Gutenberg antislop-DPO pairs (0.993).
export const BOTSTYLE_WEIGHTS = { words: 0.60, phrases: 0.25, structures: 0.15 };
export const MIN_PROSE_WORDS = 150;   // below this the score is reported as unreliable

let lists = null;        // { words: Map, bigrams: Map, trigrams: Map }
let names = null;        // AI-favorite names (Elara, Thorne…): tallied, not scored
let peers = null;        // per style family: percentiles of each component on 2023 cards
let calibration = null;  // { words: {p50,p90,...}, phrases: {...}, structures: {...}, emdash: {...} }

function splitClitic(t) {
  // Must stay in sync with split_clitic() in tools/build_lists.py
  if (t.endsWith("n't")) return t.slice(0, -3);
  const i = t.indexOf("'");
  return i > 0 ? t.slice(0, i) : t;
}

export function ngramTokens(text) {
  const raw = normalizeQuotes(text.toLowerCase()).match(/[a-z']+/g) || [];
  const out = [];
  for (let t of raw) {
    t = splitClitic(t.replace(/^'+|'+$/g, ''));
    if (t && /^[a-z]+$/.test(t) && !STOPWORDS.has(t)) out.push(t);
  }
  return out;
}

// Same tokens as ngramTokens(), with where each one sits in the text, so a matched phrase can be shown as it was
// written ("something she can't") rather than as its stopword-free list form ("something ca").
export function ngramTokenSpans(text) {
  const low = normalizeQuotes(String(text || '').toLowerCase()), out = [], rx = /[a-z']+/g;
  let m;
  while ((m = rx.exec(low))) {
    const lead = m[0].match(/^'*/)[0].length, core = m[0].replace(/^'+|'+$/g, '');
    const t = splitClitic(core);
    if (t && /^[a-z]+$/.test(t) && !STOPWORDS.has(t)) out.push({ t, s: m.index + lead, e: m.index + lead + core.length });
  }
  return out;
}

export async function loadBotstyle(base = './data/') {
  const get = async (f) => { const r = await fetch(base + f); if (!r.ok) throw new Error(f + ' missing'); return r.json(); };
  const toMap = rows => new Map(rows.map(r => [r[0], r[1]]));
  const [w, b, t] = await Promise.all([get('botstyle_words.json'), get('botstyle_bigrams.json'), get('botstyle_trigrams.json')]);
  lists = { words: toMap(w), bigrams: toMap(b), trigrams: toMap(t) };
  // Optional card calibration (tools/card_calibrate.mjs): words human cards use at least as often
  // as AI cards (genre vocabulary like "realm", "legendary") are not scored. Absent = full list.
  try { const drop = await get('botstyle_card_drop.json'); for (const k of Object.keys(drop.words || {})) lists.words.delete(k); lists.cardDrop = Object.keys(drop.words || {}).length; } catch { /* no drop list */ }
  try { calibration = await get('botstyle_calibration.json'); } catch { calibration = null; }
  try { peers = await get('botstyle_peers.json'); } catch { peers = null; }
  try { names = new Set((await get('botstyle_names.json')).map(r => r[0])); } catch { names = null; }
  return lists;
}

export function botstyleLoaded() { return !!lists; }
export function getCalibration() { return calibration; }

/**
 * Weighted slop hits over prose text.
 * Returns per-1k-word rates plus the raw hit list and a standard error for each rate.
 */
// Count-equivalent of k hits in an n-word text, damped by density: per 700 words, x hits count x up to 1
// and 1 + ln x above that. Length-invariant: repeating a text leaves its rate unchanged.
export const REF_WORDS = 700;
export function repeatWeight(k, nWords) {
  const n = Math.max(1, nWords), x = k * REF_WORDS / n;
  // 0.9.0 (maxRepeat): one item counts at most maxRepeat × its weight per 700 words
  const cap = scorerProfile().maxRepeat, c = x <= 1 ? x : 1 + Math.log(x);
  return (cap ? Math.min(cap, c) : c) * n / REF_WORDS;
}
// Per-word weight multipliers (0.9.0 pulpWeight): set by score-card.js from the pulp word list.
let wordFactor = null;
export function setWordFactors(map) { wordFactor = map; }

export function scoreWeighted(proseText) {
  if (!lists) throw new Error('call loadBotstyle() first');
  const spans = ngramTokenSpans(proseText), toks = spans.map(x => x.t);
  const example = new Map(), keep = (g, i, n) => { if (!example.has(g)) example.set(g, String(proseText).slice(spans[i].s, spans[i + n - 1].e).replace(/\s+/g, ' ')); };
  // Rates are per 1000 *running* words (stopwords included), like upstream.
  const nWords = (proseText.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;

  const covered = new Uint8Array(toks.length);
  const tri = new Map(), bi = new Map(), wd = new Map();
  for (let i = 0; i + 2 < toks.length; i++) {
    const g = toks[i] + ' ' + toks[i + 1] + ' ' + toks[i + 2];
    if (lists.trigrams.has(g)) { tri.set(g, (tri.get(g) || 0) + 1); keep(g, i, 3); covered[i] = covered[i + 1] = covered[i + 2] = 1; }
  }
  for (let i = 0; i + 1 < toks.length; i++) {
    if (covered[i] && covered[i + 1]) continue;
    const g = toks[i] + ' ' + toks[i + 1];
    if (lists.bigrams.has(g)) { bi.set(g, (bi.get(g) || 0) + 1); keep(g, i, 2); }
  }
  for (const t of toks) if (lists.words.has(t)) wd.set(t, (wd.get(t) || 0) + 1);

  // Sum of w * repeatWeight(k) and its Poisson-style variance (sum of w^2 * k), per 1k words.
  const agg = (hits, map) => {
    let s = 0, v = 0;
    const rows = [];
    const pw = map === lists.words && wordFactor ? scorerProfile().pulpWeight : 1;
    for (const [g, k] of hits) {
      const w = map.get(g) * (pw !== 1 && wordFactor.has(g) ? pw : 1);
      s += w * repeatWeight(k, nWords); v += w * w * k;
      rows.push({ item: g, count: k, weight: w, ...(example.has(g) ? { example: example.get(g) } : {}) });
    }
    rows.sort((a, b) => b.weight * b.count - a.weight * a.count);
    const per = nWords ? 1000 / nWords : 0;
    return { rate: s * per, se: Math.sqrt(v) * per, hits: rows };
  };
  const W = agg(wd, lists.words);
  const T = agg(tri, lists.trigrams);
  const B = agg(bi, lists.bigrams);
  return {
    nWords,
    words: W,
    phrases: { rate: T.rate + B.rate, se: Math.hypot(T.se, B.se), hits: T.hits.concat(B.hits).sort((a, b) => b.weight * b.count - a.weight * a.count) },
    trigrams: T, bigrams: B,
  };
}

// Normalize a rate to 0..1: 0 = no hits, 1 = the p90 of the anchor set. Since scorer 0.7.0 the anchor is
// AI-written character cards (calibration.cards, tools/calibrate_cards.mjs): 1 = as AI-styled as the most
// AI-styled tenth of AI cards. Before that it was 700-word chunks of AI fiction (calibration.words etc.),
// which card descriptions rarely approach, so card scores bunched in the bottom third of the scale.
// Falls back to fixed constants if the calibration file is missing.
const FALLBACK = { words: { p90: 408 }, phrases: { p90: 75 }, structures: { p90: 9 } };
export function normRate(metric, v) {
  const c = (calibration && calibration.cards && calibration.cards[metric]) || (calibration && calibration[metric]) || FALLBACK[metric];
  return Math.max(0, Math.min(1, v / c.p90));
}

/**
 * Composite botstyle score 0..100 with a confidence band.
 * @param {object} w   result of scoreWeighted()
 * @param {object} st  result of scoreStructures() (js/ai-structures.js) on the same prose
 * @param {number} artifactPoints  points from findArtifacts() (js/ai-artifacts.js)
 *
 * Em-dash overuse and obvious AI tells add points on top; everything else is a
 * normalized rate (0..1 per component, 1 = sloppiest 10% of card-sized AI chunks).
 */
export function computeBotstyleScore(w, st, artifactPoints = 0) {
  const K = BOTSTYLE_WEIGHTS;
  st = st || { rate: 0, se: 0, emdash: { points: 0 } };
  const at = (dw, dp, ds) =>
    (normRate('words', Math.max(0, w.words.rate + dw * w.words.se)) * K.words +
     normRate('phrases', Math.max(0, w.phrases.rate + dp * w.phrases.se)) * K.phrases +
     normRate('structures', Math.max(0, st.rate + ds * st.se)) * K.structures) * 100;
  // Band: one standard error on each component, plus a floor for an unseen hit
  // (a clean 300-word sample is weaker evidence than a clean 3000-word one).
  const unseen = w.nWords ? 1000 / w.nWords : 0;
  const upper = Math.max(at(1, 1, 1), (normRate('words', w.words.rate + unseen) * K.words +
    normRate('phrases', w.phrases.rate + unseen) * K.phrases + normRate('structures', st.rate + unseen) * K.structures) * 100);
  const emPts = (st.emdash && st.emdash.points) || 0;
  const add = x => Math.min(100, x + artifactPoints + emPts);
  return {
    score: add(at(0, 0, 0)),
    low: add(at(-1, -1, -1)),
    high: add(upper),
    base: at(0, 0, 0),
    artifactPoints, emdashPoints: emPts,
    reliable: w.nWords >= MIN_PROSE_WORDS,
    components: {
      words: normRate('words', w.words.rate),
      phrases: normRate('phrases', w.phrases.rate),
      structures: normRate('structures', st.rate),
    },
  };
}

/**
 * Where a card sits among cards of the same style family (2023 cards, mostly human).
 * Returns 0..100 (percentile) or null when there's no peer table for that family.
 */
export function peerPercentile(family, metric, value) {
  const t = peers && peers.families && peers.families[family] && peers.families[family][metric];
  if (!t) return null;
  const qs = peers.quantiles;                    // e.g. [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99]
  if (value <= t[0]) return Math.round(qs[0] * 100 * (t[0] ? value / t[0] : 1));
  for (let i = 1; i < t.length; i++) if (value <= t[i]) {
    const f = t[i] === t[i - 1] ? 1 : (value - t[i - 1]) / (t[i] - t[i - 1]);
    return Math.round(100 * (qs[i - 1] + f * (qs[i] - qs[i - 1])));
  }
  return 100;
}
export function getPeers() { return peers; }

/**
 * AI-favorite names (Elara, Kael, Thorne, Silas…) found in the prose. Not scored:
 * canon and original characters can legitimately have these names.
 */
export function tallyNames(proseText) {
  if (!names) return [];
  const m = new Map();
  for (const t of ngramTokens(proseText)) if (names.has(t)) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].map(([item, count]) => ({ item: item[0].toUpperCase() + item.slice(1), count })).sort((a, b) => b.count - a.count);
}
