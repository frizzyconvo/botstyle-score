#!/usr/bin/env node
// probe_names.mjs - Cheap probes for the names, places and titles models reach for, by genre.
//
// Each request is a one-line ask ("20 names for tavern regulars in a fantasy roleplay, one per line") and a ~200-token
// answer, so a full round over a dozen cheap models costs cents. The report (--report) counts what several models
// produce independently and checks how often 2023 cards (mostly human) use it; candidates go to
// data/botstyle_name_candidates_probe.json for review (unscored; nothing here changes a score).
//
//   node tools/probe_names.mjs --models "a,b" [--rounds 2] [--kinds names,places,titles,groups] [--max-usd 0.3] [--max-usd-model 0.05] [--dry-run]
//   node tools/probe_names.mjs --report [--human eval/experiments/v090_sample.jsonl]
//
// Reads BASE_URL and API_KEY from .env (OpenRouter). Output: eval/ai-cards/name_probes.jsonl.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import { config } from 'dotenv';
config();
const argv = process.argv.slice(2), args = {};
for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
const OUT = 'eval/ai-cards/name_probes.jsonl';
const GENRES = {
  fantasy: { names: 'tavern regulars and townsfolk', places: 'towns, villages and taverns', titles: 'a feared sorceress or warlord', groups: 'guilds and knightly orders' },
  scifi: { names: 'starship crew members', places: 'space stations, colonies and ships', titles: 'a legendary pilot or rogue AI', groups: 'megacorporations and fleets' },
  modern: { names: 'coworkers and classmates', places: 'cafes, bars and small towns', titles: 'a ruthless CEO or campus celebrity', groups: 'companies, clubs and bands' },
  horror: { names: 'residents of a cursed small town', places: 'haunted houses, asylums and towns', titles: 'a monster or cult leader', groups: 'cults and secret societies' },
  romance: { names: 'love interests', places: 'resorts, estates and bookshops', titles: 'a brooding love interest', groups: 'families and fashion houses' },
  crime: { names: 'detectives, gangsters and informants', places: 'nightclubs, precincts and neighborhoods', titles: 'a mob boss or hitman', groups: 'gangs, crime families and agencies' },
  historical: { names: 'courtiers, soldiers and servants', places: 'manors, castles and ports', titles: 'a scheming noble or war hero', groups: 'noble houses and regiments' },
};
const ASK = {
  names: (g, x) => `Give me 20 names (first and last) for ${x} in a ${g} roleplay. One per line, names only, no commentary.`,
  places: (g, x) => `Give me 15 names for ${x} in a ${g} roleplay setting. One per line, names only.`,
  titles: (g, x) => `Give me 15 epithets or titles for ${x} in a ${g} roleplay (like "the Iron Queen"). One per line, no commentary.`,
  groups: (g, x) => `Give me 15 names for ${x} in a ${g} roleplay setting. One per line, names only.`,
};
const clean = t => String(t || '').split('\n').map(l => l.replace(/^\s*(?:[-*•]|\d{1,2}[.)])\s*/, '').replace(/\*\*/g, '').replace(/\s+[-–—:(].*$/, '').trim()).filter(l => l && l.length <= 60 && !/[.?!:]$/.test(l) && !/^(?:here|sure|certainly)\b/i.test(l));

