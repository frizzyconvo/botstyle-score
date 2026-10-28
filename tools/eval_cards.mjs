#!/usr/bin/env node
// eval_cards.mjs - Compare ways of scoring a card on human vs AI-written cards.
//
//   node tools/eval_cards.mjs --build-sample [--every 32]   # 1. fixed sample -> eval/experiments/eval_sample.jsonl
//   node tools/eval_cards.mjs --shard 1/4                   # 2. score shard 1 of 4 -> eval/experiments/eval_parts/1.jsonl
//   node tools/eval_cards.mjs --report                      # 3. compare variants -> eval/experiments/eval_cards.json
//
// Each card is scored with the current scorer: the joint score (description + first message) and the
// two parts on their own. The report compares the joint score with 'mixed -> higher part' rules at
// several gaps and minimum part lengths (AUC, share of human / AI cards at 35+ and 50+), shows how
// often cards count as mixed, and prints score quantiles for setting band cut-offs.
// Human: Korshuk, Chub before Jul 2023, JanitorAI before Mar 2024 (1 in --every). AI: SPB personas and
// our generated cards (in-sample for the UnslopNemo phrases, which were picked on them). Cards whose
// joint score is low-confidence or non-English are left out, as in the published numbers.
// Card folder: ../card-datasets or BOTSTYLE_CARDS. Shards keep each run short (about 2 minutes).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { PATHS, EVAL } from './_paths.mjs';
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, mkdirSync, readdirSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(ROOT);
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SAMPLE = args.includes('--build-sample') ? join(EVAL, 'experiments', 'eval_sample.jsonl') : PATHS.sample, PARTS = PATHS.parts;
const t0 = Date.now(), stamp = () => `[${((Date.now() - t0) / 1000).toFixed(0)}s]`;
function* jsonl(p) { if (!existsSync(p)) { console.log(`  missing ${p}`); return; } const fd = openSync(p, 'r'), buf = Buffer.alloc(4 << 20); let rest = '', n;
  try { while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) { const ls = (rest + buf.toString('utf-8', 0, n)).split('\n'); rest = ls.pop(); for (const l of ls) if (l.trim()) yield JSON.parse(l); } if (rest.trim()) yield JSON.parse(rest); } finally { closeSync(fd); } }

