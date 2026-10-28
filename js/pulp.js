// pulp.js - Experimental pulp score (unscored). Some AI-favoured words are also everyday vocabulary
// of human genre cards (fantasy, horror, action, romance): hero, realm, primal, aura, crimson...
// data/botstyle_pulp_words.json (tools/build_pulp_words.mjs) lists the scored words that human
// genre cards use at least as often as AI cards. The pulp score is the share of the card's
// AI-favoured word weight that comes from those words; the genre-adjusted score is the botstyle
// score recomputed without them. Neither changes the botstyle score or the band.
import { computeBotstyleScore } from './botstyle.js';

let PULP = null;
export async function loadPulp(base = './data/') {
  try { const r = await fetch(base + 'botstyle_pulp_words.json'); if (r.ok) PULP = new Set(Object.keys((await r.json()).words || {})); } catch { PULP = null; }
}
export function pulpLoaded() { return !!PULP; }

/**
 * @param {object} w   scoreWeighted() result      @param {object} st  scoreStructures() result
 * @param {number} artifactPoints                   @param {object} genre detectGenre() result
 * @param {object} bands { original, common } cut-offs
 */
export function pulpScore(w, st, artifactPoints, genre, bands) {
  if (!PULP || !w || !w.nWords) return null;
  const per = 1000 / w.nWords;
  let total = 0, pulp = 0; const words = [];
  for (const h of w.words.hits) {
    const part = h.weight * (1 + Math.log(h.count)) * per;
    total += part;
    if (PULP.has(h.item)) { pulp += part; words.push(h.item); }
  }
  const share = total ? pulp / total : 0;
  const w2 = { ...w, words: { ...w.words, rate: Math.max(0, w.words.rate - pulp), se: w.words.se * (total ? Math.sqrt(Math.max(0, 1 - share)) : 1) } };
  const adjusted = computeBotstyleScore(w2, st, artifactPoints).score;
  const original = computeBotstyleScore(w, st, artifactPoints).score;
  // Flags: a pulpy card whose AI-styled reading is mostly genre vocabulary, vs one that stays
  // AI-styled even without it.
  let flag = null;
  if (share >= 0.15 && original >= bands.original) flag = adjusted < bands.original ? 'pulp_not_ai' : 'pulp_and_ai';
  return {
    score: Math.round(share * 100), adjusted: +adjusted.toFixed(1), delta: +(original - adjusted).toFixed(1), words: words.slice(0, 20),
    genre: genre ? genre.primary : null, flag,
    flagLabel: flag === 'pulp_not_ai' ? 'Reads as pulp, not AI-styled' : flag === 'pulp_and_ai' ? 'Pulpy and AI-suspect' : null,
  };
}
