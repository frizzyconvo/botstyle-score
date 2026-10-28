// repetition.js - Repeated wording inside and between the parts of a card.
//
// Card writers reuse their own phrasing sometimes (a greeting reworked into an alternate greeting is normal),
// but the same multi-word phrase coming back again and again inside the description or the greeting, or the
// greeting restating the description, is at best weak writing and is also a model habit. Measured on word
// 4-grams with at least two content words, macros ({{char}}, {{user}}) collapsed to one token.
const STOP = new Set('a an the and or but of to in on at by for with from as is are was were be been being it its this that these those he she they them his her their him i you your my me we our us not no so if then than too very can could would should will just do does did have has had into over under out up down about there here what which who whom when where why how all any some more most such only own same other each both few off again once'.split(' '));
const toks = t => String(t || '').toLowerCase().replace(/\{\{[^}]+\}\}/g, ' macro ').match(/[a-z]+(?:'[a-z]+)?/g) || [];
const grams = (w, n = 4) => { const out = []; for (let i = 0; i + n <= w.length; i++) { const g = w.slice(i, i + n); if (g.filter(x => !STOP.has(x) && x !== 'macro').length >= 2) out.push(g.join(' ')); } return out; };

/** Repeats inside one text: extra occurrences of 4-grams per 1k words, and the most repeated ones. */
export function repeatsWithin(text) {
  const w = toks(text); if (w.length < 40) return { per1k: 0, count: 0, top: [], words: w.length };
  const c = new Map(); for (const g of grams(w)) c.set(g, (c.get(g) || 0) + 1);
  let extra = 0; const top = [];
  for (const [g, k] of c) if (k > 1) { extra += k - 1; top.push([g, k]); }
  top.sort((a, b) => b[1] - a[1]);
  return { per1k: +(1000 * extra / w.length).toFixed(2), count: extra, top: top.slice(0, 5), words: w.length };
}

/** Wording shared between two texts: distinct 4-grams found in both, per 1k words of the shorter one. */
export function sharedBetween(a, b) {
  const wa = toks(a), wb = toks(b); const n = Math.min(wa.length, wb.length); if (n < 40) return { per1k: 0, count: 0, top: [] };
  const A = new Set(grams(wa)), shared = [...new Set(grams(wb))].filter(g => A.has(g));
  return { per1k: +(1000 * shared.length / n).toFixed(2), count: shared.length, top: shared.slice(0, 5) };
}

/** All repetition read-outs for a card. Alternate greetings reusing the first message are noted, not judged. */
export function cardRepetition(description, greeting, alternates = []) {
  const alts = (alternates || []).filter(Boolean);
  return {
    description: repeatsWithin(description), greeting: repeatsWithin(greeting), between: sharedBetween(description, greeting),
    altReuse: alts.length ? sharedBetween(greeting, alts.join('\n\n')) : null,
  };
}
