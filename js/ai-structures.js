// ai-structures.js - AI sentence structures: the "structures" score component.
//
// Not-x-but-y (contrast-detector.js) plus sentence-level habits that a word list
// can't express: "a hint of …", "the air was thick …", "almost imperceptible",
// "a mix of X and Y", abstract similes ("like a promise", "like a physical blow"),
// banter tags (…," she teased), "maybe, just maybe", rhetorical Q-and-A beats.
//
// Each pattern was kept only if it separates human from AI text on BOTH SlopReview
// (Reddit stories) and the Gutenberg antislop-DPO pairs (classic literature);
// weight = log2(min(AI/human doc-rate ratio across the two sets) / 1.5), capped at 4.
// Patterns marked `provisional` are card-specific and currently supported by one
// AI source only (SPB-2602); treat their weights as placeholders.
// Mining script: tools/mine_structures.py. Rare-but-clean clichés are pooled into one
// 'stock_beats' pattern so their hits add up instead of each being too rare to weight.
// Not kept (no separation): stock banter
// lines ("took you long enough", "I don't bite"), "for a moment", "something akin to",
// one-word sentence triplets, participle openers.
//
// Also: em-dash density. Humans rarely exceed ~6 per 1000 words (2023 cards: p99 6.1;
// Reddit stories: p95 5.7); AI cards sit around 10. Above 6/1k it adds up to
// EMDASH_POINTS.max points on top of the score, reached at 16/1k.

import { repeatWeight } from './botstyle.js';
export const CONTRAST_WEIGHT = 2.0;   // per not-x-but-y match
export const EMDASH_POINTS = { free: 6, full: 16, max: 10 };   // max was 6 before scorer 0.7.0 (narrower scale)

// dedupeContrast: skip matches already found by the not-x-but-y detector (same sentence).
const P = (id, label, rx, w, example, provisional = false, dedupeContrast = false) => ({ id, label, rx, w, example, provisional, dedupeContrast });

