// human-tells.js - Unscored card checks
//
// Two groups, neither feeds the slop score:
//
//  humanTells  - mistakes LLMs essentially never make: typos, txt-speak, missing
//                apostrophes, unbalanced asterisks/quotes, "{{char}} is Alice"
//                (renders as "Alice is Alice"), "the {{user}}", mixed RP formats,
//                typewriter "--" dashes, spaces before punctuation.
//                Their presence is weak evidence a human wrote (or edited) the card.
//  craftNotes  - problems anyone (human or model) can introduce: writing {{user}}'s
//                actions, gendering {{user}}, jailbreak lines in the description,
//                runs of sentences that all start with {{char}}, heavy "also".
//
// Sources: CharGen v2 notes (kubernetes-bad), pixi's practical modern botmaking,
// NicholasCS's botmaking guide, Glub's character guide.

const COMMON_MISSPELLINGS = new Set(`alot definately definatly seperate seperately recieve recieved untill wierd
occured occuring begining beleive belive freind thier truely wich becuase becasue goverment tommorow tommorrow tomorow
accomodate arguement embarass existance independant neccessary necesary noticable occassion persistant posession
priviledge publically rythm sieze suprise suprised tounge calender cemetary concious enviroment foriegn grammer
harrass millenium mischevious mischievious mispell occurence perseverence recomend reccomend refered relevent religous
resistence sincerly succesful threshhold vaccuum writting acheive acheived agressive apparantly arguably basicly
beautifull begginning buisness carribean catagory comming commited completly concensus dissapoint dissapointed
dilemna embarassed enterance excercise familar finaly fourty gaurd happend harrased hieght humourous ignorence
immediatly incidently knowlege lenght liason lisence maintainance medeval momento neice noone occuring oppurtunity
origional paralell pavillion peice percieve playwrite posessive potatos prefered presense probaly proffesional
promiss pronounciation recieving refridgerator remeber rember restaraunt sacrafice sargent scissers sentance shoudl
similiar sophmore speach strenght stregth sucess sucessful supercede surley teh thru tho threatning tomatos tounge
truley twelth tyrany unforseen unfortunatly usualy vengence visable wether whereever wierdly wellcome youre
hes shes theyre dont doesnt didnt cant isnt wasnt werent couldnt wouldnt shouldnt arent havent hasnt hadnt ive
thats whats theres im youve theyve wouldve couldve shouldve`.split(/\s+/));
// Apostrophe-less contractions are listed above and reported under their own heading.
const NO_APOSTROPHE = new Set(`youre theyre dont doesnt didnt cant isnt wasnt werent couldnt wouldnt shouldnt arent
havent hasnt hadnt ive thats whats theres im youve theyve wouldve couldve shouldve hes shes`.split(/\s+/));