if (args.includes('--build-sample')) {
  const EVERY = +opt('--every', 32), created = r => String(r.createdAt || r.created_at || '');
  const rows = [], card = (set, src, r) => rows.push({ set, src, description: r.description || r.persona_text || '', personality: r.personality || '', scenario: r.scenario || '', first_mes: r.first_mes || '' });
  for (const r of jsonl(join(CARDS, 'korshuk-roleplay-characters', 'korshuk_cards.jsonl'))) card('human', 'korshuk', r);
  for (const r of jsonl(join(CARDS, 'raincandy-chub-ai-cards', 'raincandy_cards.jsonl'))) { const c = created(r); if (c && c < '2023-07') card('human', 'chub_2023', r); }
  let i = 0; for (const r of jsonl(join(CARDS, 'jaicards-cards-js', 'jaicards_cards.jsonl'))) if (created(r) < '2024-03' && i++ % EVERY === 0) card('human', 'janitorai', r);
  for (const r of jsonl(join(CARDS, 'spb-2602-ai-personas', 'data.jsonl'))) card('ai', 'spb', r);
  let bad = new Set(); try { bad = new Set(JSON.parse(readFileSync(PATHS.aiCardsV1Invalid, 'utf-8'))); } catch { /* none */ }
  for (const r of jsonl(PATHS.aiCardsV1)) if (!bad.has(r.id)) card('ai', 'generated', r);
  for (const r of jsonl(PATHS.aiCardsV2)) if (r.valid !== false && (r.description || r.first_mes)) card('ai', 'generated', r);
  mkdirSync(join(SAMPLE, '..'), { recursive: true }); writeFileSync(SAMPLE, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log(`${stamp()} ${rows.filter(r => r.set === 'human').length} human, ${rows.filter(r => r.set === 'ai').length} AI cards -> ${SAMPLE}`);
  process.exit(0);
}

if (opt('--shard')) {
  const [k, n] = opt('--shard').split('/').map(Number);
  const { loadAll, scoreCard } = await import('../js/score-card.js');
  const { setPosTagger } = await import('../js/pos-tagger.js');
  const { DISABLED_STRUCTURES } = await import('../js/ai-structures.js');
  globalThis.fetch = async u => ({ ok: true, json: async () => JSON.parse(readFileSync(join(ROOT, String(u).replace(/^\.\//, '')), 'utf-8')) });
  await loadAll('./data/'); setPosTagger(createRequire(import.meta.url)('wink-pos-tagger')());
  mkdirSync(PARTS, { recursive: true }); const out = join(PARTS, `${k}.jsonl`); writeFileSync(out, '');
  const S = r => ({ s: +r.score.toFixed(2), w: r.stats.proseWords, rel: !!r.reliable, ne: !!r.stats.nonEnglish });
  let i = -1, m = 0, buf = [];
  for (const c of jsonl(SAMPLE)) {
    if (++i % n !== k - 1) continue;
    const r = scoreCard(c);
    const row = { set: c.set, src: c.src, df: S(r), d: r.parts.description, g: r.parts.greeting, rep: { d: r.repetition.description.per1k, g: r.repetition.greeting.per1k, between: r.repetition.between.per1k }, rates: r.rates, emdash: r.emdashPoints, art: r.artifactPoints };
    buf.push(JSON.stringify(row)); m++;
    if (buf.length >= 200) { appendFileSync(out, buf.join('\n') + '\n'); buf = []; }
  }
  if (buf.length) appendFileSync(out, buf.join('\n') + '\n');
  DISABLED_STRUCTURES.add('rp_reply_tells');
  console.log(`${stamp()} shard ${k}/${n}: ${m} cards -> ${out}`);
  process.exit(0);
}

if (args.includes('--report')) {
  const rows = readdirSync(PARTS).filter(f => f.endsWith('.jsonl')).flatMap(f => readFileSync(join(PARTS, f), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
  const auc = (pos, neg) => { const all = pos.map(v => [v, 1]).concat(neg.map(v => [v, 0])).sort((a, b) => a[0] - b[0]); let k = 0, sum = 0;
    while (k < all.length) { let j = k; while (j < all.length && all[j][0] === all[k][0]) j++; const avg = (k + j + 1) / 2; for (let t = k; t < j; t++) if (all[t][1]) sum += avg; k = j; }
    return (sum - pos.length * (pos.length + 1) / 2) / (pos.length * neg.length); };
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(1) : null; };
  const pct = (a, f) => +(100 * a.filter(f).length / Math.max(1, a.length)).toFixed(1);
  const ok = (p, mw) => p && p.proseWords >= mw;
  const mixedHigher = (gap, mw) => r => (ok(r.d, mw) && ok(r.g, mw) && Math.abs(r.d.score - r.g.score) >= gap) ? Math.max(r.df.s, r.d.score, r.g.score) : r.df.s;
  const V = { 'joint D+F': r => r.df.s };
  for (const gap of [15, 20, 25, 30]) for (const mw of [80, 150]) V[`mixed->higher gap ${gap} min ${mw}w`] = mixedHigher(gap, mw);
  const keep = rows.filter(r => r.df && r.df.rel && !r.df.ne);
  const H = keep.filter(r => r.set === 'human'), A = keep.filter(r => r.set === 'ai');
  console.log(`${keep.length} reliable English cards (${H.length} human, ${A.length} AI) of ${rows.length}`);
  const mixedShare = (set, gap, mw) => (100 * set.filter(r => ok(r.d, mw) && ok(r.g, mw) && Math.abs(r.d.score - r.g.score) >= gap).length / set.length).toFixed(1);
  console.log(`mixed (gap 20, 80w): human ${mixedShare(H, 20, 80)}%, AI ${mixedShare(A, 20, 80)}%`);
  const qs = a => [.5, .75, .9, .95, .98, .99].map(p => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); }).join(' / ');
  console.log('joint quantiles p50/p75/p90/p95/p98/p99  human:', qs(H.map(r => r.df.s)), '  AI:', qs(A.map(r => r.df.s)));
  const aq = a => [.1, .25, .5, .75, .9].map(p => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); }).join(' / ');
  console.log('AI p10/p25/p50/p75/p90:', aq(A.map(r => r.df.s)));
  const res = [];
  for (const [name, f] of Object.entries(V)) {
    const hs = H.map(f), as = A.map(f), sp = A.filter(r => r.src === 'spb').map(f), ge = A.filter(r => r.src === 'generated').map(f);
    const x = { name, auc: +auc(as, hs).toFixed(3), auc_spb: +auc(sp, hs).toFixed(3), auc_generated: +auc(ge, hs).toFixed(3), human_med: med(hs), ai_med: med(as),
      human_35: pct(hs, v => v >= 35), human_50: pct(hs, v => v >= 50), ai_35: pct(as, v => v >= 35), ai_50: pct(as, v => v >= 50),
      // spread: AI cards' interquartile range; "crunched" scores have a narrow one
      ai_p25: med(as.filter(v => v <= med(as))), ai_p75: med(as.filter(v => v >= med(as))) };
    res.push(x);
    console.log(`${name.padEnd(30)} AUC ${x.auc} (SPB ${x.auc_spb}, gen ${x.auc_generated})  human med ${x.human_med} 35+ ${x.human_35}% 50+ ${x.human_50}%  AI med ${x.ai_med} [${x.ai_p25}–${x.ai_p75}] 35+ ${x.ai_35}% 50+ ${x.ai_50}%`);
  }
  mkdirSync(join(PATHS.evalCardsReport, '..'), { recursive: true }); writeFileSync(PATHS.evalCardsReport, JSON.stringify({ built: new Date().toISOString(), n_human: H.length, n_ai: A.length, variants: res }, null, 1));
  process.exit(0);
}
console.log('Nothing to do. See --help.');
