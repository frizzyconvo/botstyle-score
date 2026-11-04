// scorer-profile.js - Which BBBScorer version's rules are active.
//
// The page, the tools and every stored score use the default (0.9.1: card-mined lists, cut-offs by length, four bands).
// BBBScorer 0.10.0 is prepared but not switched on: tools can opt in (score_all.mjs --scorer 0.10.0, dev experiments)
// to test it before the rescore.
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
//   boldLabels      points for bold used as labels or headings ("**Appearance:**", "**Backstory**" on its own line):
//                   from `min` labels on, base + per × (count − min), at most `max`
//   cardLists.file / lengthBands.file  which data file a version uses (default botstyle_card_lists.json /
//                   botstyle_length_bands.json), so a re-mined list or new length bands get their own file
//   bandScheme      'v10' for the 0.10.0 bands (Original / Fresh / Mixed / Common); default: the four bands up to 0.9.x
//   patternsOff / patternsOn  sentence patterns switched off / on (ids from js/ai-structures.js), from rechecking every
//                   pattern on character cards instead of the stories they were picked on
export const DEFAULT_SCORER = '0.9.1';
export const NEXT_SCORER = '0.10.0';
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
  '0.9.3': {
    // 0.9.1 + bold labels / headings + its own length bands. 0.9.2 (the same plus card lists re-mined after card
    // generation round 5) was scored once and dropped: on the independent hold-out (early-2023 collections vs AI cards
    // never used for mining) the re-mined lists caught fewer AI cards than 0.9.1's, and the bold labels carried the gain.
    plistParens: true, maxRepeat: 2.5, stripRpAsterisks: true, compactValues: null,
    texture: { minParagraphs: 3, minWords: 150, pivot: 0.6, perUnit: 30, min: -12, max: 20 },
    pulpWeight: 0.5, lengthBands: { file: 'botstyle_length_bands_093.json' },
    patternsOff: ['found_herself', 'it_was_as_if', 'hung_heavy', 'felt_a_surge', 'unspoken', 'not_just_shes'], patternsOn: [],
    cardLists: { weight: 0.3 },
    boldLabels: { min: 2, base: 4, per: 1, max: 10 },
  },
  '0.9.4': {
    // 0.9.3 with rebuilt length bands (same scores, different band cut-offs): built from early-2023 collections the lists
    // were never mined from, ChatGPT-era cards left out of the human side, own cut-offs under 350 prose words and one
    // shared set from 350 up (per-length cut-offs for long cards rose to ~72 and missed real AI cards, which are mostly long).
    plistParens: true, maxRepeat: 2.5, stripRpAsterisks: true, compactValues: null,
    texture: { minParagraphs: 3, minWords: 150, pivot: 0.6, perUnit: 30, min: -12, max: 20 },
    pulpWeight: 0.5, lengthBands: { file: 'botstyle_length_bands_094.json' },
    patternsOff: ['found_herself', 'it_was_as_if', 'hung_heavy', 'felt_a_surge', 'unspoken', 'not_just_shes'], patternsOn: [],
    cardLists: { weight: 0.3 },
    boldLabels: { min: 2, base: 4, per: 1, max: 10 },
  },
  '0.10.0': {
    // 0.9.4's scores with the 0.10.0 bands: Original / Fresh / Mixed / Common (Familiar merges into Common). Fresh starts at
    // the 65th percentile of human cards of the same length (about 20 overall), Mixed at the 94th, Common at the 98th;
    // same human side and shared cut-offs from 350 prose words up as 0.9.4.
    plistParens: true, maxRepeat: 2.5, stripRpAsterisks: true, compactValues: null,
    texture: { minParagraphs: 3, minWords: 150, pivot: 0.6, perUnit: 30, min: -12, max: 20 },
    pulpWeight: 0.5, lengthBands: { file: 'botstyle_length_bands_0100.json' }, bandScheme: 'v10',
    patternsOff: ['found_herself', 'it_was_as_if', 'hung_heavy', 'felt_a_surge', 'unspoken', 'not_just_shes'], patternsOn: [],
    cardLists: { weight: 0.3 },
    boldLabels: { min: 2, base: 4, per: 1, max: 10 },
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
