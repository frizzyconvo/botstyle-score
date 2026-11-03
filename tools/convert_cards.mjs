#!/usr/bin/env node
// convert_cards.mjs - Turn a pile of character cards in any format into plain-text JSONL you can audit, search and
// score: no images, one card per line, split by the cards' own tag metadata into SFW and NSFW files.
//
//   node tools/convert_cards.mjs <path> [--name pack] [--out <folder>] [--author-dir 1] [--estimate]
//        [--lorebook] [--keep-dupes] [--limit N]
//
// <path> is anything tools/_card_sources.mjs reads: a folder (searched recursively; PNG / WebP / JPEG cards, card JSON,
// JSONL, .zst, and .zip / .charx / .7z / .rar archives inside it), an archive (optionally followed by a folder or
// pattern inside it, e.g. pack.7z\books\*.png), or a single file. Card formats: Tavern V1 / V2 / V3, RisuAI, Pygmalion,
// Agnai, Chub API, Character.AI dumps, Perchance, CharacterHub.com profiles. A details.txt next to the cards ("by X",
// "tags: a, b") fills in tags and creator. .7z / .rar need 7-Zip (7z.exe in Program Files or on PATH, or SEVENZIP=...).
//
// Output (default: a "<name>-jsonl" folder next to <path>; nothing is written next to the cards themselves):
//   <name>.sfw.jsonl        cards with tag metadata and no NSFW tag (and no explicit text: see below)
//   <name>.nsfw.jsonl       cards tagged NSFW (or flagged is_nsfw), plus tagged-SFW cards whose text reads explicit
//   <name>.untagged.jsonl   cards with no tag metadata; --estimate splits them into untagged-sfw-est / untagged-nsfw-est
//                           by the NSFW read-out (js/nsfw.js), which is a word count, not a judgment
//   <name>.held.jsonl       cards whose text or tags suggest a character under 18 together with sexual tags or words;
//                           kept apart from every other file for a human to look at. A screen, not a guarantee.
//   <name>.report.md / .report.json   what was read, what was skipped and why, duplicates, tags, dates
// Exact duplicates (same description, greeting, personality and scenario once the name, case, spacing and punctuation
// are normalized; under 30 words the name must match too) are written once; the report lists the copies (--keep-dupes writes them too, with dupOf). Each line carries textHash and
// simhash so other datasets can be matched later (tools/dedupe_cards.mjs).
// --author-dir N  use the Nth folder of each card's path as its creator when the card names none (Chub archives sorted
//                 author/character/card.png: --author-dir 1).
// --lorebook      keep lorebook entry text (default: only the entry count and word count).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';
import { readCards, sourceKind, sevenZip } from './_card_sources.mjs';
import { normalizeText, textHash, simhash, hamming } from './_card_parse.mjs';
import { detectNsfw } from '../js/nsfw.js';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true; };
const VALUED = new Set(['--name', '--out', '--author-dir', '--limit']);
const src = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && VALUED.has(argv[i - 1])));
if (!src) { console.log('usage: node tools/convert_cards.mjs <folder | archive | file> [--name pack] [--out folder] [--author-dir 1] [--estimate] [--lorebook] [--keep-dupes]'); process.exit(2); }
const SRC = resolve(String(src).replace(/^"|"$/g, ''));
const kind = sourceKind(SRC);
if (!kind) { console.log(`Can't read cards at ${SRC}.`); process.exit(2); }
const NAME = String(opt('--name') || basename(SRC.replace(/[\\/]\*.*$/, '')).replace(/\.(zip|7z|rar|charx|jsonl?|zst)$/gi, '')).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'cards';
const srcBase = SRC.replace(/[\\/]\*.*$/, '').replace(/(\.(?:zip|7z|rar|charx))[\\/].*$/i, '$1');
const OUT = resolve(String(opt('--out') || join(dirname(srcBase), NAME + '-jsonl')));
const AUTHOR_DIR = opt('--author-dir') ? Number(opt('--author-dir')) : 0;
const ESTIMATE = argv.includes('--estimate'), LOREBOOK = argv.includes('--lorebook'), KEEP_DUPES = argv.includes('--keep-dupes');
const LIMIT = opt('--limit') ? Number(opt('--limit')) : Infinity;
mkdirSync(OUT, { recursive: true });
if ((kind === '7z' || kind === 'rar') && !sevenZip()) { console.log('This is a .7z / .rar: install 7-Zip (https://www.7-zip.org) or set SEVENZIP to the path of 7z.exe.'); process.exit(2); }

