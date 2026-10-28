// archetypes.js - Experimental archetype tag: a light, fun read of how a card is put together
// (description format x greeting voice x genre x length). Unscored; meant to give everyone a little
// something. One archetype per card, plus an optional length badge.
const GENRE_ADJ = { fantasy: 'High-fantasy', horror: 'Gothic', scifi: 'Sci-fi', romance: 'Romantic', modern: 'Slice-of-life', action: 'Swashbuckling', general: '' };
const BLURB = {
  novelist: 'Free-prose description with a narrated, novel-style greeting.',
  roleplayer: 'Free-prose description with a second-person greeting and *asterisk* actions.',
  storyteller: 'Free prose all the way down, greeting and all.',
  dossier: 'Formatted prose: sections and headers, like a character file.',
  minimalist: 'Compact format (W++, PList, JSON): every token earns its keep.',
  listmaker: 'Lists: bullet points and key-value lines.',
  method: 'In voice: written in the character\'s own voice.',
  hybrid: 'Structured + prose: compact or list blocks mixed with prose.',
  rules: 'Boilerplate + prose: comes with a rulebook.',
};
const NOUN = { novelist: 'novelist', roleplayer: 'roleplayer', storyteller: 'storyteller', dossier: 'dossier-keeper', minimalist: 'minimalist', listmaker: 'list-maker',
  method: 'method actor', hybrid: 'tinkerer', rules: 'rules-lawyer' };

export function archetype({ format, greeting, genre, stats }) {
  const f = format && format.format, g = greeting || {};
  let kind;
  if (f === 'compact') kind = 'minimalist';
  else if (f === 'lists') kind = 'listmaker';
  else if (f === 'in_voice') kind = 'method';
  else if (f === 'formatted_prose') kind = 'dossier';
  else if (f === 'structured+prose') kind = 'hybrid';
  else if (f === 'boilerplate+prose') kind = 'rules';
  else if (g.pov === 'second_person' && /markdown/.test(g.rp || '')) kind = 'roleplayer';
  else if (g.pov === 'third_person' || /novel/.test(g.rp || '')) kind = 'novelist';
  else kind = 'storyteller';
  const adj = GENRE_ADJ[(genre && genre.primary) || 'general'];
  const label = (adj ? adj + ' ' : 'The ') + NOUN[kind];
  // Size badge: Doorstopper = 1,500+ words of prose; Bite-sized = under 350 words in the scored fields, lists and all
  // (about half of 2023 JanitorAI cards, a sixth of Chub cards). A bite-sized score rests on few words.
  const pw = stats ? stats.proseWords : 0, tw = stats ? stats.totalWords : 0;
  const size = pw >= 1500 ? { id: 'doorstopper', label: 'Doorstopper', note: '1,500+ prose words' } : tw > 0 && tw < 350 ? { id: 'bite_sized', label: 'Bite-sized', note: `${tw} words in the scored fields (under 350): the score rests on few words, so treat it as rough` } : null;
  return { id: kind, label: label.charAt(0).toUpperCase() + label.slice(1), blurb: BLURB[kind] + (genre && genre.primary !== 'general' ? ` Genre read: ${genre.label.toLowerCase()}${genre.secondaryLabel ? ' with ' + genre.secondaryLabel.toLowerCase() : ''}.` : ''), size };
}
