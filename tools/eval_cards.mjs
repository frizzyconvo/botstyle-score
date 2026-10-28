#!/usr/bin/env node
// eval_cards.mjs - Compare ways of scoring a card on human vs AI-written cards.
//
//   node tools/eval_cards.mjs --build-sample [--every 32]   # 1. fixed sample -> eval/eval_sample.jsonl
//   node tools/eval_cards.mjs --shard 1/4                   # 2. score shard 1 of 4 -> eval/eval_parts/1.jsonl
//   node tools/eval_cards.mjs --report                      # 3. compare variants -> eval/eval_cards.json
//
// Each card is scored as one text (description + first message, and description + personality +
// scenario + first message as scorer 0.5.0 did), and as separate parts (description alone, first
// message alone), with and without the provisional rp_reply_tells pattern. The report then compares:
// joint text, the mean of the parts, a capped-weight mean (each part counts up to 400 prose words)
// and the higher part, on AUC and the share of human / AI cards at 35+ and 50+.
// Human: Korshuk, Chub before Jul 2023, JanitorAI before Mar 2024 (1 in --every). AI: SPB personas and
// our generated cards (in-sample for the UnslopNemo phrases, which were picked on them). Cards whose
// joint score is low-confidence or non-English are left out, as in the published numbers.
// Card folder: ../card-datasets or BOTSTYLE_CARDS. Shards keep each run short (about 2 minutes).
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, mkdirSync, readdirSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(ROOT);
const CARDS = process.env.BOTSTYLE_CARDS ? resolve(process.env.BOTSTYLE_CARDS) : resolve(ROOT, '..', 'card-datasets');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SAMPLE = join(ROOT, 'eval', 'eval_sample.jsonl'), PARTS = join(ROOT, 'eval', 'eval_parts');
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
  let bad = new Set(); try { bad = new Set(JSON.parse(readFileSync(join(ROOT, 'eval', 'ai_cards_invalid_ids.json'), 'utf-8'))); } catch { /* none */ }
  for (const r of jsonl(join(ROOT, 'eval', 'ai_cards.jsonl'))) if (!bad.has(r.id)) card('ai', 'generated', r);
  for (const r of jsonl(join(ROOT, 'eval', 'ai_cards_v2.jsonl'))) if (r.valid !== false && (r.description || r.first_mes)) card('ai', 'generated', r);
  writeFileSync(SAMPLE, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
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
    const row = { set: c.set, src: c.src };
    for (const rp of [false, true]) {
      rp ? DISABLED_STRUCTURES.delete('rp_reply_tells') : DISABLED_STRUCTURES.add('rp_reply_tells');
      const sfx = rp ? '_rp' : '';
      row['df' + sfx] = S(scoreCard(c));
      row['d' + sfx] = c.description ? S(scoreCard({ description: c.description })) : null;
      row['g' + sfx] = c.first_mes ? S(scoreCard({ description: c.first_mes })) : null;
      if (!rp) row.dpsf = S(scoreCard(c, { fields: ['description', 'personality', 'scenario', 'first_mes'] }));
    }
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
  const MINW = 60;   // a part needs this many prose words to count on its own
  const parts = (r, sfx) => [r['d' + sfx], r['g' + sfx]].filter(p => p && !p.ne && p.w >= MINW);
  const V = {
    'joint D+P+S+F (0.5.0)': r => r.dpsf.s,
    'joint D+F': r => r.df.s,
    'joint D+F +rp': r => r.df_rp.s,
    'parts mean': r => { const p = parts(r, ''); return p.length ? p.reduce((a, x) => a + x.s, 0) / p.length : r.df.s; },
    'parts mean +rp': r => { const p = parts(r, '_rp'); return p.length ? p.reduce((a, x) => a + x.s, 0) / p.length : r.df_rp.s; },
    'parts capped-weight (400w)': r => { const p = parts(r, ''); if (!p.length) return r.df.s; const w = p.map(x => Math.min(400, x.w)); return p.reduce((a, x, i) => a + x.s * w[i], 0) / w.reduce((a, b) => a + b, 0); },
    'parts capped-weight +rp': r => { const p = parts(r, '_rp'); if (!p.length) return r.df_rp.s; const w = p.map(x => Math.min(400, x.w)); return p.reduce((a, x, i) => a + x.s * w[i], 0) / w.reduce((a, b) => a + b, 0); },
    'higher part': r => { const p = parts(r, ''); return p.length ? Math.max(...p.map(x => x.s)) : r.df.s; },
  };
  const keep = rows.filter(r => r.df && r.df.rel && !r.df.ne);
  const H = keep.filter(r => r.set === 'human'), A = keep.filter(r => r.set === 'ai');
  console.log(`${keep.length} reliable English cards (${H.length} human, ${A.length} AI) of ${rows.length}`);
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
  writeFileSync(join(ROOT, 'eval', 'eval_cards.json'), JSON.stringify({ built: new Date().toISOString(), n_human: H.length, n_ai: A.length, variants: res }, null, 1));
  process.exit(0);
}
console.log('Nothing to do. See --help.');
