#!/usr/bin/env node
// score_url.mjs - Score a card from its Chub/Botbooru link (server-side, so no CORS issues),
// or from local card files (.json / .png), several at once.
// Usage: node tools/score_url.mjs <url | card.json | card.png>... [--alt all|2,5,6] [--fields description,first_mes] [--json]
//   --fields   score only these card fields (e.g. description,first_mes to compare with scores that
//              ignored personality/scenario); default: description, personality, scenario, first message
//   --alt all     include every alternate greeting; --alt 2,5 picks greetings by number
//                 (#1 is the first message, alternates are #2, #3, … as on the page)
//   --json        print the full result object instead of a summary
// Botbooru needs CARD_SOURCES.botbooru.api set in js/card-fetch.js.
import { readFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import { loadAll, scoreCard } from '../js/score-card.js';
import { fetchCard } from '../js/card-fetch.js';
import { parseCardText, parseCardPng } from '../js/card-import.js';
import { setPosTagger } from '../js/pos-tagger.js';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const netFetch = globalThis.fetch;
// local data files are read from disk; everything else goes to the network
globalThis.fetch = async (url, o) => /^\.\//.test(url)
  ? { ok: true, json: async () => JSON.parse(readFileSync(new URL(url.replace(/^\.\//, ''), root), 'utf-8')) }
  : netFetch(url, o);
await loadAll('./data/'); setPosTagger(require('wink-pos-tagger')());

const args = process.argv.slice(2);
const altArg = args.includes('--alt') ? args[args.indexOf('--alt') + 1] : null;
const fieldsArg = args.includes('--fields') ? args[args.indexOf('--fields') + 1].split(',') : null;
const inputs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--alt' && args[i - 1] !== '--fields');
if (!inputs.length) { console.error('usage: node tools/score_url.mjs <url | card.json | card.png>... [--alt all|2,5] [--json]'); process.exit(2); }

async function load(src) {
  if (/^https?:/.test(src)) return (await fetchCard(src, { fetch: netFetch })).card;
  if (!existsSync(src)) throw new Error('not a link or a file: ' + src);
  const buf = readFileSync(src);
  const parsed = /\.png$/i.test(src) ? parseCardPng(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) : parseCardText(buf.toString('utf-8'));
  if (!parsed) throw new Error('no card data in ' + src);
  return { name: src.split(/[\\/]/).pop(), ...parsed.card, ...(parsed.card.name ? { name: parsed.card.name } : {}) };
}

for (const src of inputs) {
  let card;
  try { card = await load(src); } catch (e) { console.error(`${src}: ${e.message}`); continue; }
  const alts = card.alternate_greetings || [];
  const picked = !altArg ? [] : altArg === 'all' ? alts : altArg.split(',').map(n => alts[+n - 2]).filter(Boolean);
  if (fieldsArg) for (const f of ['description', 'personality', 'scenario', 'first_mes']) if (!fieldsArg.includes(f)) card[f] = '';
  const r = scoreCard({ ...card, alternate_greetings: picked }, { includeAltGreetings: picked.length > 0 });
  if (args.includes('--json')) { console.log(JSON.stringify({ source: src, ...r, prose: undefined, text: undefined }, null, 1)); continue; }
  console.log(`${card.name}: botstyle ${r.score.toFixed(1)} (${r.low.toFixed(0)}–${r.high.toFixed(0)}), ${r.band.label} writing style`);
  console.log(`  words ${r.components.words.toFixed(2)}  phrases ${r.components.phrases.toFixed(2)}  structures ${r.components.structures.toFixed(2)}  em-dash +${r.emdashPoints.toFixed(1)}  tells +${r.artifactPoints}`);
  console.log(`  ${r.stats.proseWords} prose words; format: ${r.format.label}; greetings scored: 1 + ${picked.length} of ${alts.length} alternates`);
  if (r.reference) console.log('  ' + Object.values(r.reference).map(g => `higher than ${Math.round(g.percentile)}% of ${g.label}`).join('; '));
  if (r.experimental && r.experimental.aiStyleLikelihood !== null) console.log(`  texture: paragraph CV ${r.texture.paraCv.toFixed(2)}, AI-style likelihood ${Math.round(r.experimental.aiStyleLikelihood * 100)}% (experimental)`);
  if (r.tags.length) console.log('  tags: ' + r.tags.map(t => `${t.label} (${t.detail})`).join('; '));
  if (r.names.length) console.log('  AI-favourite names: ' + r.names.map(n => n.item).join(', '));
}
