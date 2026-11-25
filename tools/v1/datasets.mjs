// datasets.mjs - Registry of the card sources BBBScorer 1.0 reads, and a reader that turns each card into parts.
//
// A part is one scored piece of a card:
//   description = description + personality + scenario, joined by blank lines (example dialogue excluded)
//   greeting    = first_mes only
// Empty parts are not yielded. Card text is read from local datasets and is never committed.
//
// Card datasets live in ../card-datasets (override with BOTSTYLE_CARDS); generated cards in eval/ai-cards.
// Sources that name individual creators are registered from a private, uncommitted file (dev/v1/sources.local.mjs,
// override with BOTSTYLE_PRIVATE_SOURCES) that exports register({ SOURCES, READERS, labeledFolder }).
//   node tools/v1/datasets.mjs [sourceId ...]   prints part counts per source, era and part
import { createReadStream, existsSync, readdirSync, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { ROOT } from '../_paths.mjs';
import { readCards } from '../_card_sources.mjs';
import { provenanceCards, readManifest } from '../_provenance.mjs';

const CARDS_DEFAULT = '../card-datasets';
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, CARDS_DEFAULT);
const abs = p => p.startsWith(CARDS_DEFAULT + '/') ? join(CARDS, p.slice(CARDS_DEFAULT.length + 1)) : resolve(ROOT, p);

const BOTH = ['description', 'greeting'], DESC = ['description'];
const H = name => `${CARDS_DEFAULT}/historical-2023/${name}`;   // historical-2023 file prefix

/** Every source, by id. kind: scraped (unknown provenance), real_ai (creator-labeled AI), provenance (provenance.csv),
 *  generated (our test cards), reference (human reference only). excluded: never used for training, mining or testing. */
export const SOURCES = {
  // early-2023 collections; dates are the archive's file dates when a card has none
  chub_mega:          { path: H('chub_mega'), kind: 'scraped', partsAllowed: BOTH },
  venusai:            { path: H('venusai'), kind: 'scraped', partsAllowed: BOTH },
  pygmalion_discord:  { path: H('pygmalion_discord'), kind: 'scraped', partsAllowed: BOTH },
  rokos_basilisk:     { path: H('rokos_basilisk'), kind: 'scraped', partsAllowed: BOTH },
  cardnsfwjammy:      { path: H('cardnsfwjammy'), kind: 'scraped', partsAllowed: BOTH },
  perchance_aicc:     { path: H('perchance_aicc_nsfw'), kind: 'scraped', partsAllowed: BOTH },
  korshuk:            { path: `${CARDS_DEFAULT}/korshuk-roleplay-characters/korshuk_cards.jsonl`, kind: 'scraped', partsAllowed: BOTH },
  // large scraped sets
  raincandy:          { path: `${CARDS_DEFAULT}/raincandy-chub-ai-cards/raincandy_cards.jsonl`, kind: 'scraped', partsAllowed: BOTH },
  jaicards:           { path: `${CARDS_DEFAULT}/jaicards-cards-js/jaicards_cards.jsonl`, kind: 'scraped', partsAllowed: BOTH },
  perchance:          { path: `${CARDS_DEFAULT}/perchance-character-database/ai-character-chat/characters`, kind: 'scraped', partsAllowed: BOTH },
  // CharacterHub.com profiles (a profile site, not cards): 2022 profiles only, as the pre-ChatGPT description check
  characterhub_com:   { path: `${CARDS_DEFAULT}/characterhub.com/characterhub.jsonl/characterhub.jsonl`, kind: 'reference', partsAllowed: DESC },
  // real-world AI cards, labeled by their creators (more come from the private registry)
  creator_statements: { path: `${CARDS_DEFAULT}/creator-statements`, kind: 'real_ai', partsAllowed: BOTH },
  provenance:         { path: `${CARDS_DEFAULT}/provenance-split-dataset`, kind: 'provenance', partsAllowed: BOTH },
  // generated test cards
  generated_v1:       { path: 'eval/ai-cards/ai_cards.jsonl', kind: 'generated', partsAllowed: BOTH },
  generated_v2:       { path: 'eval/ai-cards/ai_cards_v2.jsonl', kind: 'generated', partsAllowed: BOTH },
  generated_holdout:  { path: 'eval/ai-cards/ai_cards_holdout.jsonl', kind: 'generated', partsAllowed: BOTH },
  spb_ai:             { path: `${CARDS_DEFAULT}/spb-2602-ai-personas/data.jsonl`, kind: 'generated', partsAllowed: DESC, excluded: true },
};

