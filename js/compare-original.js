// compare-original.js - Sam Paech's original slop-score formula on the same text, and why it and BBBScorer differ.
// Used by the page (the "BBBScorer vs the original slop score" section) and by tools/score_all.mjs (disparity marks
// and notes.md), so both explain a gap the same way.
import { computeSlopIndex } from './metrics.js';
import { wordsOnlyLower, alphaTokens } from './utils.js';
import { scoreText as scoreContrast } from './contrast-detector.js';

const nz = (v, r) => r ? Math.max(0, Math.min(1, (v - r.min) / (r.max - r.min))) : 0;
const quiet = fn => { const o = {}; for (const k of ['log', 'group', 'groupEnd', 'warn']) { o[k] = console[k]; console[k] = () => {}; } try { return fn(); } finally { Object.assign(console, o); } };

/**
 * Original slop score of a text: 60% slop-list words, 25% not-x-but-y, 15% slop-list trigrams, each stretched
 * between the upstream leaderboard's range (norm = data/upstream_norm.json: { words, trigrams, contrast } min/max).
 * trackHits adds the slop-list words and trigrams it found.
 */
export function originalParts(text, norm, trackHits = false) {
  const toks = alphaTokens(wordsOnlyLower(text)); if (!toks.length) return null;
  const s = computeSlopIndex(toks, trackHits), c = quiet(() => scoreContrast(text)).rate_per_1k;
  const parts = { words: nz(s.wordScore, norm.words), contrast: nz(c, norm.contrast), trigrams: nz(s.trigramScore, norm.trigrams) };
  const out = { score: +((parts.words * .6 + parts.contrast * .25 + parts.trigrams * .15) * 100).toFixed(2),
    words: +s.wordScore.toFixed(2), trigrams: +s.trigramScore.toFixed(2), contrast: +c.toFixed(3), parts, tokens: toks.length };
  if (trackHits) {
    const top = m => !m ? [] : (Array.isArray(m) ? m : [...m.entries()]).map(e => Array.isArray(e) ? { item: e[0], count: e[1] } : { item: e.word || e.item, count: e.count }).sort((a, b) => b.count - a.count);
    out.wordHits = top(s.wordHits); out.trigramHits = top(s.trigramHits);
  }
  return out;
}

export const DISPARITY = { big: 30, veryBig: 50 };

/** Disparity mark and likely reasons between a scoreCard() result and originalParts() on its text. */
export function disparity(r, up) {
  if (!up) return null;
  const d = +(r.score - up.score).toFixed(1), a = Math.abs(d);
  if (a < DISPARITY.big) return { diff: d };
  const why = [], st = r.stats, share = st.totalWords ? st.proseWords / st.totalWords : 1;
  if (d > 0) {
    if (r.components.phrases >= .5 || r.components.structures >= .5) why.push('AI phrases/structures the original lists lack');
    if (share < .6) why.push(`only ${Math.round(share * 100)}% prose (original counts lists and boilerplate, diluting it)`);
    if (up.words < 8) why.push(`few original slop-list words (${up.words}/1k)`);
    if (r.emdashPoints > 0) why.push(`em-dash points +${r.emdashPoints.toFixed(0)}`);
    if (r.artifactPoints > 0) why.push(`chatbot leftovers +${r.artifactPoints}`);
  } else {
    if (up.trigrams >= 1) why.push(`original trigram hits (${up.trigrams}/1k) that BBBScorer drops or weights low`);
    if (up.words >= 20) why.push(`many original slop-list words (${up.words}/1k); BBBScorer weights by AI/human ratio`);
    if (share < .6) why.push(`only ${Math.round(share * 100)}% prose scored by BBBScorer`);
    if (r.pulp && r.pulp.score >= 15) why.push('genre vocabulary');
  }
  if (r.mixed) why.push(`mixed card (${r.mixed.higher} +${r.mixed.gap})`);
  return { diff: d, flag: a >= DISPARITY.veryBig ? 'very_big' : 'big', dir: d > 0 ? 'bbb_higher' : 'orig_higher', why };
}

