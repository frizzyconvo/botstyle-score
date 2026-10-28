// archetypes.js - Experimental archetype tag: a light, fun read of how a card is put together
// (description format x greeting voice x genre x length). Unscored; meant to give everyone a little
// something. One archetype per card, plus an optional length badge.
const GENRE_ADJ = { fantasy: 'High-fantasy', horror: 'Gothic', scifi: 'Sci-fi', romance: 'Romantic', modern: 'Slice-of-life', action: 'Swashbuckling', general: '' };
const BLURB = {
  novelist: 'Writes the card like a book: prose description, narrated greeting.',
  roleplayer: 'Classic roleplay card: second-person greeting with *asterisk* actions.',
  storyteller: 'Prose all the way down, greeting and all.',
  dossier: 'Sections and headers, like a character file.',
  minimalist: 'Token-saver format (W++, PList, JSON): every token earns its keep.',
  listmaker: 'Bullet points and key-value lines.',
  method: 'Written in the character\'s own voice.',
  hybrid: 'Mixes structured blocks with prose.',
  rules: 'Comes with a rulebook: instructions plus character writing.',
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
  const pw = stats ? stats.proseWords : 0;
  const size = pw >= 1500 ? { id: 'doorstopper', label: 'Doorstopper', note: '1,500+ prose words' } : pw > 0 && pw < 200 ? { id: 'bite_sized', label: 'Bite-sized', note: 'under 200 prose words' } : null;
  return { id: kind, label: label.charAt(0).toUpperCase() + label.slice(1), blurb: BLURB[kind] + (genre && genre.primary !== 'general' ? ` Genre read: ${genre.label.toLowerCase()}${genre.secondaryLabel ? ' with ' + genre.secondaryLabel.toLowerCase() : ''}.` : ''), size };
}
