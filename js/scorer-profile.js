// scorer-profile.js - Which BBBScorer version's rules are active.
//
// The page, the tools and every stored score use the default (0.8.2: 0.8.1's scores, four bands). BBBScorer 0.9.1 is prepared but not
// switched on: tools can opt in (score_all.mjs --scorer 0.9.1, dev experiments) to test it before the rescore.
// 0.9.0 is kept only to describe its one full run (eval/old/scores/v0.9.0): 0.9.1 = 0.9.0 + the card-mined lists, which
// were added after that run had started. Any change to a prepared profile that moves scores gets a new number.
// Each switch below is one change from dev notes (rescore ideas); 0.8.1 has them all off.
//
//   plistParens     a PList wrapped in parentheses or braces, "([Name: …; personality: …])", is a PList, not prose
//   maxRepeat       one word or phrase counts at most this many times its weight per 700 words, however often it is
//                   repeated (a topical word like "eternity" x6 can't carry a card). null = no cap (1 + ln k only)
//   stripRpAsterisks  RP asterisks are removed before the sentence patterns run, so `"Miss me?" *she purrs.*` counts
//                   as a banter tag
//   compactValues   points for long trait values inside W++ / PList blocks (AI-written blocks use phrase-length
//                   values: "A little insecure beneath his sunny confidence"; human ones single words)
//   texture         points for even paragraph lengths, minus points for very uneven ones (paragraph-length CV)
//   pulpWeight      weight multiplier for genre words human genre cards use as often as AI (1 = unchanged)
//   lengthBands     band cut-offs by prose length (data/botstyle_length_bands.json) instead of one 40 / 60 for all
//   cardLists       points from words and phrases mined from AI-written character cards (data/botstyle_card_lists.json,
//                   tools/mine_card_lists.mjs): weight × 100 × min(1, rate / p90), rate = summed weights of the items a card
//                   uses per 1,000 prose words. Tested with models and characters held out (eval/experiments/remine_eval.md).
//   patternsOff / patternsOn  sentence patterns switched off / on (ids from js/ai-structures.js), from rechecking every
//                   pattern on character cards instead of the stories they were picked on
export const DEFAULT_SCORER = '0.8.2';
export const NEXT_SCORER = '0.9.1';
export const PROFILES = {
  '0.8.1': { plistParens: false, maxRepeat: null, stripRpAsterisks: false, compactValues: null, texture: null, pulpWeight: 1, lengthBands: false, patternsOff: [], patternsOn: [], cardLists: null },
  '0.8.2': { plistParens: false, maxRepeat: null, stripRpAsterisks: false, compactValues: null, texture: null, pulpWeight: 1, lengthBands: false, patternsOff: [], patternsOn: [], cardLists: null },   // same rules as 0.8.1; only the bands changed (four bands)
  '0.9.0': {
    plistParens: true, maxRepeat: 2.5, stripRpAsterisks: true,
    // Tested and left off (2026-10-28 sample): half of the 2023 compact cards also use phrase-length W++ / PList entries,
    // so the points raised human compact cards as much as AI ones (AUC 0.857 -> 0.839). Kept as a switch for later data.
    compactValues: null,   // e.g. { minValues: 6, from: 2.5, to: 5, max: 20 }: points ramp from mean 2.5 to 5 words per value
    texture: { minParagraphs: 3, minWords: 150, pivot: 0.6, perUnit: 30, min: -12, max: 20 },   // points = perUnit × (pivot − CV)
    pulpWeight: 0.5, lengthBands: true,
    // These six were picked on stories; on character cards they don't separate (or lean human): 2026-10-28 recheck.
    patternsOff: ['found_herself', 'it_was_as_if', 'hung_heavy', 'felt_a_surge', 'unspoken', 'not_just_shes'], patternsOn: [],
    cardLists: null,   // (its first run also used the provisional length bands from before 2026-10-28 19:53)
  },
  '0.9.1': {
    // 0.9.0 + card-mined lists
    plistParens: true, maxRepeat: 2.5, stripRpAsterisks: true,
    // Tested and left off (2026-10-28 sample): half of the 2023 compact cards also use phrase-length W++ / PList entries,
    // so the points raised human compact cards as much as AI ones (AUC 0.857 -> 0.839). Kept as a switch for later data.
    compactValues: null,   // e.g. { minValues: 6, from: 2.5, to: 5, max: 20 }: points ramp from mean 2.5 to 5 words per value
    texture: { minParagraphs: 3, minWords: 150, pivot: 0.6, perUnit: 30, min: -12, max: 20 },   // points = perUnit × (pivot − CV)
    pulpWeight: 0.5, lengthBands: true,
    // These six were picked on stories; on character cards they don't separate (or lean human): 2026-10-28 recheck.
    patternsOff: ['found_herself', 'it_was_as_if', 'hung_heavy', 'felt_a_surge', 'unspoken', 'not_just_shes'], patternsOn: [],
    cardLists: { weight: 0.3 },
  },
};
let current = DEFAULT_SCORER, overrides = {};
/** Switch rules (tools and experiments only). overrides replace single switches, e.g. { texture: null }. */
export function setScorerProfile(version = DEFAULT_SCORER, over = {}) {
  if (!PROFILES[version]) throw new Error(`unknown scorer profile ${version}; known: ${Object.keys(PROFILES).join(', ')}`);
  current = version; overrides = over || {};
}
export function scorerProfile() { return { ...PROFILES[current], ...overrides }; }
export function scorerVersion() { return current; }
export function profileIsCustom() { return Object.keys(overrides).length > 0; }