/**
 * Plain-language reasons the two scores differ on this card, biggest first, for the page. Each item is
 * { side: 'bbb' | 'orig' | 'both', text }.
 */
export function explainDifference(r, up) {
  if (!up) return [];
  const out = [], st = r.stats, share = st.totalWords ? st.proseWords / st.totalWords : 1, gap = r.score - up.score;
  const bbbOnly = (r.hits.phrases || []).slice(0, 4).map(x => `"${x.example || x.item}"`).concat((r.hits.structures || []).slice(0, 3).map(x => x.label));
  // the scale: the original is stretched between 22 models' story averages, so cards bunch up low on it
  out.push({ side: 'both', text: `Different scales. 100 on BBBScorer means "as AI-styled as the most AI-styled tenth of AI-written cards". The original stretches each measure between the lowest and highest of 23 entries (22 models and a human baseline) on stories and essays, so most cards, AI-written ones included, land under 30 on it (AI-written cards: median about 7–18).` });
  out.push({ side: 'both', text: `Different lists, counted differently. The original's list comes from 10 models' essays and stories (it includes essay and business words like "delve" and "pivotal"), and every hit counts the same. BBBScorer's lists come from fiction, and each word and phrase is weighted by how much more AI uses it than human writers.` });
  if (gap > 0 && (r.components.phrases >= .3 || r.components.structures >= .3) && bbbOnly.length)
    out.push({ side: 'bbb', text: `BBBScorer counts phrases and sentence patterns the original's lists don't have: ${bbbOnly.join(', ')}.` });
  if (gap > 0 && up.words < 8) out.push({ side: 'bbb', text: `Few words from the original's slop list (${up.words} per 1,000 words${up.words === 0 ? ', so it sits at its floor' : ''}). Much card-writing AI vocabulary isn't on it.` });
  if (share < .6) out.push({ side: gap > 0 ? 'bbb' : 'orig', text: `Only ${Math.round(share * 100)}% of the text is prose. BBBScorer scores just the prose (${st.proseWords} words); the original counts lists, headers and instructions too (${up.tokens} words), which ${gap > 0 ? 'dilutes its rate' : 'can add its list words'}.` });
  if (gap < 0 && up.words >= 20) out.push({ side: 'orig', text: `Many words from the original's slop list (${up.words} per 1,000), but they're words human writers use a lot too, so BBBScorer weights them low.` });
  if (gap < 0 && up.trigrams >= 1) out.push({ side: 'orig', text: `The original finds slop-list three-word phrases (${up.trigrams} per 1,000) that BBBScorer drops or weights low.` });
  if (gap < 0 && r.pulp && r.pulp.score >= 15) out.push({ side: 'orig', text: `Genre vocabulary (${Math.round(r.pulp.score)}% of the AI-favored word weight) that human genre cards use about as much.` });
  if (r.emdashPoints > 0) out.push({ side: 'bbb', text: `Em-dash overuse adds ${r.emdashPoints.toFixed(1)} points on BBBScorer only.` });
  if (r.artifactPoints > 0) out.push({ side: 'bbb', text: `Chatbot leftovers add ${r.artifactPoints} points on BBBScorer only.` });
  if (r.mixed) out.push({ side: 'bbb', text: `The ${r.mixed.higher} reads ${r.mixed.gap.toFixed(0)} points more AI-styled than the other part; BBBScorer scores the two separately and blends them, the original scores them together.` });
  if (gap > 0 && r.components.words >= .5 && up.words >= 8) out.push({ side: 'bbb', text: `Strongly AI-favored words weigh more on BBBScorer: its top words here are ${(r.hits.words || []).slice(0, 5).map(x => `"${x.item}"`).join(', ')}.` });
  return out;
}
