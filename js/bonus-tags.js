// bonus-tags.js - Fun, descriptive tags for outliers. Not scored.
//
// Thresholds sit in roughly the top 0.2-3.5% of real cards (Korshuk, JanitorAI, Chub;
// see BOTSTYLE.md), so a tag means "this card stands out", not "this card is bad".

export const TAG_THRESHOLDS = {
  // % = share of 15.7k English real cards (Korshuk, JanitorAI, Chub 2023-2025) that get the tag
  copyeditProof: { tellsPer1k: 25, minTells: 6 },             // 3.4%  typos, txt-speak, unclosed quotes…
  clichemonger: { clichesPer1k: 4, minHits: 3 },              // 1.7%  shared clichés (not AI-specific)
  cardForAnts: { maxProseWords: 120, minBoilerShare: 0.3 },   // 0.4%  instructions with a sliver of character
  userPuppeteer: { minUserActions: 2 },                       // 3.1%  writes what {{user}} does / says / feels
  wallOfText: { paragraphWords: 500 },                        // 1.8%  one paragraph this long or longer
  noOneKnows: { tokens: 3000, minScore: 40 },                 // 0.2%  3000+ permanent tokens AND a Common score
  charWritesCard: { minSentences: 10, minShare: 0.5 },        // 3.5%  most description sentences start with {{char}}
  usualSuspects: { minNames: 2 },                             // 0.2%  AI-favourite names (Elara, Kael, Thorne…)
};

export const TAG_INFO = {
  copyedit_proof: ['Copyedit-proof', 'Lots of typos and grammar slips. Human, and proud of it.'],
  clichemonger: ['Clichemonger', 'Lots of clichés that humans and models both lean on.'],
  card_for_ants: ['A card for ants', 'Mostly boilerplate and rules, with a sliver of actual character.'],
  user_puppeteer: ['User puppeteer', 'Writes what {{user}} does, says or feels; models copy this.'],
  wall_of_text: ['Wall of text', 'At least one paragraph is enormous.'],
  no_one_knows: ['No one knows you\'re a chatbot on the internet', 'A very long card (3,000+ permanent tokens) written in heavily AI-flavoured prose.'],
  char_writes_card: ['{{char}} writes card', 'Most description sentences start with {{char}}: "{{char}} is… {{char}} likes… {{char}} has…"'],
  usual_suspects: ['The usual suspects', 'Uses several names models are famously fond of.'],
};

const CHAR_START = /^[\s\-*•>"'(\[]*\{\{char\}\}/i;
/** Description sentences (or lines) that start with {{char}}. */
function charStarts(def) {
  const segs = def.split(/(?<=[.!?])\s+|\n+/).filter(x => /[A-Za-z]{2}/.test(x));
  const n = segs.filter(x => CHAR_START.test(x)).length;
  return { charStartSentences: n, charStartShare: segs.length ? n / segs.length : 0 };
}

/** The raw measurements behind the tags (also returned by scoreCard as `tagInputs`). */
export function tagInputs(r) {
  const st = r.stats || {};
  const words = Math.max(1, st.totalWords || 0);
  const tells = (r.checks && r.checks.humanTells || []).reduce((a, x) => a + x.count, 0);
  const c = r.cliches;
  const cliches = c ? c.phraseHits.reduce((a, x) => a + x.count, 0) : 0;
  const text = String(r.text || '');
  return {
    tells, tellsPer1k: tells * 1000 / words,
    cliches, clichesPer1k: c ? c.phrasesPer1k : 0,
    proseWords: st.proseWords || 0,
    boilerShare: st.totalWords ? (st.boilerplateWords || 0) / st.totalWords : 0,
    structuredShare: st.totalWords ? (st.structuredWords || 0) / st.totalWords : 0,
    userActions: (r.checks && r.checks.craftNotes || []).filter(x => x.id === 'user_actions' || x.id === 'you_actions').reduce((a, x) => a + x.count, 0),
    longestParagraph: Math.max(0, ...text.split(/\n/).map(p => (p.match(/[A-Za-z]+/g) || []).length)),
    tokens: Math.round(text.length / 4),
    ...charStarts(r.definitionText || ''),
    score: r.score, reliable: !!r.reliable,
    names: (r.names || []).length,
    nonEnglish: !!st.nonEnglish,
  };
}

/**
 * @param {object} r  result fields from scoreCard(): stats, checks, cliches, names, text
 */
export function bonusTags(r) {
  const T = TAG_THRESHOLDS, out = [];
  const add = (id, detail) => out.push({ id, label: TAG_INFO[id][0], note: TAG_INFO[id][1], detail });
  const m = tagInputs(r);
  if (!m.nonEnglish && m.tells >= T.copyeditProof.minTells && m.tellsPer1k >= T.copyeditProof.tellsPer1k)
    add('copyedit_proof', `${m.tells} slips (${m.tellsPer1k.toFixed(0)} per 1k words)`);
  if (m.cliches >= T.clichemonger.minHits && m.clichesPer1k >= T.clichemonger.clichesPer1k)
    add('clichemonger', `${m.cliches} clichés (${m.clichesPer1k.toFixed(0)} per 1k words)`);
  if (m.proseWords <= T.cardForAnts.maxProseWords && m.boilerShare >= T.cardForAnts.minBoilerShare)
    add('card_for_ants', `${m.proseWords} words of prose, ${Math.round(m.boilerShare * 100)}% boilerplate`);
  if (m.userActions >= T.userPuppeteer.minUserActions) add('user_puppeteer', `${m.userActions} places`);
  if (m.longestParagraph >= T.wallOfText.paragraphWords) add('wall_of_text', `longest paragraph ${m.longestParagraph} words`);
  if (m.tokens >= T.noOneKnows.tokens && m.reliable && m.score >= T.noOneKnows.minScore) add('no_one_knows', `≈${m.tokens} tokens, score ${m.score.toFixed(0)}`);
  if (m.charStartSentences >= T.charWritesCard.minSentences && m.charStartShare >= T.charWritesCard.minShare)
    add('char_writes_card', `${m.charStartSentences} sentences (${Math.round(m.charStartShare * 100)}%) start with {{char}}`);
  if (m.names >= T.usualSuspects.minNames) add('usual_suspects', r.names.slice(0, 5).map(n => n.item).join(', '));
  return out;
}