const TXT_SPEAK_RX = /\b(?:u|ur|r|pls|plz|lol|lmao|lmfao|idk|tbh|omg|ngl|smh|bc|cuz|coz|thx|ty|rn|irl|btw|imo|imho)\b/gi;
const HOMOPHONE_RX = [
  [/\b(?:could|would|should|must|might) of\b/gi, '"could of" for "could have"'],
  [/\b(?:more|less|better|worse|rather|other|bigger|smaller|older|younger|taller|shorter|faster) then\b/gi, '"then" for "than"'],
  [/\byour (?:welcome|a|an|the|so|very|not|going|being|gonna)\b/gi, '"your" for "you\'re"'],
  [/\bit's own\b/gi, '"it\'s own" for "its own"'],
  [/\btheir (?:is|are|was|were)\b/gi, '"their" for "there"'],
  [/\bloose (?:his|her|my|your|their|our|its) (?:temper|mind|way|grip|control|job|cool|virginity|life|head)\b/gi, '"loose" for "lose"'],
];

const ACTION_VERBS = `says said asks asked replies replied whispers whispered nods nodded smiles smiled grins grinned laughs laughed
walks walked steps stepped enters entered looks looked glances glanced feels felt thinks thought decides decided
sits sat stands stood grabs grabbed reaches reached sighs sighed blushes blushed gasps gasped shivers shivered
moans moaned agrees agreed hesitates hesitated notices noticed realizes realized wonders wondered turns turned
follows followed opens opened takes took gives gave kisses kissed hugs hugged touches touched pulls pulled`.split(/\s+/);
const USER_ACTS_RX = new RegExp(`(?:\\{\\{user\\}\\}|<user>)\\s+(?:\\w+ly\\s+)?(?:${ACTION_VERBS.join('|')})\\b`, 'gi');
const YOU_ACTS_RX = new RegExp(`(?:^|[.!?*]\\s+|\\band\\s+)you\\s+(?:\\w+ly\\s+)?(?:say|ask|reply|whisper|nod|smile|grin|laugh|walk|step|enter|look|glance|feel|think|decide|sit|stand|grab|reach|sigh|blush|gasp|shiver|moan|agree|hesitate|notice|realize|wonder|turn|follow|open|take|give|kiss|hug|touch|pull|said|asked|replied|whispered|nodded|smiled|walked|stepped|looked|felt|thought|decided|sat|stood|grabbed|sighed|blushed|gasped|noticed|realized|turned|took|gave)\\b`, 'gi');

function excerpt(text, idx, len, pad = 40) {
  const a = Math.max(0, idx - pad), b = Math.min(text.length, idx + len + pad);
  return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}
function collect(text, rx, max = 4) {
  const out = []; let m; let n = 0;
  rx.lastIndex = 0;
  while ((m = rx.exec(text))) {
    n++; if (out.length < max) out.push(excerpt(text, m.index, m[0].length));
    if (m[0].length === 0) rx.lastIndex++;
  }
  return { count: n, examples: out };
}
// Remove spoken dialogue so narration-only checks don't fire on how characters talk.
// Dialogue becomes a capitalized placeholder so "…" he murmured doesn't look like a
// lowercase sentence start once the quote is gone.
function narrationOnly(t) {
  return t.replace(/"[^"\n]*"|“[^”\n]*”/g, ' "Q" ');
}

// Example dialogue (after <START>, or chat-log lines) is the character's *voice*:
// lowercase texting, "lol", "!!!" there are deliberate, so tells skip it.
export function stripExampleDialogue(t) {
  const parts = t.split(/<\s*START\s*>/i);
  let out = parts[0];
  for (const p of parts.slice(1)) {
    const m = p.match(/\n\s*(?:\*\*[^*\n]{1,40}\*\*\s*:?\s*\n|#{1,6}\s|<\/?[a-z_]+>\s*\n)/i);
    out += m ? '\n' + p.slice(m.index) : '';
  }
  // Chat-log lines inside the remainder: "{{char}}: hey", "**Ana:** lol"
  return out.replace(/^\s*(?:\{\{(?:char|user)\}\}|[*_]{0,2}[A-Z][\w .'()-]{0,24}?[*_]{0,2})\s*:\s*[*_]{0,2}(?=\s*\S)(?=[^\n]*(?:\blol\b|\bi\b|[a-z]\?\?|!!|\bu\b|^\s*[a-z]))[^\n]*$/gm, '');
}

// ---- word-level helpers for the typo check ----
// Card-writing terms that aren't in general dictionaries.
const CARD_TERMS = new Set('plist plists wpp alichat ooc nsfw sfw npc npcs lorebook lorebooks jailbreak jailbreaks chub botbooru janitorai sillytavern tavern ccv persona personas'.split(' '));
const FOREIGN = new Set(`lo la el los las que de del por para con una uno pero muy mas como esta este eso esa todo toda bien mi tu su yo
te se le nos algo mucho mucha sabe hace porque cuando donde quien creo eres soy estoy hola gracias amor querido querida mija
mijo chica chico señor señora dios mio verdad ahora aquí vamos ven tengo tienes quiero puedo nada nunca siempre sí qué cómo
não da do em um uma mais muito seu sua meu ele ela foi tem nem dela você voce isso também
les des une est pas avec pour mais très mon ton son oui je suis tu es il elle nous vous chéri chérie
che non il della per sono come molto bene ciao amore tesoro`.split(/\s+/));
// Extra dictionary: real English words that wordfreq doesn't list or rates as very rare (data/extra_words.txt, from
// the word-list package: its words with wordfreq zipf under 2). Optional; loaded by loadExtraWords().
let EXTRA_WORDS = null;
export function setExtraWords(words) { EXTRA_WORDS = words instanceof Set ? words : new Set(words); }
export async function loadExtraWords(base = './data/') {
  try { const r = await fetch(base + 'extra_words.txt'); if (r.ok && r.text) setExtraWords((await r.text()).split('\n').filter(Boolean)); } catch { /* optional */ }
}
// Only derivational endings: a misspelled inflection ("walkd", "realy") should still count as a typo.
const SUFFIXES = ['ishly', 'ishness', 'ish', 'esque', 'ness', 'less', 'lessly', 'like', 'ism', 'ist', 'wise', 'ward', 'wards', 'hood', 'ship', 'dom'];
const PREFIXES = ['un', 're', 'non', 'over', 'under', 'out', 'half', 'semi', 'anti', 'pre', 'post', 'mis', 'dis', 'super', 'hyper', 'ultra', 'mega', 'mini', 'micro', 'self', 'counter', 'inter', 'sub', 'co', 'ex', 'mid', 'multi', 'pseudo', 'quasi'];
// A regular derivation or compound of a known word: tallish, greenish, purpleish, unbothered, catlike, moonlit. Used
// only to excuse a word that also looks like a typo of a common word.
function knownByForm(w, z) {
  const ok = c => c.length >= 3 && z(c) >= 2.5;
  for (const suf of SUFFIXES) {
    if (!w.endsWith(suf) || w.length - suf.length < 3) continue;
    const b = w.slice(0, -suf.length);
    if (ok(b) || ok(b + 'e') || ok(b.replace(/(.)\1$/, '$1')) || ok(b.replace(/i$/, 'y'))) return true;
  }
  for (const pre of PREFIXES) if (w.startsWith(pre) && w.length - pre.length >= 3) { const r = w.slice(pre.length); if (ok(r) || knownByFormShallow(r, z)) return true; }
  for (let i = 4; i <= w.length - 4; i++) if (z(w.slice(0, i)) >= 3 && z(w.slice(i)) >= 3) return true;   // compounds, both parts 4+ letters
  return false;
}
function knownByFormShallow(w, z) { for (const suf of SUFFIXES) if (w.endsWith(suf) && w.length - suf.length >= 3 && z(w.slice(0, -suf.length)) >= 2.5) return true; return false; }
// The most common word one edit away (delete, swap, replace, insert), if it's common enough to be the intended word.
const ABC = 'abcdefghijklmnopqrstuvwxyz';
function nearestCommon(w, z, min = 3.2) {
  let best = null, bz = min;
  const tryW = c => { if (c.length >= 2 && c !== w) { const v = z(c); if (v > bz) { bz = v; best = c; } } };
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) tryW(w.slice(0, i) + w.slice(i + 1));
    if (i < w.length - 1) tryW(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    for (const ch of ABC) { if (i < w.length) tryW(w.slice(0, i) + ch + w.slice(i + 1)); tryW(w.slice(0, i) + ch + w.slice(i)); }
  }
  return best;
}

/**
 * @param {string} text  card text (raw; macros intact)
 * @param {object} opts  { lookupZipf?: (word)=>number|null, knownWords?: Set<string> }
 */
export function checkCard(text, opts = {}) {
  const humanTells = [], craftNotes = [];
  const fullText = text;
  text = stripExampleDialogue(text);
  const add = (arr, id, label, r, note) => { if (r.count > 0) arr.push({ id, label, count: r.count, examples: r.examples, note }); };
  const narr = narrationOnly(text);
  const paragraphs = text.split(/\n\s*\n|\n(?=\S)/).map(p => p.trim()).filter(Boolean);

  // ---------- human tells ----------
  const words = narr.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const lowerI = collect(narr, /(?<![\w'{])i(?![\w'}])(?=\s|[,.!?;:])/g);
  add(humanTells, 'lowercase_i', 'Lowercase "i" in narration', lowerI);

  const miss = [], noApos = [];
  const seenMiss = new Map();
  for (const w of words) {
    const lw = w.toLowerCase();
    if (NO_APOSTROPHE.has(lw)) noApos.push(w);
    else if (COMMON_MISSPELLINGS.has(lw)) seenMiss.set(lw, (seenMiss.get(lw) || 0) + 1);
  }
  for (const [w, k] of seenMiss) miss.push(k > 1 ? `${w} ×${k}` : w);
  add(humanTells, 'missing_apostrophe', 'Contractions without apostrophes', { count: noApos.length, examples: [...new Set(noApos)].slice(0, 6) });
  add(humanTells, 'common_misspelling', 'Common misspellings', { count: [...seenMiss.values()].reduce((a, b) => a + b, 0), examples: miss.slice(0, 8) });

  // Likely typos: lowercase words the English frequency list doesn't know (or barely knows) AND that are one edit
  // away from a common word ("beutiful" -> beautiful). Everything else is left alone: rare real words (gambeson; also
  // checked against data/extra_words.txt), regular derivations of known words (tallish, purpleish, unbothered),
  // other languages (in-character Spanish: sentences with 2+ common Spanish/Portuguese/French/Italian words are
  // skipped), contractions, capitalized words (names, places) and anything also used capitalized in the card.
  if (opts.lookupZipf) {
    const z = w => opts.lookupZipf(w) || 0;
    const capitalized = new Set((text.match(/\b[A-Z][a-z]+\b/g) || []).map(w => w.toLowerCase()));
    const typos = new Map(), toks = [];
    for (const sent of text.replace(/\{\{[^}]*\}\}/g, ' ').split(/(?<=[.!?…])\s+|\n+|["“”*]/)) {
      const ts = sent.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu) || [];
      if (ts.filter(t => FOREIGN.has(t.toLowerCase())).length >= 2) continue;
      toks.push(...ts);
    }
    for (const w of toks) {
      if (!/^[a-z]{3,}$/.test(w)) continue;   // capitals, contractions, accents, other scripts: not checked
      if (/(?:mente|cion|iendo|ando)$/.test(w)) continue;   // Spanish / Portuguese word endings
      if (capitalized.has(w) || COMMON_MISSPELLINGS.has(w) || NO_APOSTROPHE.has(w) || (opts.knownWords && opts.knownWords.has(w))) continue;
      const zw = z(w);
      if (zw >= 1.7 || (EXTRA_WORDS && EXTRA_WORDS.has(w)) || CARD_TERMS.has(w)) continue;   // a word in its own right
      // the intended word: one edit away and much more common. wordfreq lists some typos too ("beutiful" 1.7), so a
      // known-but-very-rare word counts only when its neighbor is a very common word.
      const near = nearestCommon(w, z, zw ? 5 : 3.5);
      if (!near || knownByForm(w, z) || w === near + w.slice(-1) && /[aeo]$/.test(w)) continue;   // dominante, humano: cognates
      const t = typos.get(w); typos.set(w, { near, count: (t ? t.count : 0) + 1 });
    }
    if (typos.size) add(humanTells, 'unknown_words', 'Likely typos (one letter off a common word)',
      { count: [...typos.values()].reduce((a, x) => a + x.count, 0), examples: [...typos].slice(0, 10).map(([w, x]) => `${w} (${x.near}?)`) },
      'Only words one letter away from a common word count; rare real words, other languages and invented words are left out.');
  }

  add(humanTells, 'txt_speak', 'Txt-speak in narration', collect(narr, TXT_SPEAK_RX));
  for (const [rx, label] of HOMOPHONE_RX) add(humanTells, 'homophone', `Word mix-up: ${label}`, collect(text, rx));
  add(humanTells, 'doubled_word', 'Doubled words ("the the")', collect(text, /\b(the|a|an|to|of|and|in|on|at|for|with|is|was|are|it|her|his|my|your|their|be|as|by|from|but|or|if|i)\s+\1\b/gi));
  add(humanTells, 'space_before_punct', 'Space before punctuation ("word ,")', collect(text, /[A-Za-z]\s+[,;:!?](?![!?]|\s*[)\]])|[A-Za-z]\s+\.(?!\.)(?=\s|$)/g));
  // W++ / PList / bracketed trait lists ({muscular,blue eyes}, [Likes: a, b]) are list syntax, not typos.
  const noLists = text.replace(/\{[^{}\n]*\}|\[[^\[\]\n]*\]/g, ' ');
  add(humanTells, 'missing_space_after', 'Missing space after punctuation ("end.Start")', collect(noLists, /[a-z]{3}[.!?][A-Z][a-z]{2,}|[a-z]{3},[a-z]{3,}(?![,a-z]*,)/g));
  add(humanTells, 'odd_ellipsis', 'Two-dot or 4+-dot ellipses', collect(text, /(?<!\.)\.\.(?!\.)|\.{4,}/g));
  add(humanTells, 'repeated_punct', 'Repeated !!! / ??? / ?!?!', collect(text, /[!?]{3,}/g));
  add(humanTells, 'double_hyphen', 'Typewriter dash ("--")', collect(text, /\w\s?--\s?\w/g));
  add(humanTells, 'lowercase_sentence', 'Sentences starting lowercase', collect(narr, /(?<![.A-Z]\.?)(?<!\b(?:e\.g|i\.e|etc|vs|approx|ca))[.!?]\s+(?!i\b)[a-z]{2,}/g));


  // Balance checks per paragraph.
  const unbalancedAst = [], unbalancedQ = [];
  for (const p of paragraphs) {
    const singles = (p.replace(/\*\*/g, '').replace(/^\s*\*\s+/gm, '').match(/\*/g) || []).length;
    if (singles % 2) unbalancedAst.push(excerpt(p, 0, Math.min(p.length, 60), 0));
    const pq = p.replace(/\d+\s*'\s*\d*\s*"|\d+(?:\.\d+)?\s*"(?=\s|[,.;)]|$)/g, ' ');  // 5'4", 12" -> not quotes
    const q = (pq.match(/"/g) || []).length + (pq.match(/[“”]/g) || []).length;
    if (q % 2) unbalancedQ.push(excerpt(p, 0, Math.min(p.length, 60), 0));
  }
  add(humanTells, 'unbalanced_asterisks', 'Paragraphs with an unclosed *action*', { count: unbalancedAst.length, examples: unbalancedAst.slice(0, 3) });
  add(humanTells, 'unbalanced_quotes', 'Paragraphs with an unclosed quote', { count: unbalancedQ.length, examples: unbalancedQ.slice(0, 3) });
  add(craftNotes, 'mixed_rp_format', 'Mixed RP format (*She says,* "…")', collect(text, /\*[^*\n]{0,80}\b(?:says?|said|asks?|asked|whispers?|whispered|replies|replied|mutters?|muttered)\b[,.]?\s*\*\s*["“]/gi),
    'Pick one: Markdown (*actions*, plain speech) or Novel ("speech", plain actions).');

  add(humanTells, 'char_name_tautology', '"{{char}} is <Name>" (renders as "Alice is Alice")', collect(text, /\{\{char\}\}\s+(?:is|was)\s+(?:named\s+|called\s+)?[A-Z][a-z]+(?=[\s,.;]+(?:a|an|the|and|who|,|\.|$))/g));
  add(humanTells, 'nonstandard_macro', 'Non-standard macro ({{character}}, {{Name}}, {name})', collect(text, /\{\{\s*(?!char\s*\}\}|user\s*\}\}|original\s*\}\}|random|roll|time|date|idle|input|lastMessage|pick|trim|noop|setvar|getvar|addvar|weekday|isodate|isotime|newline)[A-Za-z_' ]{2,20}\s*\}\}|(?<!\{)\{(?:name|char|character|user)\}(?!\})|\{\{(?:Char|User|CHAR|USER)\}\}/g),
    'SillyTavern only expands {{char}} and {{user}} (lowercase); others reach the model as literal text.');
  add(humanTells, 'the_user', '"the {{user}}" / "a {{user}}"', collect(text, /\b(?:the|a|an)\s+\{\{user\}\}/gi));
  const youInNarr = (narr.match(/\byou(?:r|rs|rself)?\b/gi) || []).length;
  const userMacro = (text.match(/\{\{user\}\}/gi) || []).length;
  if (youInNarr >= 2 && userMacro >= 2) craftNotes.push({ id: 'you_and_user', label: 'Both "you" and {{user}} used for the user in narration', count: Math.min(youInNarr, userMacro), examples: [`${youInNarr} × you/your, ${userMacro} × {{user}}`], note: 'The model may treat "you" and {{user}} as two different people.' });

  // ---------- craft notes ----------
  add(craftNotes, 'user_actions', 'Writes {{user}}\'s actions or words', collect(text, USER_ACTS_RX), 'Models copy this and start acting for the user.');
  add(craftNotes, 'you_actions', 'Narrates what "you" do or feel', collect(narr, YOU_ACTS_RX), 'Fine in a second-person greeting, but it invites the model to decide for the user.');
  add(craftNotes, 'gendered_user', 'Gendered pronoun right after {{user}}', collect(text, /\{\{user\}\}(?:'s)?\s+(?:\w+\s+){0,6}?(?:he|she|his|hers|him|himself|herself)\b(?=[^"”]*$|[^"”]*["“])/gim), 'Locks the user\'s gender; drop it if the card is meant for anyone.');
  add(craftNotes, 'jailbreak_in_card', 'Jailbreak / permission lines in the card', collect(text, /\b(?:never|not|don't|do not|won't|will not)\b[^.\n]{0,50}\b(?:speak|talk|act)\w*\b[^.\n]{0,30}\bfor\s+(?:\{\{user\}\}|user|you)(?!\w)|\b(?:nsfw|explicit content)\b[^.\n]{0,40}\b(?:allowed|permitted|encouraged)\b/gi), 'Usually better in the system prompt or left to the user\'s preset.');

  // Runs of 3+ sentences that all begin with {{char}} or the same capitalized name.
  const sentences = narr.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  let run = 1, runs = 0, runEx = [];
  const first = s => (s.match(/^[*_]*(\{\{char\}\}|[A-Z][a-z]+)/) || [])[1];
  for (let i = 1; i < sentences.length; i++) {
    const a = first(sentences[i - 1]), b = first(sentences[i]);
    if (a && a === b && !/^(?:The|A|An|It|This|That|There|She|He|They|I|You|We|But|And|Her|His)$/.test(a)) {
      run++; if (run === 3) { runs++; if (runEx.length < 3) runEx.push(sentences.slice(i - 2, i + 1).join(' ').slice(0, 140)); }
    } else run = 1;
  }
  add(craftNotes, 'same_subject_runs', 'Runs of sentences all starting with the same name', { count: runs, examples: runEx }, '"{{char}} is short. {{char}} likes milk." reads as a list; group traits into sentences.');

  const also = (text.match(/\balso\b/gi) || []).length, nW = (text.match(/[A-Za-z]+/g) || []).length;
  if (nW && also >= 4 && also / nW > 0.006) craftNotes.push({ id: 'also_overuse', label: 'Heavy use of "also"', count: also, examples: [`${also} in ${nW} words`] });

  const tokensApprox = Math.round(text.length / 4);
  if (tokensApprox > 2500) craftNotes.push({ id: 'long_card', label: 'Long card (permanent tokens)', count: tokensApprox, examples: [`≈${tokensApprox} tokens`], note: 'Guides suggest roughly 500–1500 permanent tokens; long cards crowd out chat memory.' });

  const tellCount = humanTells.reduce((a, x) => a + x.count, 0);
  return { humanTells, craftNotes, summary: { humanTellCount: tellCount, humanTellsPer1kWords: nW ? tellCount * 1000 / nW : 0, craftNoteCount: craftNotes.length } };
}
