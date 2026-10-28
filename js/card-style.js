// card-style.js - Describe a card's overall *style*: how the definition is laid out,
// how the greeting is narrated, and what kind of card it is.
//
// Style isn't proof of anything on its own (humans write in every format), but
// formats have eras and sources: W++ and PLists are early-2023 human habits;
// "**Header:** + polished paragraph" sections are what you get when you ask a chatbot
// to write a card. Knowing the style lets the score be read against the right peer
// group and lets the page say *why* a card reads as generated.

const wc = s => (String(s || '').match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;

// ---- definition format detectors: each returns the number of words in that format ----
const FORMAT_RX = {
  wpp: /\w+\s*\(\s*"[^"]*"(?:\s*\+\s*"[^"]*")+\s*\)|\[\s*character\s*\(\s*"/gi,
  plist: /\[[^\[\]\n]{0,40}(?:'s)?\s*(?:personality|appearance|body|clothes|clothing|likes|dislikes|traits?|features)\s*:\s*[^\]]+\]/gi,
  json: /^\s*[{[]?\s*"[\w ]{1,30}"\s*:\s*["{[\d]/gm,
  yaml: /^\s{0,4}[\w][\w ]{0,25}:\s*(?:\n\s{2,}-\s|\[)/gm,
  xml: /<\s*([a-z_][\w-]{1,30})(?:\s[^>]*)?>[\s\S]{1,4000}?<\/\s*\1\s*>/gi,
};
const HEADER_LINE = /^\s*(?:#{1,6}\s+[^\n]{1,50}|[*_]{2}[^*_\n]{1,40}[*_]{2}\s*:?\s*|[A-Z][A-Za-z '’/&-]{1,30}:\s*|<\s*[a-z_][\w-]{1,30}\s*>)$/;
const LABEL_INLINE = /^\s*(?:[-*•]\s*)?[*_]{0,2}([A-Z][\w '’/&()-]{1,30}?)[*_]{0,2}\s*:\s*[*_]{0,2}\s*(.+)$/;
const ALICHAT_LINE = /^\s*(?:\{\{(?:char|user)\}\}|[A-Z][\w .'-]{0,20}|<(?:BOT|USER)>)\s*:\s*\S/;
const INSTR = /\b(?:\{\{char\}\}\s+(?:will|must|should|is to|is the narrator|will narrate|never|always)|do not|don't|never (?:speak|act|write|roleplay)|always (?:stay|remain|write|describe)|narrat(?:e|or)|npcs?\b|stat(?:s|us)\s*(?:block|tracker|panel)|the user|roleplay as)\b/gi;

function paragraphs(t) { return String(t || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean); }

/**
 * Classify the definition (description + personality + scenario).
 * @returns {{primary: string, shares: Object<string, number>, signals: Object}}
 */
export function definitionStyle(def) {
  const text = String(def || '');
  const total = Math.max(1, wc(text));
  const words = { wpp: 0, plist: 0, json: 0, yaml: 0, xml: 0, alichat: 0, label_prose: 0, markdown_list: 0, instructions: 0, prose: 0 };

  for (const k of ['wpp', 'plist', 'json', 'xml']) {
    FORMAT_RX[k].lastIndex = 0;
    let m; while ((m = FORMAT_RX[k].exec(text))) words[k] += wc(m[0]);
  }
  // XML wraps everything else; count it as structure only when it wraps short fields.
  if (words.xml && words.xml > 0.6 * total) words.xml = Math.round(0.3 * words.xml);

  let headers = 0, labelProseSections = 0, bulletWords = 0, aliLines = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!L.trim()) continue;
    if (HEADER_LINE.test(L)) {
      headers++;
      // header on its own line followed by a prose paragraph => label_prose
      const next = lines.slice(i + 1).find(x => x.trim());
      if (next && wc(next) >= 25 && !/^\s*[-*•]/.test(next) && !/[,;]\s*$/.test(next)) { labelProseSections++; words.label_prose += wc(next); }
      continue;
    }
    const lab = L.match(LABEL_INLINE);
    if (lab && wc(lab[1]) <= 4) {
      headers++;
      if (wc(lab[2]) >= 25 && (lab[2].match(/,/g) || []).length < wc(lab[2]) / 4) { labelProseSections++; words.label_prose += wc(lab[2]); }
      else bulletWords += wc(L);
      continue;
    }
    if (/^\s*(?:[-*•+▪◦]|\d{1,2}[.)])\s+/.test(L)) { bulletWords += wc(L); continue; }
    if (ALICHAT_LINE.test(L)) { aliLines++; words.alichat += wc(L); }
  }
  words.markdown_list = bulletWords;

  // Instruction-heavy paragraphs (narrator / RPG system / bracketed rules)
  for (const p of paragraphs(text)) {
    INSTR.lastIndex = 0;
    const hits = (p.match(INSTR) || []).length;
    const sents = Math.max(1, (p.match(/[.!?](?:\s|$)/g) || []).length);
    if (hits >= 2 && hits / sents >= 0.4) words.instructions += wc(p);
  }

  const structured = words.wpp + words.plist + words.json + words.xml + words.alichat + words.label_prose + words.markdown_list + words.instructions;
  words.prose = Math.max(0, total - structured);
  const shares = Object.fromEntries(Object.entries(words).map(([k, v]) => [k, +(v / total).toFixed(3)]));

  // Primary format: label_prose wins over plain prose when there are >= 3 such sections,
  // since that layout (rather than the prose itself) is the distinctive thing.
  let primary = Object.entries(shares).sort((a, b) => b[1] - a[1])[0][0];
  if (labelProseSections >= 3 && shares.label_prose >= 0.35) primary = 'label_prose';
  if (shares.wpp >= 0.25) primary = 'wpp';
  else if (shares.plist >= 0.3) primary = 'plist';
  const ranked = Object.entries(shares).filter(([k]) => k !== primary).sort((a, b) => b[1] - a[1]);
  const secondary = ranked.length && ranked[0][1] >= 0.25 ? ranked[0][0] : null;
  return { primary, secondary, shares, signals: { headers, labelProseSections, aliLines, totalWords: total } };
}

/**
 * Classify a greeting / first message.
 */
export function greetingStyle(greeting) {
  const g = String(greeting || '');
  if (!wc(g)) return { primary: 'none' };
  const noQuotes = g.replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
  const narr = noQuotes.replace(/\*[^*\n]*\*/g, m => m);   // keep asterisk text: it's narration in Markdown RP
  const count = rx => (narr.match(rx) || []).length;
  const n = Math.max(1, wc(narr));
  const you = count(/\byou(?:r|rs|rself)?\b/gi), userM = count(/\{\{user\}\}/gi);
  const first = count(/\b(?:I|me|my|mine|myself)\b/g);
  const third = count(/\b(?:she|he|her|his|him|they|their|\{\{char\}\})\b/gi);
  const pov = (you + userM * 0.5) / n > 0.035 ? 'second_person' : first / n > 0.04 ? 'first_person' : third / n > 0.03 ? 'third_person' : 'unclear';

  const asterisk = (g.match(/(?<!\*)\*[^*\n]{3,}\*(?!\*)/g) || []).length;
  const quotes = (g.match(/"[^"\n]{2,}"|“[^”\n]{2,}”/g) || []).length;
  const mixed = (g.match(/\*[^*\n]{0,80}\*\s*["“]|["”]\s*\*[^*\n]{0,80}\*/g) || []).length;
  let rp;
  if (asterisk && quotes) rp = mixed / Math.max(1, Math.min(asterisk, quotes)) > 0.5 ? 'markdown+quotes' : 'mixed';
  else if (asterisk) rp = 'markdown';
  else if (quotes) rp = 'novel';
  else rp = 'plain';

  const past = count(/\b\w+ed\b|\b(?:was|were|had|said|stood|sat|looked|felt|took|came|went|saw)\b/gi);
  const present = count(/\b(?:is|are|has|says|stands|sits|looks|feels|takes|comes|goes|sees)\b|\b\w+s\b(?= (?:the|her|his|your|a|an|at|to|toward|towards)\b)/gi);
  const tense = past > present * 1.4 ? 'past' : present > past * 1.4 ? 'present' : 'mixed';

  const paras = paragraphs(g);
  const plen = paras.map(wc);
  const mean = plen.reduce((a, b) => a + b, 0) / Math.max(1, plen.length);
  const sd = Math.sqrt(plen.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, plen.length));
  const endsWithQuestion = /\?["”*]*\s*$/.test(g.trim());
  return { primary: `${pov}/${rp}`, pov, rp, tense, paragraphs: paras.length, paraLenCv: mean ? +(sd / mean).toFixed(3) : 0, endsWithQuestion, words: wc(g) };
}

/**
 * Card type from definition + greeting + tags.
 */
export function cardType(def, greeting, tags = []) {
  const t = String(def || '') + '\n' + String(greeting || '');
  const tagStr = (Array.isArray(tags) ? tags : []).join(' ').toLowerCase();
  if (/\b(?:narrator|game ?master|rpg|text adventure|simulator|stat(?:s|us) (?:block|tracker|panel)|\bhp\b|inventory)\b/i.test(t) || /scenario|rpg|simulator|narrator/.test(tagStr)) return 'scenario_rpg';
  if (/\b(?:assistant|helper|card (?:builder|maker|generator)|prompt generator|tutor)\b/i.test(t.slice(0, 600)) || /helper|assistant|tool/.test(tagStr)) return 'tool';
  const names = new Set((String(def || '').match(/^\s*[*_#]*\s*(?:name|character)\s*\d*\s*[:=]\s*[*_]*\s*([A-Z][\w'-]+)/gim) || []).map(x => x.toLowerCase()));
  if (names.size >= 2 || /multiple characters|multi-?char/.test(tagStr)) return 'multi_character';
  return 'single_character';
}

export function cardStyle({ description = '', personality = '', scenario = '', first_mes = '', tags = [] } = {}, preStats = null) {
  const def = [description, personality, scenario].filter(Boolean).join('\n\n');
  const fam = styleFamily(def, preStats);
  return { family: fam.family, familyShares: fam.shares, definition: fam.definition, greeting: greetingStyle(first_mes), type: cardType(def, first_mes, tags) };
}

// ---- description format (what the score is read against) ------------------------
// One set of names for formats everywhere: the page, the leaderboard's request styles, scoring-run notes and
// BOTSTYLE.md all use these ids and labels. Ids are stored in scores, so they don't change; labels can.
export const FORMAT_INFO = {
  free_prose:          ['Free prose', 'Paragraphs of prose with no headers or lists.'],
  formatted_prose:     ['Formatted prose', 'Prose paragraphs under section headers ("**Appearance:**" + a paragraph).'],
  lists:               ['Lists', 'Markdown bullet lists and "Label: value" lines.'],
  compact:             ['Compact', 'Token-saver formats: W++, PList, JSON / YAML / XML key-values.'],
  in_voice:            ['In voice', "Written in the character's own voice: a first-person monologue, Ali:Chat or an interview."],
  'structured+prose':  ['Structured + prose', 'Compact or list blocks alongside a real share of prose.'],
  'boilerplate+prose': ['Boilerplate + prose', 'Instructions or narrator rules alongside a real share of prose.'],
  boilerplate:         ['Boilerplate', 'Mostly instructions, narrator rules or pasted jailbreaks, with little character prose.'],
};
export const DESCRIPTION_FORMATS = Object.fromEntries(Object.entries(FORMAT_INFO).map(([k, [label]]) => [k, label]));
export const formatLabel = id => (FORMAT_INFO[id] || [id])[0];

// Request styles used to generate the AI cards on the leaderboard (tools/generate_ai_cards.mjs). Each asks for
// one of the formats above, except the lazy prompt, which leaves the format to the model.
export const REQUEST_STYLES = {
  default:         ['Lazy prompt', '"make me a character bot for X, description and first message"'],
  free_prose:      ['Free prose', FORMAT_INFO.free_prose[1]],
  formatted_prose: ['Formatted prose', FORMAT_INFO.formatted_prose[1]],
  lists:           ['Lists', FORMAT_INFO.lists[1]],
  compact:         ['Compact', 'W++ or PList.'],
  first_person:    ['In voice: first person', 'Description written as the character speaking.'],
  interview:       ['In voice: interview', 'Ali:Chat-style Q&A exchanges.'],
};
export const requestStyleLabel = id => (REQUEST_STYLES[id] || [id])[0];

// Greeting (first message) layout and voice.
export const GREETING_FORMATS = {
  'markdown+quotes': ['Asterisks + quotes', '*Actions in asterisks*, "speech in quotes".'],
  markdown:          ['Asterisks', '*Actions in asterisks*, speech unquoted.'],
  novel:             ['Novel style', 'Plain narration with "quoted speech", like a book.'],
  mixed:             ['Mixed', 'Some asterisk actions and some quoted speech, not paired up.'],
  plain:             ['Plain', 'No asterisks or quotes.'],
};
export const GREETING_POV = { second_person: 'second person ("you")', first_person: 'first person ("I")', third_person: 'third person ("she / he / they")', unclear: 'unclear point of view' };
export const STYLE_FAMILIES = DESCRIPTION_FORMATS;   // old name

/**
 * Description format of a card.
 * @param {string} def        definition text (description + personality + scenario)
 * @param {object} preStats   stats from preprocessCard() on the same text (optional)
 */
export function descriptionFormat(def, preStats = null) {
  const d = definitionStyle(def);
  const sh = d.shares;
  const total = Math.max(1, d.signals.totalWords);
  const boiler = Math.max(sh.instructions, preStats ? preStats.boilerplateWords / total : 0);
  const compact = sh.wpp + sh.plist + sh.json + sh.xml + sh.yaml;
  const lists = sh.markdown_list + (preStats ? Math.max(0, preStats.structuredWords / total - sh.markdown_list - compact) * 0.5 : 0);
  const structured = compact + lists;
  const prose = Math.max(0, 1 - boiler - structured - sh.alichat);
  // first person outside dialogue: "I've lived in this tower for…"
  const narr = String(def || '').replace(/"[^"\n]*"|“[^”\n]*”/g, ' ');
  const nw = Math.max(1, wc(narr));
  const firstPerson = ((narr.match(/\b(?:I|I'm|I've|I'd|me|my|mine|myself)\b/g) || []).length) / nw;

  let format;
  if (boiler >= 0.6 && (!preStats || preStats.proseWords < 150)) format = 'boilerplate';
  else if (sh.alichat >= 0.25 || firstPerson >= 0.045) format = 'in_voice';
  else if (structured >= 0.5) format = compact >= lists ? 'compact' : 'lists';
  else if (boiler >= 0.25 && prose >= 0.3) format = 'boilerplate+prose';
  else if (structured >= 0.2 && prose >= 0.3) format = 'structured+prose';
  else if (d.primary === 'label_prose' || d.signals.labelProseSections >= 3) format = 'formatted_prose';
  else format = 'free_prose';
  return { family: format, format, label: DESCRIPTION_FORMATS[format],
           shares: { boilerplate: +boiler.toFixed(3), compact: +compact.toFixed(3), lists: +lists.toFixed(3), prose: +prose.toFixed(3), in_voice: +sh.alichat.toFixed(3), first_person: +firstPerson.toFixed(3) }, definition: d };
}
export const styleFamily = descriptionFormat;   // old name
