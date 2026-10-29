// mood.js - Mood read, just for fun and unscored: which feelings a card's wording leans on more than 2023 cards do,
// from Empath's emotion word lists (Fast et al. 2016, MIT; built from 1.8 billion words of Wattpad fiction).
// For each mood, the rate per 1,000 words is placed among 2023 cards; the two moods at the 80th percentile or above
// (with 2+ words each) make the label, e.g. "Melancholy · Tender". Nothing standing out reads "Even-keeled".
//
// data/botstyle_mood.json (tools/build_card_words.mjs): { moods: { id: { label, words: [...] } }, q: { id: [21 quantiles] } }.
let MOOD = null;
export function setMoodData(d) { MOOD = d && d.moods ? { ...d, sets: Object.fromEntries(Object.entries(d.moods).map(([k, v]) => [k, new Set(v.words)])) } : null; }
export function moodData() { return MOOD; }

export function moodRates(text, data = MOOD) {
  const toks = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
  const n = Math.max(1, toks.length), out = {};
  for (const [id, set] of Object.entries(data.sets)) {
    const hits = new Map(); for (const t of toks) if (set.has(t)) hits.set(t, (hits.get(t) || 0) + 1);
    const count = [...hits.values()].reduce((a, b) => a + b, 0);
    out[id] = { rate: 1000 * count / n, count, words: [...hits].sort((a, b) => b[1] - a[1]).map(([w]) => w) };
  }
  return { rates: out, n };
}
const pctOf = (q, v) => { let i = 0; while (i < q.length && q[i] <= v) i++; return Math.round(100 * Math.max(0, i - 1) / (q.length - 1)); };

/** @returns {{ label, top: [{ id, label, percentile, words }] }} or null under 100 words or without data. */
export function moodRead(text, data = MOOD) {
  if (!data) return null;
  const { rates, n } = moodRates(text, data); if (n < 100) return null;
  const ranked = Object.entries(rates).map(([id, r]) => ({ id, label: data.moods[id].label, percentile: data.q[id] ? pctOf(data.q[id], r.rate) : 0, count: r.count, words: r.words.slice(0, 5) }))
    .filter(x => x.count >= 2 && x.percentile >= 80).sort((a, b) => b.percentile - a.percentile || b.count - a.count);
  return { label: ranked.length ? ranked.slice(0, 2).map(x => x.label).join(' · ') : 'Even-keeled', top: ranked.slice(0, 3) };
}
