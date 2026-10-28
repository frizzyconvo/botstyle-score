// card-preprocess.js - Split a character card into prose / structured / boilerplate
//
// Slop lists are built from prose, so running them over W++ blocks, PLists,
// "Likes: a, b, c" lines or jailbreak boilerplate either inflates or dilutes the
// rates. We score prose only and report how much of the card that was, so a
// card that is mostly lists gets a wide confidence band instead of a bogus score.

const MACRO_RX = /\{\{\s*(char|user|bot|original)\s*\}\}|<\s*(BOT|USER)\s*>/gi;

// Lines that are instructions to the model / platform rather than character writing.
const BOILERPLATE_RX = [
  { id: 'no_speaking_for_user', rx: /\b(?:never|not|n't|do not|don't|won't|will not|must not|avoid|refrain from)\b[^.\n]{0,50}\b(?:speak|talk|act|write|respond|decide|narrate|control|roleplay|describe)\w*\b[^.\n]{0,30}\b(?:for|as|on behalf of)\s+(?:the\s+)?(?:\{\{user\}\}|<user>|user|you)(?!\w)/i },
  { id: 'content_permission', rx: /\b(?:nsfw|explicit|sexual|smut|violence|gore|graphic|dark themes?)\b[^.\n]{0,50}\b(?:is|are)?\s*(?:allowed|permitted|encouraged|enabled|welcome|okay|ok)\b/i },
  { id: 'system_note', rx: /^\s*[\[(]?\s*(?:system(?: note)?|ooc|author'?s note|a\/n|note to (?:ai|bot|model)|instructions?|rules?)\s*[:\])-]/i },
  { id: 'stay_in_character', rx: /\b(?:stay|remain|always be)\s+in\s+character\b|\bthis is (?:a|an) (?:fictional )?role-?play\b|\b(?:you are|you will (?:play|be)|play the role of)\s+\{\{char\}\}/i },
  { id: 'meta_credits', rx: /^\s*(?:credits?|art(?:work)? by|image (?:by|source)|made by|created by|bot by|tokens?|token count|request(?:ed)? by|inspired by|tags?)\s*[:\-]/i },
  // Bracketed instruction blocks: "[{{char}} will never roleplay as {{user}}. Always ...]"
  { id: 'bracket_instructions', rx: /^\s*[\[(<{]/, test: isInstructionBlock },
  // Classic jailbreak text, wherever it sits in a line
  { id: 'jailbreak_text', rx: /\bsystem note\b|\bopenai\b|\busage polic(?:y|ies)\b|\bcensorship\b|\bjailbreak\b|\b(?:ethical|content) (?:guidelines|protocols|filters?)\b|\bconsenting actors\b/i },
  { id: 'example_dialogue_tag', rx: /^\s*<\s*\/?\s*(?:START|END)\s*>\s*$/i },
];

// Imperative sentences addressed to the model rather than describing the character.
const INSTRUCTION_SENT = /^\s*(?:\{\{char\}\}|<BOT>|the ai|ai|you|narrator|npcs?)\s+(?:will|must|should|shall|is to|are to|can|may|does not|do not|doesn't|don't|won't|will not|never|always|is not a character)\b|^\s*(?:please\s+)?(?:do not|don't|never|always|avoid|only|respond|reply|write|narrate|describe|keep|stay|remember|ensure|make sure|let|take your time|use|include|focus|treat|refer to|assume)\b|\b(?:roleplay|role-play|rp) as\b|\b(?:ethical|consent|protocols?|guidelines|filters?)\b/i;
function instructionShare(s) {
  const sents = s.replace(/^[\s\[(<{]+|[\])>}\s]+$/g, '').split(/(?<=[.!?;])\s+/).filter(x => /[A-Za-z]/.test(x));
  if (!sents.length) return 0;
  return sents.filter(x => INSTRUCTION_SENT.test(x)).length / sents.length;
}
function isInstructionBlock(s) {
  const t = s.trim();
  const bracketed = /^[\[(<{]/.test(t) && /[\])>}]\.?$/.test(t);
  return bracketed ? instructionShare(t) >= 0.35 : false;
}
// Unbracketed paragraphs that are mostly model instructions count as boilerplate too.
function isInstructionParagraph(s) {
  const n = (s.match(/[.!?]/g) || []).length;
  return n >= 2 && instructionShare(s) >= 0.6;
}

const STRUCTURED_LINE = [
  // W++ / Ali-style: Character("X") { Personality("a" + "b") }
  { id: 'wpp', rx: /\w+\s*\(\s*["'][^"']*["']\s*(?:\+\s*["'][^"']*["']\s*)*\)|^\s*[\[{]\s*\w+\s*\(/ },
  // PList: [Name's personality: a, b, c; appearance: x, y]
  { id: 'plist', rx: /^\s*\[[^\]]{0,600}:[^\]]*,[^\]]*\]\s*$/ },
  // Markdown / bold section headers
  { id: 'header', rx: /^\s*(?:#{1,6}\s+\S|[*_]{2}[^*_\n]{1,40}[*_]{2}\s*:?\s*$|[A-Z][A-Z \-'&/]{2,30}:?\s*$)/ },
  // XML-ish section tags on their own line
  { id: 'tag_line', rx: /^\s*<\/?[a-z_][\w\- ]{0,30}>\s*$/i },
];

const KV_RX = /^\s*(?:[-*•+]\s*)?[*_]{0,2}([A-Za-z][\w '’/&()-]{0,32}?)[*_]{0,2}\s*[:=]\s*[*_]{0,2}\s*(.*)$/;
const BULLET_RX = /^\s*(?:[-*•+▪◦]|\d{1,2}[.)])\s+(.*)$/;

// Share of tokens that are common English function words. English prose sits around
// 0.4-0.5; Spanish/Portuguese/etc. land well under 0.2. The slop lists are English-only.
const EN_FUNC = new Set('the a an and of to in is was it that he she his her you i with for on as at be by this they but not are from or have had were their them we what so if would there all my me him one about out when up'.split(' '));
function englishShare(t) {
  const w = String(t).toLowerCase().match(/[a-zà-ÿ]+/g) || [];
  return w.length ? w.filter(x => EN_FUNC.has(x)).length / w.length : 0;
}

const wordCount = s => (s.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || []).length;

function looksLikeList(s) {
  // "tall, lean, scarred, quiet" - several short comma/semicolon/slash items
  const items = s.split(/[,;/|]|\s\+\s/).map(x => x.trim()).filter(Boolean);
  if (items.length < 3) return false;
  const avg = items.reduce((a, x) => a + wordCount(x), 0) / items.length;
  return avg <= 3.5 && !/[.!?]["”']?\s+[A-Z]/.test(s);
}

export function stripMarkup(raw) {
  let t = raw.replace(/\r\n?/g, '\n');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '\n').replace(/<script[\s\S]*?<\/script>/gi, '\n');
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');                 // markdown images
  t = t.replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1');      // markdown links -> text
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/<(?:br|p|div|li|hr)\b[^>]*>/gi, '\n');
  t = t.replace(/<\/?(?:span|font|b|i|em|strong|u|center|small|big|sup|sub|div|p|li|ul|ol|img|a)\b[^>]*>/gi, '');
  return t;
}

/**
 * @param {string} raw  full card text (description + greeting(s), pasted as-is)
 * @returns {{prose:string, segments:Array, stats:Object}}
 */
export function preprocessCard(raw) {
  const text = stripMarkup(raw || '');
  const macroCount = (text.match(MACRO_RX) || []).length;

  const segments = [];   // {kind: 'prose'|'structured'|'boilerplate', subkind, text}
  const boilerplateHits = {};
  const proseParts = [];

  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) { proseParts.push(''); continue; }

    // First rule that matches *and* passes its gate (a long line that merely mentions
    // "don't speak for user" is only boilerplate if it's mostly instructions).
    const gate = b => b.id !== 'no_speaking_for_user' || wordCount(s) < 40 || instructionShare(s) >= 0.35;
    let bp = BOILERPLATE_RX.find(b => b.rx.test(s) && (!b.test || b.test(s)) && gate(b));
    if (!bp && isInstructionParagraph(s)) bp = { id: 'instruction_paragraph' };
    if (bp) {
      boilerplateHits[bp.id] = (boilerplateHits[bp.id] || 0) + 1;
      segments.push({ kind: 'boilerplate', subkind: bp.id, text: s });
      continue;
    }

    const st = STRUCTURED_LINE.find(x => x.rx.test(s));
    if (st) { segments.push({ kind: 'structured', subkind: st.id, text: s }); continue; }

    const kv = s.match(KV_RX);
    if (kv && !/^(?:https?|said|says|asked)$/i.test(kv[1].trim()) && wordCount(kv[1]) <= 4) {
      const rest = kv[2] || '';
      // "Backstory: She grew up in..." -> the value is prose; keep it, drop the label.
      if (wordCount(rest) >= 12 && !looksLikeList(rest)) {
        segments.push({ kind: 'structured', subkind: 'label', text: kv[1] });
        segments.push({ kind: 'prose', subkind: 'kv_value', text: rest });
        proseParts.push(rest);
      } else {
        segments.push({ kind: 'structured', subkind: 'key_value', text: s });
      }
      continue;
    }

    const bl = s.match(BULLET_RX);
    if (bl) {
      const rest = bl[1];
      if (wordCount(rest) >= 15 && !looksLikeList(rest)) {
        segments.push({ kind: 'prose', subkind: 'bullet_prose', text: rest });
        proseParts.push(rest);
      } else {
        segments.push({ kind: 'structured', subkind: 'bullet', text: s });
      }
      continue;
    }

    if (looksLikeList(s) || (wordCount(s) <= 3 && !/[.!?]["”*']?$/.test(s))) {
      segments.push({ kind: 'structured', subkind: 'list', text: s });
      continue;
    }

    segments.push({ kind: 'prose', subkind: 'prose', text: s });
    proseParts.push(s);
  }

  // Macros -> neutral names so they don't create fake n-grams or slop hits.
  const prose = proseParts.join('\n')
    .replace(/\{\{\s*char\s*\}\}|<\s*BOT\s*>/gi, 'Char')
    .replace(/\{\{\s*user\s*\}\}|<\s*USER\s*>/gi, 'User')
    .replace(/\{\{\s*\w+\s*\}\}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sum = kind => segments.filter(x => x.kind === kind).reduce((a, x) => a + wordCount(x.text), 0);
  const stats = {
    totalWords: wordCount(text),
    proseWords: wordCount(prose),
    structuredWords: sum('structured'),
    boilerplateWords: sum('boilerplate'),
    boilerplateHits,
    macroCount,
    structuredKinds: segments.filter(x => x.kind === 'structured')
      .reduce((m, x) => (m[x.subkind] = (m[x.subkind] || 0) + 1, m), {}),
  };
  stats.proseShare = stats.totalWords ? stats.proseWords / stats.totalWords : 0;
  stats.englishShare = englishShare(prose || text);
  // Non-Latin scripts (Japanese, Chinese, Cyrillic…) tokenize to almost no English words, so
  // check the share of letters outside Latin script on the whole text too.
  const letters = (text.match(/\p{L}/gu) || []).length;
  const latin = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  stats.nonLatinShare = letters ? 1 - latin / letters : 0;
  stats.nonEnglish = (stats.proseWords >= 30 && stats.englishShare < 0.22) || (letters >= 40 && stats.nonLatinShare > 0.3);
  // Everything except boilerplate, macros intact: what the unscored checks and the
  // artifact detector should look at (template text says nothing about this card's author).
  const nonBoilerplate = segments.filter(x => x.kind !== 'boilerplate' || x.subkind === 'example_dialogue_tag').map(x => x.text).join('\n\n');
  return { prose, segments, stats, cleanText: text, nonBoilerplate };
}
