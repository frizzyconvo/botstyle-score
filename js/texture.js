// texture.js - EXPERIMENTAL "texture" signals that don't depend on word lists.
//
// Foreverse's character-card-skills notes that modern AI cards avoid the slop vocabulary and
// that what gives them away is texture: evenly distributed detail, no idle lines, perfect
// structure. Of the texture measures tested (tools/texture_features.mjs, BOTSTYLE.md), the one
// that held up on every labelled set is paragraph evenness: AI text keeps paragraphs close to
// the same length.
//   paragraph-length CV, 2023 human cards vs AI cards: median 0.67 vs 0.32 (AUC 0.89),
//   Gutenberg 0.69 vs 0.38 (0.86), SlopReview 0.60 vs 0.44 (0.77); inside one format too
//   (free prose 0.85, in-voice 0.82, where the word lists are weakest).
// Combined with the botstyle score in a two-feature logistic model it lifts card AUC from
// 0.867 to 0.951 (5-fold CV) with no loss on Gutenberg (0.997) and a small one on SlopReview
// (0.973 vs 0.978). Vocabulary spread (MATTR) separates cards even better but is at chance on
// Gutenberg: it tracks polish, not AI, so it is reported and never combined.
//
// Nothing here changes the botstyle score or the band. It is returned as `texture` and
// `experimental` so the page and platform can show it while it is being evaluated.

const cv = a => {
  if (a.length < 3) return null;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  if (!m) return null;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m;
};

function mattr(toks, w = 100) {
  if (toks.length < w) return toks.length >= 40 ? new Set(toks).size / toks.length : null;
  let s = 0, n = 0;
  for (let i = 0; i + w <= toks.length; i += 25) { s += new Set(toks.slice(i, i + w)).size / w; n++; }
  return s / n;
}

// Fitted on 2,121 human cards (Chub before Jul 2023 + Korshuk) vs 836 AI cards (first
// generated run + SPB), class-balanced, inputs standardised. See BOTSTYLE.md.
const MODEL = { mu: [2.8812, 0.6030], sd: [0.7723, 0.3204], w: [1.8525, -1.9886], b: -1.3380 };
export const TEXTURE_REFERENCE = {
  paraCv: { human: 0.67, ai: 0.32 }, sentCv: { human: 0.54, ai: 0.50 }, mattr: { human: 0.73, ai: 0.80 }, wordLen: { human: 4.57, ai: 4.97 },
};

/** prose: the preprocessed prose (scoreCard's result.prose). */
export function textureFeatures(prose) {
  const text = String(prose || '');
  const paras = text.split(/\n\s*\n/).map(p => (p.match(/[A-Za-z']+/g) || []).length).filter(n => n >= 5);
  const sents = text.split(/(?<=[.!?…])\s+|\n+/).map(s => (s.match(/[A-Za-z']+/g) || []).length).filter(n => n > 0);
  const toks = text.toLowerCase().match(/[a-z']+/g) || [];
  return {
    paragraphs: paras.length,
    paraCv: cv(paras),
    sentCv: cv(sents),
    mattr: mattr(toks),
    wordLen: toks.length ? toks.reduce((a, t) => a + t.length, 0) / toks.length : null,
  };
}

/** Two-feature model (botstyle score + paragraph evenness). Null when it can't be computed. */
export function aiStyleLikelihood(score, tex, proseWords) {
  if (!tex || tex.paraCv === null || proseWords < 150) return null;
  const x = [Math.log1p(Math.max(0, score)), tex.paraCv];
  const z = MODEL.b + x.reduce((a, v, i) => a + MODEL.w[i] * (v - MODEL.mu[i]) / MODEL.sd[i], 0);
  return 1 / (1 + Math.exp(-z));
}
