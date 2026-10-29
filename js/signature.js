// signature.js - Two just-for-fun reads on vocabulary, both unscored:
//
// - Signature words: the card's rarest real words compared with 2023 cards (how many of the reference cards use each).
// - Unusual vocabulary: the share of the card's distinct words that fewer than 1 in 200 of those cards use, as a
//   percentile among 2023 cards. Names, typos and made-up words are left out: a word must be lowercase in the card at
//   least once and known to the English frequency list (zipf 1.5+), so "Elara" or "beutiful" don't count as novelty.
//
// data/botstyle_card_words.json (tools/build_card_words.mjs): { n, df: { word: cards using it }, unusualQ: [21 quantiles] }.
// Words used by fewer than 3 reference cards aren't stored; they count as "fewer than 3".
export const RARE_SHARE = 1 / 200;

/** Distinct candidate words: lowercase at least once, 4+ letters, known English (zipf >= 1.5 when a lookup is given). */
export function candidateWords(text, zipf = null) {
  const seen = new Map();
  for (const m of String(text || '').replace(/\{\{[^}]*\}\}/g, ' ').matchAll(/[A-Za-z][a-z'-]*[a-z]/g)) {
    const w = m[0], lw = w.toLowerCase().replace(/'s$/, '');
    if (lw.length < 4 || /['-]/.test(lw)) continue;
    const e = seen.get(lw) || { lower: false };
    if (w === w.toLowerCase()) e.lower = true;
    seen.set(lw, e);
  }
  return [...seen].filter(([w, e]) => e.lower && (!zipf || zipf(w) >= 1.5)).map(([w]) => w);
}

/** @returns {{ words: [{ word, cards }], unusualShare, percentile, n }} or null without data or words. */
export function signatureRead(text, data, zipf = null, { self = false } = {}) {
  if (!data || !data.df) return null;
  const words = candidateWords(text, zipf); if (words.length < 20) return null;
  const df = w => Math.max(0, (data.df[w] || 0) - (self ? 1 : 0));     // self: the card is itself one of the reference cards
  const rare = words.filter(w => df(w) < RARE_SHARE * data.n);
  const unusualShare = rare.length / words.length;
  let percentile = null;
  if (data.unusualQ) { const q = data.unusualQ; let i = 0; while (i < q.length && q[i] <= unusualShare) i++; percentile = Math.round(100 * Math.max(0, i - 1) / (q.length - 1)); }
  const sig = words.map(w => ({ word: w, cards: df(w), z: zipf ? zipf(w) : 0 })).sort((a, b) => a.cards - b.cards || a.z - b.z).slice(0, 6).map(({ word, cards }) => ({ word, cards }));
  return { words: sig, unusualShare: +unusualShare.toFixed(3), percentile, n: data.n };
}