// ---------------------------------------------------------------- classification
const NSFW_TAG = /^(?:nsfw\w*|nsfl|smut\w*|explicit|lewd\w*|r-?18\+?|18\+|adults? only|sex|sexual|erotic\w*|porn\w*|hentai|kink\w*|fetish\w*|bdsm|breeding|ntr|netorare|futa\w*|ecchi|yaoi|yuri|bara|monster ?girl sex|not safe for work)$/i;
const MINOR_TAG = /^(?:loli\w*|shota\w*|cub|underage|minor|child|kid|preteen|teen\w*|high ?school\w*|middle ?school\w*|elementary\w*)$/i;
const HOLD_TAG = /^(?:loli\w*|shota\w*|cub|underage|preteen)$/i;
const MINOR_TEXT = new RegExp([
  String.raw`\b(?:[1-9]|1[0-7])\s*(?:-|\s)?(?:years?|yrs?|yr)\s*(?:-|\s)?old\b`,
  String.raw`\b(?:[1-9]|1[0-7])\s*(?:yo|y\/o|y\.o\.?)\b`,
  String.raw`\bage[d]?\s*[:=(]?\s*(?:[1-9]|1[0-7])\b(?!\s*(?:years?\s+)?(?:ago|later|before|after|centur|millenni|thousand|hundred|%))`,
  String.raw`\b(?:loli|lolicon|shota|shotacon|underage|under-age|preteen|pre-teen|prepubescent|middle[- ]?schooler|grade[- ]?schooler|elementary school(?:er)?)\b`,
  String.raw`\b(?:teen|teenage|teenager|high[- ]?schooler|high school (?:student|girl|boy)|schoolgirl|schoolboy)\b`,
].join('|'), 'i');
const normTag = t => String(t).toLowerCase().replace(/[^\p{L}\p{N}+ ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const fullText = c => [c.description, c.personality, c.scenario, c.first_mes, ...(c.alternate_greetings || [])].filter(Boolean).join('\n\n');
function classify(c) {
  const tags = (c.tags || []).map(normTag).filter(Boolean);
  const tagged = tags.length > 0 || c.nsfwFlag != null;
  // "Adult" and "Mature" aren't on the list: on Perchance and elsewhere they're age categories ("mature woman").
  // A plain "sfw" tag counts as the card's own rating.
  const nsfwTag = c.nsfwFlag === true || tags.some(t => NSFW_TAG.test(t));
  const text = fullText(c);
  const read = detectNsfw(text, c.tags || []).level;
  const minor = tags.some(t => MINOR_TAG.test(t)) || MINOR_TEXT.test(text);
  if (tags.some(t => HOLD_TAG.test(t)) || (minor && (nsfwTag || read !== 'none'))) return { bucket: 'held', why: 'possible minor with sexual tags or words', read };
  if (tagged) {
    if (nsfwTag) return { bucket: 'nsfw', why: c.nsfwFlag === true ? 'is_nsfw flag' : 'NSFW tag', read };
    if (read === 'explicit') return { bucket: 'nsfw', why: 'no NSFW tag, but the text reads explicit', read };
    return { bucket: 'sfw', why: 'tags without NSFW', read };
  }
  if (!ESTIMATE) return { bucket: 'untagged', why: 'no tag metadata', read };
  return read === 'none' ? { bucket: 'untagged-sfw-est', why: 'no tags; NSFW read-out finds nothing', read } : { bucket: 'untagged-nsfw-est', why: `no tags; NSFW read-out: ${read}`, read };
}

const words = t => (String(t || '').match(/[\p{L}\p{N}']+/gu) || []);

// ---------------------------------------------------------------- run
const BUCKETS = ['sfw', 'nsfw', 'untagged', 'untagged-sfw-est', 'untagged-nsfw-est', 'held'];
const streams = {}, tmpPath = b => join(OUT, `${NAME}.${b}.jsonl.tmp`);
const out = b => streams[b] || (streams[b] = createWriteStream(tmpPath(b)));
const R = { source: SRC, kind, started: new Date().toISOString(), cards: 0, written: {}, why: {}, containers: {}, specs: {}, tagSources: {}, nsfwRead: {},
  skipped: {}, skippedExamples: {}, pngKeys: {}, files: {}, ignoredExt: {}, dupes: 0, dupeExamples: [], nearDupes: [], tags: {}, years: {}, longest: [], creators: 0 };
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const onSkip = (id, why, info) => {
  const key = why.replace(/\(text chunks: .*\)/, '(text chunks)'); bump(R.skipped, key);
  (R.skippedExamples[key] = R.skippedExamples[key] || []).length < 25 && R.skippedExamples[key].push(id);
  if (info && info.keys) for (const k of new Set(info.keys)) bump(R.pngKeys, k);
};
const onFile = (id, k) => { bump(R.files, k); if (k === 'ignored') bump(R.ignoredExt, (id.match(/\.[^./]+$/) || ['(none)'])[0].toLowerCase()); };
const seen = new Map(), sims = [], BANDS = [new Map(), new Map(), new Map(), new Map()];
let t0 = Date.now(), last = t0;
for (const c of readCards(SRC, { onSkip, onFile })) {
  if (R.cards >= LIMIT) break;
  R.cards++;
  if (AUTHOR_DIR && !c.creator) { const parts = c.id.split('/'); if (parts.length > AUTHOR_DIR) c.creator = parts[AUTHOR_DIR - 1]; }
  const norm = normalizeText(c), th = textHash(norm), sh = simhash(norm);
  const dupOf = seen.get(th);
  if (dupOf) { R.dupes++; if (R.dupeExamples.length < 200) R.dupeExamples.push([dupOf, c.id]); if (!KEEP_DUPES) continue; }
  else seen.set(th, c.id);
  // near duplicates: any 16-bit band equal, then Hamming distance <= 3 (kept, only reported)
  if (sh && !dupOf && R.nearDupes.length < 300) {
    const cand = new Set(); for (let b = 0; b < 4; b++) { const k = sh.slice(b * 4, b * 4 + 4); const l = BANDS[b].get(k); if (l) for (const i of l) cand.add(i); }
    for (const i of cand) if (hamming(sims[i][1], sh) <= 3) { R.nearDupes.push([sims[i][0], c.id]); break; }
    const idx = sims.push([c.id, sh]) - 1; if (sims.length < 400000) for (let b = 0; b < 4; b++) { const k = sh.slice(b * 4, b * 4 + 4); const l = BANDS[b].get(k); if (l) { if (l.length < 50) l.push(idx); } else BANDS[b].set(k, [idx]); }
  }
  const cl = classify(c);
  const w = { description: words(c.description).length, first_mes: words(c.first_mes).length };
  w.total = w.description + w.first_mes + words(c.personality).length + words(c.scenario).length;
  const lb = c.lorebook ? { name: c.lorebook.name, entries: c.lorebook.entries, words: c.lorebook.words, ...(LOREBOOK ? { texts: c.lorebook.texts } : {}) } : null;
  const row = {
    id: c.id, source: NAME, container: c.container, spec: c.spec || null, name: c.name, creator: c.creator || null,
    tags: c.tags || [], tagSource: c.tagSource || (c.tags && c.tags.length ? 'card' : 'none'), nsfwFlag: c.nsfwFlag ?? null,
    bucket: cl.bucket, why: cl.why, nsfwRead: cl.read, createdAt: c.createdAt || null, fileDate: c.fileDate || null, words: w,
    description: c.description, first_mes: c.first_mes, personality: c.personality || '', scenario: c.scenario || '',
    alternate_greetings: c.alternate_greetings || [], mes_example: c.mes_example || '', creator_notes: c.creator_notes || '',
    system_prompt: c.system_prompt || '', post_history_instructions: c.post_history_instructions || '', character_version: c.character_version || '',
    lorebook: lb, textHash: th, simhash: sh, ...(dupOf ? { dupOf } : {}),
  };
  out(cl.bucket).write(JSON.stringify(row) + '\n');
  bump(R.written, cl.bucket); bump(R.why, cl.why); bump(R.containers, c.container || '?'); bump(R.specs, c.spec || '?'); bump(R.tagSources, row.tagSource); bump(R.nsfwRead, cl.read);
  if (row.creator) R.creators++;
  for (const t of new Set((c.tags || []).map(normTag))) if (t) bump(R.tags, t);
  bump(R.years, (c.createdAt || '').slice(0, 4) || (c.fileDate ? 'file ' + c.fileDate.slice(0, 4) : 'unknown'));
  R.longest.push([w.total, c.id]); if (R.longest.length > 60) { R.longest.sort((a, b) => b[0] - a[0]); R.longest.length = 20; }
  if (Date.now() - last > 10000) { last = Date.now(); console.log(`  ${R.cards} cards read (${((last - t0) / 1000).toFixed(0)} s)…`); }
}
await Promise.all(Object.values(streams).map(s => new Promise(r => s.end(r))));
for (const b of Object.keys(streams)) { const f = join(OUT, `${NAME}.${b}.jsonl`); if (existsSync(f)) unlinkSync(f); renameSync(tmpPath(b), f); }
R.longest.sort((a, b) => b[0] - a[0]); R.longest.length = Math.min(R.longest.length, 20);
R.finished = new Date().toISOString(); R.seconds = (Date.now() - t0) / 1000;
R.topTags = Object.entries(R.tags).sort((a, b) => b[1] - a[1]).slice(0, 60); delete R.tags;

// ---------------------------------------------------------------- report
const tbl = (o, head) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1]); return e.length ? `| ${head} | n |\n|---|---|\n` + e.map(([k, v]) => `| ${k} | ${v} |`).join('\n') + '\n' : '(none)\n'; };
const md = `# ${NAME}: card conversion report

Source: \`${SRC}\` (${kind}). ${R.cards} cards read in ${R.seconds.toFixed(0)} s; ${R.dupes} exact duplicates ${KEEP_DUPES ? 'kept (marked dupOf)' : 'left out'}.
Written to \`${OUT}\`.

## Files written
${tbl(Object.fromEntries(Object.entries(R.written).map(([b, n]) => [`${NAME}.${b}.jsonl`, n])), 'file')}
## Why each card went where it did
${tbl(R.why, 'reason')}
## Card formats
${tbl(R.specs, 'format')}
## Containers
${tbl(R.containers, 'container')}
## Where the tags came from
${tbl(R.tagSources, 'tag source')}
(card = the card's own tags; sidecar = a details.txt or similar next to it; flag = an is_nsfw flag only; none = no tag metadata)

## NSFW read-out of the text (js/nsfw.js word count)
${tbl(R.nsfwRead, 'level')}
## Files seen
${tbl(R.files, 'kind')}
${Object.keys(R.ignoredExt).length ? '### Ignored file types\n' + tbl(R.ignoredExt, 'extension') : ''}
## Skipped
${tbl(R.skipped, 'reason')}
${Object.entries(R.skippedExamples).map(([k, v]) => `**${k}** (first ${v.length}):\n${v.map(x => `- ${x}`).join('\n')}`).join('\n\n')}

${Object.keys(R.pngKeys).length ? '### Text chunk names in images without a readable card\n' + tbl(R.pngKeys, 'chunk key') : ''}
## Dates (card creation date, else the file's date)
${tbl(R.years, 'year')}
## Duplicates
${R.dupes} exact duplicates. ${R.dupeExamples.length ? 'First ' + Math.min(50, R.dupeExamples.length) + ' (kept / copy):\n' + R.dupeExamples.slice(0, 50).map(([a, b]) => `- ${a}  ←  ${b}`).join('\n') : ''}

Near duplicates (simhash within 3 bits; both kept): ${R.nearDupes.length}${R.nearDupes.length >= 300 ? '+' : ''}
${R.nearDupes.slice(0, 50).map(([a, b]) => `- ${a}  ~  ${b}`).join('\n')}

## Top tags
${R.topTags.map(([t, n]) => `${t} (${n})`).join(', ') || '(none)'}

## Longest cards (words: description + greeting + personality + scenario)
${R.longest.map(([n, id]) => `- ${n}: ${id}`).join('\n')}
`;
writeFileSync(join(OUT, `${NAME}.report.md`), md);
writeFileSync(join(OUT, `${NAME}.report.json`), JSON.stringify(R, null, 1));
console.log(`\n${R.cards} cards read, ${R.dupes} duplicates. Written to ${OUT}:`);
for (const [b, n] of Object.entries(R.written)) console.log(`  ${NAME}.${b}.jsonl  ${n}`);
const sk = Object.values(R.skipped).reduce((a, b) => a + b, 0);
if (sk) console.log(`  skipped ${sk} file(s) or line(s): see ${NAME}.report.md`);