export const STRUCTURE_PATTERNS = [
  P('hint_of', '"a hint/flicker/ghost of …"', /\b(?:a hint|a trace|a touch|a flicker|a glimmer|a ghost|a whisper) of (?:a )?\w+/gi, 3.48, 'a flicker of amusement'),
  P('testament_reminder', '"a testament/reminder to …"', /\b(?:a|the) (?:testament|reminder|stark reminder) (?:to|of|that)\b/gi, 3.31, 'a testament to her resilience'),
  P('air_thick', '"the air was thick/heavy/charged"', /\bthe air (?:was |is |grew |hung |felt )?(?:thick|heavy|charged|electric|crackl\w+|hum\w+|alive)\b/gi, 2.89, 'the air was thick with tension'),
  P('maybe_just_maybe', '"maybe, just maybe"', /\b(?:maybe|perhaps),? just (?:maybe|perhaps)\b/gi, 2.64, 'maybe, just maybe'),
  P('imperceptible', '"almost imperceptible" / "barely above a whisper"', /\b(?:almost|nearly) (?:imperceptibl\w+|inaudibl\w+)|\bbarely (?:audible|perceptible|above a whisper)\b/gi, 2.53, 'an almost imperceptible shimmer'),
  P('abstract_simile', 'Simile to an abstraction ("like a promise")', /\blike (?:a|an) (?:promise|secret|prayer|confession|memory|challenge|threat|question|benediction|lifeline|accusation|caress|warning|invitation|vow|heartbeat|living thing|second skin|physical (?:blow|thing|weight)|tangible (?:thing|weight)|balm|brand)\b/gi, 2.42, 'hung between them like a promise'),
  P('mix_of', '"a mix of X and Y"', /\b(?:a|the) (?:mix|mixture|blend|cocktail|combination) of \w+(?: \w+)? and \w+/gi, 2.19, 'a mix of fear and fascination'),
  P('weight_of', '"the weight of …"', /\bthe weight of (?:her|his|their|it|the|a|years|everything|centuries|the world)\b/gi, 2.17, 'the weight of her responsibility'),
  P('eyes_that_held', '"eyes that held/promised …"', /\b(?:eyes|gaze|voice|smile) (?:that|which) (?:held|carried|promised|spoke of|seemed to|hinted)\b/gi, 2.13, 'eyes that held a thousand secrets'),
  P('low_hum', '"a low hum/thrum"', /\b(?:a|the) (?:low|soft|quiet|faint|steady|constant) (?:hum|thrum|buzz|whir|drone)\b/gi, 1.82, 'the low hum of the city'),
  P('noun_of_abstract', '"a tapestry/symphony/dance of …"', /\b(?:a|the) (?:tapestry|symphony|dance|kaleidoscope|cacophony|mosaic|maelstrom|whirlwind|torrent|chorus) of\b/gi, 1.78, 'a whirlwind of joyous energy'),
  P('voice_texture', '"voice a low rumble/velvet caress"', /\b(?:voice|tone|words) (?:was |is )?(?:a )?(?:low|soft|warm|velvet\w*|honeyed|silken|gravelly|smoky|husky) (?:rumble|caress|murmur|purr|melody|drawl)\b/gi, 1.68, 'her voice a velvet caress'),
  P('as_if_world', '"as if the world/time itself …"', /\bas (?:if|though) (?:the (?:world|universe|very|air|room|night|house)|time itself|reality)\b/gi, 1.41, 'as if the world had paused'),
  P('practiced_ease', '"with practiced/languid ease"', /\bwith (?:a |an )?(?:practiced|deliberate|languid|effortless|predatory|feline|fluid|unhurried) (?:ease|grace|precision|movement|motion|confidence)\b/gi, 1.13, 'with practiced ease'),
  P('rhetorical_qa', 'Rhetorical question answered ("And the cost? Everything.")', /(?:^|[.!?]\s+)(?:And|But|So) (?:the |her |his |that |this |what )?\w+(?: \w+)?\?\s+[A-Z]/gm, 0.86, 'And the worst part? She liked it.'),
  P('unspoken', '"unspoken words/tension"', /\bunspoken (?:\w+ )?(?:words|question|promise|tension|understanding|truth|challenge)\b|\bsomething unspoken\b/gi, 0.83, 'thick with unspoken words'),
  P('every_every', '"every X, every Y"', /\b(?:every|each) \w+, (?:every|each) \w+/gi, 0.82, 'every glance, every touch'),
  P('banter_tag', 'Banter dialogue tag (…," she teased / purred / smirked)', /["”]\s*,?\s*(?:she|he|they|[A-Z]\w+) (?:\w+ly )?(?:teased|smirked|purred|quipped|drawled|chuckled|grinned|teases|smirks|purrs|quips|drawls|chuckles|grins)\b/g, 0.72, '"Miss me?" she purred'),
  P('not_just_shes', 'Card not-x-but-y ("she is not just a thief, she is a survivor")', /\b(?:is|was|isn't|wasn't|'s)\s+(?:not\s+)?(?:just|only|merely|simply)\s+(?:a |an |the |some )?[\w'\- ]{2,40}?[,;:—–.]\s+(?:she|he|they|it|[A-Z]\w+)(?:'s|\s+is|\s+was|\s+are|\s+were|'re)\s+(?:also\s+)?(?:a |an |the )?\w+/gi, 0.9, 'Vex isn\'t just a rogue. She\'s a legend.', false, true),
  // From SloppySeconds' community pattern list (pixelnull/sillytavern-SloppySeconds), same test:
  P('seemed_to', '"seemed to sense / consider / shimmer"', /\b(?:seemed|appeared) to (?:sense|consider|hold|shimmer|pulse|stretch|breathe|shift|soften)\b/gi, 2.53, 'the room seemed to hold its breath'),
  P('stock_beats', 'Stock beats (pooled rare clichés)', /\bthe air crackled\b|\bthe silence stretched\b|\bvoice (?:thick|heavy|laced|dripping) with\b|\bvoice steady despite\b|\bwith an? (?:intensity|ferocity|urgency|tenderness) that\b|\ba wave of \w+(?: \w+)? (?:washed|crashed|swept|rolled) over\b|\b\w+ that spoke (?:of|volumes)\b|\b(?:ready|prepared) to face whatever\b|\bface it together\b|\ba knowing (?:smile|smirk|look|glance)\b|\beyes (?:gleaming|glinting|alight|sparkling|shining|dancing) with\b|\beyes never leaving\b|\bbrow furrowed in concentration\b|\bnewfound sense of\b|\blittle did (?:she|he|they) know\b|\bfelt a strange sense\b|\bcouldn't shake the feeling\b|\bkaleidoscope of\b|\bfor what felt like an eternity\b|\b(?:fear|anger|determination|sadness|guilt|dread|panic|relief|grief|shame|terror|rage) (?:gripped|washed over|surged through|coursed through|flooded)\b|\bswallowed hard\b|\bthe tension was palpable\b|\bsending shivers\b/gi, 2.12, 'a knowing smile; eyes glinting with mischief'),
  P('hung_heavy', '"the silence / words hung heavy"', /\b(?:silence|words?|question|tension|air|smell|scent) hung (?:heavy|thick|in the air|between them)\b/gi, 1.75, 'the question hung in the air'),
  P('felt_a_surge', 'Named emotion ("felt a surge / pang of …")', /\b(?:felt|feel|feeling|feels) a (?:surge|wave|pang|twinge|rush|flood|jolt|flicker|spark|knot) of \w+/gi, 1.62, 'felt a pang of guilt'),
  P('found_herself', '"found herself …ing"', /\bfound (?:herself|himself|themselves|myself) \w+ing\b/gi, 0.86, 'found herself smiling'),
  P('it_was_as_if', '"it was as if"', /\bit was as if\b/gi, 0.7, 'it was as if the world had stopped'),
  P('kind_of_that', '"the kind of X that …"', /\bthe (?:kind|sort|type) of \w+(?: \w+)? (?:that|which|who|you|only)\b/gi, 0.75, 'the kind of person who remembers birthdays', true),
  P('equal_measure', '"equal parts X and Y"', /\bin (?:equal|perfect) measure\b|\bequal parts \w+ and \w+/gi, 0.75, 'equal parts charm and menace', true),
  // From TheDrummer's UnslopNemo target list (RP chat replies), the phrases that also lean AI in cards
  // (tools/phrase_check.mjs): "punctuate/-ing" (not "punctuated", already a scored word), "conspiratorial",
  // "<her> voice low", "mischief". Card-only evidence, so provisional; weight set by tools/eval_cards.mjs.
  P('rp_reply_tells', 'RP-reply tells ("conspiratorial", "voice low", "punctuating")', /\bconspiratorial\w*|\bpunctuat(?:e|es|ing)\b|\b(?:her|his|their|my|your) voice low\b|\bmischief\b/gi, 1.5, 'she leaned in, conspiratorial, voice low', true),
];

const WORD_RX = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const EMDASH_RX = /—|–| -- /g;

export function emdashPoints(rate) {
  const E = EMDASH_POINTS;
  return E.max * Math.min(1, Math.max(0, (rate - E.free) / (E.full - E.free)));
}

/**
 * @param {string} prose
 * @param {Array} contrastMatches  matches from contrast-detector.js on the same prose
 * @returns {{rate, se, hits, contrastCount, nWords, emdash: {count, rate, points}}}
 */
// Structure ids switched off (experiments; tools/eval_cards.mjs toggles these).
export const DISABLED_STRUCTURES = new Set(['rp_reply_tells']);

export function scoreStructures(prose, contrastMatches = []) {
  const text = String(prose || '');
  const nWords = (text.match(WORD_RX) || []).length;
  const per = nWords ? 1000 / nWords : 0;
  let s = 0, v = 0; const hits = [];
  for (const p of STRUCTURE_PATTERNS) {
    if (DISABLED_STRUCTURES.has(p.id)) continue;
    p.rx.lastIndex = 0;
    let m = text.match(p.rx);
    if (m && p.dedupeContrast && contrastMatches && contrastMatches.length) {
      const sents = contrastMatches.map(c => String(c.sentence || c.match_text || ''));
      m = m.filter(x => !sents.some(sn => sn.includes(x.slice(0, 25))));
    }
    if (!m || !m.length) continue;
    s += p.w * repeatWeight(m.length, nWords); v += p.w * p.w * m.length;
    hits.push({ id: p.id, label: p.label, count: m.length, weight: p.w, examples: m.slice(0, 3), provisional: p.provisional });
  }
  const cc = (contrastMatches || []).length;
  if (cc) {
    s += CONTRAST_WEIGHT * repeatWeight(cc, nWords); v += CONTRAST_WEIGHT ** 2 * cc;
    hits.push({ id: 'not_x_but_y', label: 'Not-x-but-y contrast', count: cc, weight: CONTRAST_WEIGHT, examples: contrastMatches.slice(0, 3).map(m => m.match_text || m.sentence || '') });
  }
  hits.sort((a, b) => b.weight * b.count - a.weight * a.count);
  const em = (text.match(EMDASH_RX) || []).length, emRate = em * per;
  return { rate: s * per, se: Math.sqrt(v) * per, hits, contrastCount: cc, nWords,
           emdash: { count: em, rate: emRate, points: emdashPoints(emRate) } };
}
