// old-school.js - "Old-school AI" read: the essay and character-sheet register of older models (ChatGPT-era GPT-3.5 /
// GPT-4 and 2024-era open models such as Phi-4, Mistral Small, Gemma 3, Llama 3) that the fiction-built lists don't
// target: "a testament to", "meticulously", "intricacies", "a force to be reckoned with", "a sharp wit". Unscored and
// experimental. Newer models (GPT-5/6, Claude 4.5+, GLM 5, Kimi K2, Gemini 3) almost never write this way, so it
// points at older bots, not at AI writing in general.
//
// Two kinds of item:
// - checked: used by older models' cards at least 2.5× as often as by 2023 cards (numbers in docs/LISTS.md);
//   these decide the level.
// - listed: from Wikipedia's "Signs of AI writing" guide (essay transitions, significance framing, -ing tails). On cards
//   they're as common in 2023 cards as in any model we could test, and we have no GPT-3.5 cards to check them against,
//   so they're shown but don't move the level.
//
//   oldSchoolTells(text) -> { level: 'strong' | 'some' | 'none', items, count, per1k, hits: [{ id, label, count, examples, checked }] }

const X = '(?:her|his|their|its|a)';
const P = [
  ['vocab', 'Older-model vocabulary (meticulously, intricacies, tapestry…)', true,
    /\b(?:intricacies|interplay|meticulously|tapestr(?:y|ies)|delved|delving|paramount|fostered|resonat(?:e|ing)|unwavering|vibrant|invaluable|myriad|captivating|embark|leverag(?:e|ing))\b/gi],
  ['significance', 'Significance framing ("a testament to", "dedication to her…")', true,
    new RegExp(`\\b(?:(?:is )?a testament to|dedication to ${X}|a beacon of|rich history|commitment to)\\b`, 'gi')],
  ['sheet', 'Stock character-sheet lines ("a force to be reckoned with")', true,
    new RegExp(`\\b(?:a force to be reckoned with|${X} (?:sharp|quick) wit|heart of gold|always willing to (?:lend|help)|with an air of confidence|strong sense of (?:loyalty|duty)|unwavering (?:dedication|loyalty)|(?:is|are) known for ${X}|a valuable asset)\\b`, 'gi')],
  ['tail', 'Summing-up tails (", reflecting the…", ", symbolizing…")', true,
    new RegExp(`, (?:reflecting|symbolizing|showcasing) (?:the|${X})\\b`, 'gi')],
  ['complexities', '"Navigating the complexities"', true, /\bnavigat(?:e|es|ing) the (?:complexities|challenges|intricacies)\b/gi],
  ['essay', 'Essay transitions ("Furthermore,", "Overall,") [Wikipedia list, unconfirmed on cards]', false,
    /(?:^|[.!?]\s+|\n\s*)(?:Additionally|Furthermore|Moreover|Overall|In conclusion|In summary|Ultimately),|\b(?:it'?s|it is) (?:important|worth|crucial) (?:to (?:note|remember|mention)|noting)\b|\bin today'?s (?:world|society|fast-paced)\b/gim],
  ['wiki', 'Other Wikipedia-listed signs ("plays a crucial role", "delve", "fostering") [unconfirmed on cards]', false,
    /\b(?:plays? (?:a|an) (?:crucial|vital|pivotal|key|significant|integral) role|delv(?:e|es)|pivotal|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|foster(?:s|ing)?|garner(?:s|ed|ing)?|multifaceted|nuanced|deeply rooted|nestled (?:in|within)|in the heart of|seamless(?:ly)?|indelible)\b/gi],
];

export function oldSchoolTells(text) {
  const t = String(text || ''), n = Math.max(1, (t.match(/[A-Za-z']+/g) || []).length);
  const hits = []; const distinct = new Set();
  for (const [id, label, checked, rx] of P) {
    rx.lastIndex = 0; const m = [...t.matchAll(rx)].map(x => x[0].replace(/^[\s.!?,]+/, '').trim().toLowerCase());
    if (!m.length) continue;
    if (checked) for (const e of m) distinct.add(e.replace(/\b(?:her|his|their|its)\b/g, 'x'));
    hits.push({ id, label, checked, count: m.length, examples: [...new Set(m)].slice(0, 4) });
  }
  const checkedHits = hits.filter(h => h.checked), count = checkedHits.reduce((a, x) => a + x.count, 0), per1k = +(count * 1000 / n).toFixed(1);
  // Distinct checked items, not raw counts, so one word repeated ("vibrant" ×4) can't make a card old-school.
  const items = distinct.size;
  const level = items >= 3 && per1k >= 4 ? 'strong' : items >= 2 ? 'some' : 'none';
  return { level, items, count, per1k, hits };
}