/** Era of a card: pre-chatgpt (before 2022-12-01), 2023 (to 2023-12-31), 2024+, unknown (no usable date), generated. */
export function eraOf(createdAt, kind) {
  if (kind === 'generated') return 'generated';
  if (!createdAt) return 'unknown';
  const t = Date.parse(createdAt);
  if (isNaN(t)) return 'unknown';
  return t < Date.UTC(2022, 11, 1) ? 'pre-chatgpt' : t < Date.UTC(2024, 0, 1) ? '2023' : '2024+';
}

// ---- readers: each yields cards as { id, creator, createdAt, eraDate?, description, personality, scenario, first_mes, ...labels } ----
async function* jsonl(p) {
  const rl = createInterface({ input: createReadStream(p), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) yield JSON.parse(line);
}
const str = v => typeof v === 'string' ? v : '';
const creatorOf = v => typeof v === 'string' && v.trim() && v !== '[object Object]' ? v.trim() : null;
const dateOnly = v => (typeof v === 'string' && v) || null;

function historical(prefix, skip) {
  return async function* (path) {
    const dir = join(path, '..'), base = prefix + '.';
    const files = readdirSync(dir).filter(f => f.startsWith(base) && f.endsWith('.jsonl')).sort();
    if (!files.length) throw new Error(`source data not found: ${prefix}`);
    for (const f of files) for await (const r of jsonl(join(dir, f))) {
      if (skip && skip(r)) continue;
      yield { ...r, createdAt: dateOnly(r.createdAt), eraDate: dateOnly(r.createdAt) || dateOnly(r.fileDate) };
    }
  };
}
// Chub mega: chubData.json rows are site metadata, mostly "Creator's notes go here." stubs with no greeting.
const chubStub = r => str(r.description).length + str(r.first_mes).length <= 200;

// Real-world AI folders: card files plus manifest.jsonl ({ file, createdAt }) or cards_list.txt ("<creator>/<slug>|<date>").
export function* labeledFolder(root, cardsSub, extra) {
  const dates = new Map();
  if (existsSync(join(root, 'manifest.jsonl')))
    for (const l of readFileSync(join(root, 'manifest.jsonl'), 'utf-8').split('\n')) if (l.trim()) { const r = JSON.parse(l); dates.set(r.file, r.createdAt || null); }
  if (existsSync(join(root, 'cards_list.txt')))
    for (const l of readFileSync(join(root, 'cards_list.txt'), 'utf-8').split('\n')) { const [path, d] = l.trim().split('|'); if (path && d) dates.set(path.replace('/', '_') + '.png', d); }
  for (const c of readCards(cardsSub ? join(root, cardsSub) : root)) {
    const key = cardsSub ? `${cardsSub}/${c.id}` : c.id;
    const createdAt = c.createdAt || dates.get(key) || null;
    yield { ...c, id: key, createdAt, ...extra };
  }
}

export const READERS = {
  chub_mega: historical('chub_mega', chubStub),
  venusai: historical('venusai'), pygmalion_discord: historical('pygmalion_discord'), rokos_basilisk: historical('rokos_basilisk'),
  cardnsfwjammy: historical('cardnsfwjammy'), perchance_aicc: historical('perchance_aicc_nsfw'),
  korshuk: p => jsonl(p),
  raincandy: async function* (p) { for await (const r of jsonl(p)) yield { ...r, creator: str(r.fullPath).split('/')[0] || null }; },
  jaicards: p => jsonl(p),
  perchance: function* (p) { yield* readCards(p); },
  characterhub_com: async function* (p) {
    for await (const r of jsonl(p)) {
      if (eraOf(r.created, 'reference') !== 'pre-chatgpt') continue;
      const i = r.info || {};
      yield { id: r.slug, creator: null, createdAt: r.created, description: str(i.description), personality: str(i.backstory) };
    }
  },
  // creators who made statements about their cards; no per-card label yet, so provenance stays unknown
  creator_statements: function* (p) { for (const d of readdirSync(p).sort()) for (const c of labeledFolder(join(p, d), '', { creator: d })) yield { ...c, id: `${d}/${c.id}` }; },
  provenance: function* (p) {
    const labelOf = new Map(readManifest(p).map(r => [r.file.replace(/\\/g, '/'), r.label_source || null]));
    for (const c of provenanceCards(p)) yield { ...c, provenance: c.prov.provenance, labelSource: labelOf.get(c.id.replace(/^prov\//, '')) || null };
  },
  generated_v1: generated(() => { try { return new Set(JSON.parse(readFileSync(abs('eval/ai-cards/ai_cards_invalid_ids.json'), 'utf-8'))); } catch { return new Set(); } }),
  generated_v2: generated(), generated_holdout: generated(),
  spb_ai: async function* (p) { let i = 0; for await (const r of jsonl(p)) yield { id: String(i++), description: str(r.persona_text) }; },
};
function generated(invalid) {
  return async function* (p) {
    const skip = invalid ? invalid() : new Set();
    for await (const r of jsonl(p)) {
      if (r.valid === false || skip.has(r.id)) continue;
      yield { ...r, createdAt: null, provenance: 'ai', model: r.model || null, requestStyle: r.style_requested || null };
    }
  };
}

// Private registry (creator-named sources); silently absent on other machines.
const PRIVATE = process.env.BOTSTYLE_PRIVATE_SOURCES ? resolve(process.env.BOTSTYLE_PRIVATE_SOURCES) : resolve(ROOT, 'dev', 'v1', 'sources.local.mjs');
if (existsSync(PRIVATE)) (await import(pathToFileURL(PRIVATE).href)).register({ SOURCES, READERS, labeledFolder });

const joinParts = (...xs) => xs.map(x => str(x).trim()).filter(Boolean).join('\n\n');

/** Parts of every card in one source. opts.limit caps the number of parts yielded. */
export async function* readParts(sourceId, opts = {}) {
  const src = SOURCES[sourceId], read = READERS[sourceId];
  if (!src || !read) throw new Error(`unknown source: ${sourceId}`);
  const path = abs(src.path);
  if (!existsSync(path) && !src.path.includes('historical-2023/')) throw new Error(`source data not found: ${sourceId} (${src.path})`);
  const limit = opts.limit ?? Infinity; let n = 0;
  if (n >= limit) return;
  for await (const c of read(path)) {
    const createdAt = c.createdAt || null;
    const base = { source: sourceId, creator: creatorOf(c.creator), createdAt, era: eraOf(c.eraDate || createdAt, src.kind),
      provenance: c.provenance || 'unknown', labelSource: c.labelSource || null };
    if (src.kind === 'generated') Object.assign(base, { model: c.model || null, requestStyle: c.requestStyle || null });
    const texts = { description: joinParts(c.description, c.personality, c.scenario), greeting: str(c.first_mes).trim() };
    for (const part of src.partsAllowed) {
      if (!texts[part]) continue;
      yield { id: `${sourceId}:${c.id}:${part}`, ...base, part, text: texts[part] };
      if (++n >= limit) return;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOURCES);
  for (const id of ids) {
    const counts = {};
    try { for await (const p of readParts(id)) { const k = `${p.era} ${p.part}`; counts[k] = (counts[k] || 0) + 1; } }
    catch (e) { console.log(`${id}: ${e.message}`); continue; }
    console.log(`${id}${SOURCES[id].excluded ? ' (excluded)' : ''}: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ') || 'no parts'}`);
  }
}
