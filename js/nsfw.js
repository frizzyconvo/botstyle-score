// nsfw.js - Sexual-content read of a whole card (every text field, alternate greetings and tags). Unscored: it says
// whether a card has sexual content, not anything about how it was written.
//
// Two word lists. "Explicit" is sexual acts, genitals and sex words; "suggestive" is body, clothing and flirting words
// cards use when sex is implied. Words with an everyday sense are left out ("come", "climax", "erect", "breed") or
// filtered in context ("Sex: Female", "sexual orientation", "Dick" as a name, "naked blade", "kick ass"). Swearing
// ("fuck" as an insult) isn't counted. Tags such as NSFW / Smut / Explicit are reported too, and "NSFW" / "18+" in the
// text are counted as mentions only, since they are usually rules ("no NSFW").
//
//   detectNsfw(text, tags) -> { level: 'explicit' | 'suggestive' | 'none', explicit, suggestive, mentions, hits: [{item, count}], tagged }

const EXPLICIT = /\b(?:sex(?:y|ier|iest)?|sexual(?:ly)?|intercourse|orgasm\w*|cum(?:s|ming|med|shot)?|semen|ejaculat\w+|erection|cock(?:s|head)?|dick(?:s)?|penis\w*|pussy|pussies|cunt\w*|clit(?:oris|s)?|vagina\w*|vulva|labia|testicles?|nipples?|tits|titties|boobs|genitals?|genitalia|aroused?|arousal|horny|lewd\w*|porn\w*|masturbat\w+|fingering|blow ?jobs?|hand ?jobs?|fellatio|cunnilingus|deepthroat\w*|anal(?:ly)?|rimming|creampie\w*|breeding|impregnat\w+|bdsm|bondage|dominatrix|fetish\w*|kink(?:s|y)?|grope[sd]?|groping|fondl\w+|thrusts? (?:into|inside)|in heat)\b/gi;
const SUGGESTIVE = /\b(?:seduc\w+|sultry|lingerie|panties|bra|thong|cleavage|busty|voluptuous|curvaceous|curvy|thick thighs|thighs|buttocks|butt|ass|breasts?|bosom|crotch|groin|nude|naked|undress\w*|strip(?:s|ped|ping)? (?:off|naked|down)|moan(?:s|ed|ing)?|slut\w*|whores?|lustful|lust(?:s|ed|ing)?|bedroom eyes|in bed|one-night stand|flirt\w*|kiss(?:es|ed|ing)? (?:your|his|her) (?:neck|lips))\b/gi;
// Not content: "Sex: Female" / "biological sex" fields, sexual-orientation labels, "Dick" as a name, "naked eye", "kick ass".
const skip = (m, text, i) => {
  const w = m.toLowerCase();
  if (w === 'sex' && /^\s*[:=-]|^\s*\((?:m|f|male|female)/i.test(text.slice(i + m.length, i + m.length + 12))) return true;      // "Sex: Female"
  if (w === 'sex' && /(?:biological|assigned|opposite|same|gender(?: and)?)\s+$/i.test(text.slice(Math.max(0, i - 24), i))) return true;
  if (w === 'sexual' && /^\s+(?:orientation|identity|preference)/i.test(text.slice(i + m.length, i + m.length + 14))) return true;
  if (m === 'Dick' || m === 'Dicks') return true;                                                                       // a name
  if (w === 'naked' && /^\s+(?:eye|blade|steel|flame|truth|ambition|aggression|fear|hatred)/i.test(text.slice(i + m.length, i + m.length + 12))) return true;
  if (/^(?:ass)$/.test(w) && /(?:bad|kick|smart|dumb|hard|jack|pain in the)\W*$/i.test(text.slice(Math.max(0, i - 14), i))) return true;   // insults, not bodies
  return false;
};
// "NSFW", "18+", "smut" in the text are usually rules ("no NSFW", "SFW only"): counted as mentions, not as content.
const MENTION = /\b(?:n?sfw|smut\w*|r-?18|18\+)(?=\W|$)/gi;
const NSFW_TAG = /^(?:nsfw|smut|explicit|lewd|r-?18|18\+|sex|sexual|erotic\w*|porn\w*|kink\w*|fetish\w*|bdsm|breeding)$/i;

function tally(text, rx) {
  const m = new Map(); rx.lastIndex = 0;
  for (const x of text.matchAll(rx)) { if (skip(x[0], text, x.index)) continue; const k = x[0].toLowerCase().replace(/\s+/g, ' '); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([item, count]) => ({ item, count })).sort((a, b) => b.count - a.count);
}

export function detectNsfw(text, tags = []) {
  const t = String(text || '');
  const ex = tally(t, EXPLICIT), su = tally(t, SUGGESTIVE);
  const explicit = ex.reduce((a, x) => a + x.count, 0), suggestive = su.reduce((a, x) => a + x.count, 0);
  MENTION.lastIndex = 0; const mentions = (t.match(MENTION) || []).length;
  const tagged = (Array.isArray(tags) ? tags : []).map(String).filter(x => NSFW_TAG.test(x.trim()));
  // Two different explicit words, or one used 3+ times, reads as explicit; otherwise a few suggestive words (or one
  // explicit word) as suggestive.
  const level = ex.length >= 2 || explicit >= 3 ? 'explicit' : explicit >= 1 || suggestive >= 3 ? 'suggestive' : 'none';
  return { level, explicit, suggestive, mentions, hits: [...ex, ...su].slice(0, 16), tagged };
}
