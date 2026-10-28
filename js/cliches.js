// cliches.js - Clichés humans and models BOTH use ("took a deep breath", "her heart
// pounding", "for a moment", "a playful smirk"). Tallied so creators can see them, but
// NOT scored: they don't tell human and AI writing apart. List: data/botstyle_cliches.json
// (tools/build_cliches.py), built from entries dropped from the scored lists.

import { ngramTokens } from './botstyle.js';

let C = null;

export async function loadCliches(base = './data/') {
  try {
    const r = await fetch(base + 'botstyle_cliches.json');
    if (!r.ok) return null;
    const j = await r.json();
    C = {
      phrases: new Map(j.phrases.map(p => [p[0], p[1]])),
      words: new Set(j.words.map(w => w[0])),
      patterns: j.patterns.map(p => ({ id: p.id, label: p.label, rx: new RegExp(p.regex, 'gi') })),
    };
  } catch { C = null; }
  return C;
}

export function tallyCliches(prose) {
  if (!C) return null;
  const text = String(prose || '');
  const toks = ngramTokens(text);
  const nWords = (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;
  const count = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  const ph = new Map(), wd = new Map(), pt = [];
  const covered = new Uint8Array(toks.length);
  for (let i = 0; i + 2 < toks.length; i++) {
    const g = toks[i] + ' ' + toks[i + 1] + ' ' + toks[i + 2];
    if (C.phrases.get(g) === 3) { count(ph, g); covered[i] = covered[i + 1] = covered[i + 2] = 1; }
  }
  for (let i = 0; i + 1 < toks.length; i++) {
    if (covered[i] && covered[i + 1]) continue;
    const g = toks[i] + ' ' + toks[i + 1];
    if (C.phrases.get(g) === 2) count(ph, g);
  }
  for (const t of toks) if (C.words.has(t)) count(wd, t);
  for (const p of C.patterns) {
    p.rx.lastIndex = 0;
    const m = text.match(p.rx);
    if (m) pt.push({ id: p.id, label: p.label, count: m.length, example: m[0] });
  }
  const sorted = m => [...m.entries()].map(([item, count]) => ({ item, count })).sort((a, b) => b.count - a.count);
  const phraseHits = sorted(ph).concat(pt.map(p => ({ item: p.label.replace(/^"|"$/g, ''), count: p.count, pattern: p.id })))
    .sort((a, b) => b.count - a.count);
  const total = phraseHits.reduce((a, x) => a + x.count, 0);
  const wordHits = sorted(wd);
  return { phraseHits, wordHits, phrasesPer1k: nWords ? total * 1000 / nWords : 0,
           wordsPer1k: nWords ? wordHits.reduce((a, x) => a + x.count, 0) * 1000 / nWords : 0 };
}
