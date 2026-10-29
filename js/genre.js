// genre.js - Rough genre read of a card from its tags and vocabulary (experimental, unscored).
// Used by the pulp score and the archetype tags. Keyword lists, not a classifier: density of genre
// words per 1k prose words, with a boost for matching card tags.

const LEX = {
  fantasy: /\b(?:magic\w*|mages?|wizards?|witch\w*|sorcer\w+|spells?|enchant\w*|swords?|knights?|kingdoms?|realms?|castles?|elf|elves|elven|dwar(?:f|ves)|orcs?|dragons?|fae|faerie|runes?|guilds?|quests?|goddess\w*|deit(?:y|ies)|demons?|princes?|princess\w*|queens?|kings?|thrones?|mana|potions?|taverns?|empires?)\b/gi,
  horror: /\b(?:blood\w*|corpses?|nightmares?|haunt\w*|ghosts?|curse[sd]?|undead|zombies?|eldritch|screams?|gore|vampires?|werewol(?:f|ves)|creatures?|monsters?|abyss|dread|rot\w*|shadows?)\b/gi,
  scifi: /\b(?:starships?|spaceships?|space|planets?|aliens?|androids?|robots?|cyber\w*|lasers?|galax\w+|colon(?:y|ies)|mechs?|stations?|augment\w*|implants?|hologram\w*|orbit\w*|plasma|cyborgs?|neon)\b/gi,
  romance: /\b(?:love[sd]?|lovers?|kiss\w*|romanc\w*|romantic|blush\w*|flirt\w*|crush\w*|dates?|dating|desires?|seduc\w+|intima\w+|passion\w*|lust\w*|arous\w+|cuddl\w+|boyfriend|girlfriend|husband|wife|wedding|marr(?:y|ied|iage))\b/gi,
  modern: /\b(?:school|college|university|class(?:es|mates?)?|office|apartment|phones?|coffee|caf[eé]|jobs?|roommates?|mall|cars?|texts?|texting|party|parties|bars?|clubs?|gym|internet|streamer|instagram|campus|dorm)\b/gi,
  action: /\b(?:battles?|fights?|fighting|missions?|wars?|soldiers?|mercenar(?:y|ies)|weapons?|guns?|bandits?|hunts?|hunters?|guards?|assassins?|blades?|armou?r|combat|duels?|raids?)\b/gi,
};
const TAG_HINT = {
  fantasy: /fantasy|magic|magical|elf|dragon|demon|royalty|medieval|rpg|dungeon|knight|witch/i,
  horror: /horror|monster|vampire|werewolf|zombie|undead|creepy|yandere|gore/i,
  scifi: /sci-?fi|science fiction|robot|android|cyber|space|alien|mecha/i,
  romance: /romance|romantic|smut|love|fluff|wholesome|boyfriend|girlfriend/i,
  modern: /modern|slice of life|school|college|office|realistic|real/i,
  action: /action|adventure|military|mercenary|assassin|hero|villain/i,
};
export const GENRE_LABELS = { fantasy: 'Fantasy', horror: 'Horror / dark', scifi: 'Sci-fi', romance: 'Romance', modern: 'Modern / slice of life', action: 'Action / adventure', general: 'General' };
// A matching card tag adds 12 (was 6): with 12, the genre read agrees with a card's genre tag 88% of the time instead of
// 45% (JanitorAI sample, 2026-10-29). Tags say more than keywords: Empath's topic words were tried as extra keywords
// and ranked cards better within a genre, but picked the wrong single genre more often (Goodreads blurbs 62% -> 47-55%).
const TAG_BOOST = 12;
const PULP_GENRES = new Set(['fantasy', 'horror', 'scifi', 'action', 'romance']);

/** @returns {{primary, label, secondary, scores: Object<string, number>, pulpy: boolean}} scores are hits per 1k prose words */
export function detectGenre(prose, tags = []) {
  const text = String(prose || ''), n = Math.max(1, (text.match(/[A-Za-z']+/g) || []).length);
  const tagStr = (Array.isArray(tags) ? tags : []).join(' ');
  const scores = {};
  for (const [g, rx] of Object.entries(LEX)) {
    rx.lastIndex = 0;
    const hits = (text.match(rx) || []).length;
    scores[g] = +(hits * 1000 / n + (TAG_HINT[g].test(tagStr) ? TAG_BOOST : 0)).toFixed(1);
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0][1] >= 8 ? ranked[0][0] : 'general';
  const secondary = primary !== 'general' && ranked[1][1] >= 8 && ranked[1][1] >= ranked[0][1] * 0.6 ? ranked[1][0] : null;
  return { primary, label: GENRE_LABELS[primary], secondary, secondaryLabel: secondary ? GENRE_LABELS[secondary] : null, scores, pulpy: PULP_GENRES.has(primary) };
}