if (args.report) {
  const rows = existsSync(OUT) ? readFileSync(OUT, 'utf-8').split('\n').filter(Boolean).map(JSON.parse) : [];
  if (!rows.length) { console.log(`No probes yet (${OUT}).`); process.exit(0); }
  // human side: how many 2023 cards (mostly human) mention each candidate word (case-sensitive token)
  const HUMAN = args.human || 'eval/experiments/v090_sample.jsonl';
  const docs = existsSync(HUMAN) ? readFileSync(HUMAN, 'utf-8').split('\n').filter(Boolean).map(JSON.parse).filter(r => r.set === 'human') : [];
  const df = new Map(); for (const d of docs) for (const w of new Set(((d.description || '') + ' ' + (d.first_mes || '')).match(/\b[A-Z][a-z]{2,}\b/g) || [])) df.set(w, (df.get(w) || 0) + 1);
  const out = {};
  for (const kind of ['names', 'places', 'titles', 'groups']) {
    const tok = new Map();   // word -> { models:Set, count, genres:Set }
    for (const r of rows.filter(x => x.kind === kind)) for (const it of r.items) for (const w of (kind === 'titles' ? [it.toLowerCase()] : it.match(/\b[A-Z][a-z]{2,}\b/g) || [])) {
      const t = tok.get(w) || { models: new Set(), count: 0, genres: new Set() }; t.models.add(r.model); t.genres.add(r.genre); t.count++; tok.set(w, t);
    }
    const nModels = new Set(rows.map(r => r.model)).size;
    out[kind] = [...tok.entries()].filter(([, t]) => t.models.size >= Math.max(3, Math.ceil(nModels / 4)))
      .map(([w, t]) => ({ item: w, models: t.models.size, count: t.count, genres: [...t.genres], humanDocShare: docs.length && kind !== 'titles' ? +(100 * (df.get(w) || 0) / docs.length).toFixed(3) : null }))
      .filter(x => x.humanDocShare === null || x.humanDocShare < 0.4).sort((a, b) => b.models - a.models || b.count - a.count).slice(0, 150);
    console.log(`\n${kind}: ${out[kind].length} candidates; top: ` + out[kind].slice(0, 25).map(x => `${x.item} (${x.models} models${x.humanDocShare !== null ? `, ${x.humanDocShare}% of human cards` : ''})`).join(', '));
  }
  writeFileSync('data/botstyle_name_candidates_probe.json', JSON.stringify({ about: 'Names, places, titles and group names several models produce when asked (tools/probe_names.mjs), rare in 2023 cards (mostly human). Candidates for review, not scored.', built: new Date().toISOString().slice(0, 10), probes: rows.length, models: [...new Set(rows.map(r => r.model))], ...out }, null, 1) + '\n');
  console.log('\n-> data/botstyle_name_candidates_probe.json'); process.exit(0);
}
const models = String(args.models || '').split(',').map(s => s.trim()).filter(Boolean);
if (!models.length) { console.error('need --models "a,b" (or --report)'); process.exit(1); }
const kinds = String(args.kinds || 'names,places,titles,groups').split(','), ROUNDS = +(args.rounds || 2), MAX_USD = +(args['max-usd'] || 0.3), MAX_MODEL = +(args['max-usd-model'] || 0.05);
const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l).id) : []);
const jobs = [];
for (const m of models) for (let k = 1; k <= ROUNDS; k++) for (const [g, x] of Object.entries(GENRES)) for (const kind of kinds) { const id = [m, kind, g, k].join('|'); if (!done.has(id)) jobs.push({ id, model: m, kind, genre: g, k, prompt: ASK[kind](g === 'scifi' ? 'sci-fi' : g, x[kind]) }); }
console.log(`${jobs.length} probes (${models.length} models × ${ROUNDS} rounds × ${Object.keys(GENRES).length} genres × ${kinds.length} kinds, minus ${done.size} done); caps $${MAX_USD} total, $${MAX_MODEL} per model`);
if (args['dry-run']) { console.log(jobs[0] && jobs[0].prompt); process.exit(0); }
let url = process.env.BASE_URL || 'https://openrouter.ai/api'; if (!/chat\/completions$/.test(url)) url = url.replace(/\/$/, '') + (/\/v1$/.test(url) ? '' : '/v1') + '/chat/completions';
const KEY = process.env.API_KEY || process.env.OPENAI_API_KEY; if (!KEY) { console.error('API_KEY missing (.env)'); process.exit(1); }
let spent = 0; const by = {}, errs = {};
async function worker() {
  while (jobs.length) {
    const j = jobs.shift();
    if (spent >= MAX_USD) { jobs.length = 0; console.log('stopping: --max-usd reached'); break; }
    if ((by[j.model] || 0) >= MAX_MODEL || (errs[j.model] || 0) >= 3) continue;
    try {
      const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: j.model, temperature: 0.8, max_tokens: 600, usage: { include: true }, messages: [{ role: 'user', content: j.prompt }] }) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json(), raw = d.choices?.[0]?.message?.content || '', cost = d.usage?.cost || 0;
      spent += cost; by[j.model] = (by[j.model] || 0) + cost; errs[j.model] = 0;
      appendFileSync(OUT, JSON.stringify({ id: j.id, model: j.model, kind: j.kind, genre: j.genre, k: j.k, items: clean(raw), raw, cost, at: new Date().toISOString() }) + '\n');
    } catch (e) { errs[j.model] = (errs[j.model] || 0) + 1; console.error(`  ERR ${j.id}: ${e.message}`); }
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`done; reported cost $${spent.toFixed(4)}: ` + Object.entries(by).map(([m, c]) => `${m} $${c.toFixed(4)}`).join(', '));
