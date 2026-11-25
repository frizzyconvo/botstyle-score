// Tests for tools/v1/sample_reads.mjs (pure parts: synthetic pools, temp folders).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { lengthBand, rng, allocate, drawTestSet, drawRound, writePackets, lockTestSet } from '../../tools/v1/sample_reads.mjs';

const BANDS = ['<150', '150-499', '500-999', '1000+'];
// synthetic pool: real-world sources (scraped, real-world AI), generated cards, SPB
function pool() {
  const out = []; let n = 0;
  const add = (source, kind, era, extra = {}) => { for (const part of ['description', 'greeting']) for (const band of BANDS) for (let i = 0; i < 30; i++)
    out.push({ id: `${source}:c${n++}:${part}`, source, kind, era, part, band, creator: `maker_${source}`, ...extra }); };
  add('scraped_a', 'scraped', '2023'); add('scraped_b', 'scraped', '2024+'); add('scraped_c', 'scraped', 'pre-chatgpt');
  add('realai_a', 'real_ai', '2024+'); add('prov', 'provenance', 'unknown');
  add('gen_x', 'generated', 'generated', { model: 'vendor/model-x', requestStyle: 'lists' });
  add('spb_ai', 'generated', 'generated', { excluded: true });
  return out;
}

test('length bands', () => {
  assert.deepEqual([0, 149, 150, 499, 500, 999, 1000, 5000].map(lengthBand), ['<150', '<150', '150-499', '150-499', '500-999', '500-999', '1000+', '1000+']);
});

test('allocate spreads picks evenly over strata and stops at the total', () => {
  const strata = new Map([['a', [1, 2, 3, 4, 5, 6]], ['b', [7, 8]], ['c', [9, 10, 11, 12]]]);
  const got = allocate(strata, 7, rng(1));
  assert.equal(got.length, 7);
  const a = got.filter(x => x <= 6).length, b = got.filter(x => x === 7 || x === 8).length, c = got.filter(x => x >= 9).length;
  assert.equal(b, 2); assert.ok(Math.abs(a - c) <= 1 && a + c === 5, `a ${a} c ${c}`);
});

test('the test set holds no generated or SPB parts', () => {
  const ts = drawTestSet(pool(), 100, rng(7));
  assert.equal(ts.length, 100);
  assert.ok(ts.every(p => !['generated'].includes(p.kind) && p.source !== 'spb_ai'));
  assert.ok(new Set(ts.map(p => p.source)).size >= 5, 'stratified over sources');
});

test('no part is in both the test set and a round', () => {
  const P = pool(), ts = drawTestSet(P, 200, rng(7)), locked = new Set(ts.map(p => p.id));
  const r = drawRound(P, { real: 600, generated: 100, humanLikelyPerCell: 50 }, rng(8), locked);
  assert.ok(r.length > 600);
  assert.ok(!r.some(p => locked.has(p.id)));
  assert.ok(!r.some(p => p.source === 'spb_ai'));
  assert.equal(r.filter(p => p.kind === 'generated').length, 100);
});

test('packets carry only P headers and text: no source, creator, era or model', () => {
  const P = pool(), r = drawRound(P, { real: 80, generated: 20, humanLikelyPerCell: 5 }, rng(3), new Set());
  const texts = new Map(r.map((p, i) => [p.id, `Some neutral card text number ${i}.`]));
  const dir = mkdtempSync(join(tmpdir(), 'packets-'));
  const key = writePackets(dir, r, texts, rng(4), 35);
  const files = readdirSync(dir).filter(f => /^cards_\d+\.md$/.test(f));
  assert.equal(files.length, Math.ceil(r.length / 35));
  const md = files.map(f => readFileSync(join(dir, f), 'utf-8')).join('\n');
  const leaks = new Set(['source', 'generated', ...r.flatMap(p => [p.source, p.creator, p.era, p.kind, p.model].filter(Boolean))]);
  for (const s of leaks) assert.ok(!md.toLowerCase().includes(String(s).toLowerCase()), `packet leaks "${s}"`);
  assert.equal((md.match(/^## P\d+$/gm) || []).length, r.length);
  assert.equal(Object.keys(key).length, r.length);
  const k = JSON.parse(readFileSync(join(dir, 'key.json'), 'utf-8'));
  assert.deepEqual(Object.keys(Object.values(k)[0]).sort(), ['era', 'id', 'lengthBand', 'part', 'source']);
});

test('the test set is locked: a second run without --relock leaves the file byte-identical', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'lock-')), 'test_set.json');
  lockTestSet(f, pool(), { n: 50, seed: 1 });
  const first = readFileSync(f, 'utf-8');
  lockTestSet(f, pool().reverse(), { n: 60, seed: 2 });
  assert.equal(readFileSync(f, 'utf-8'), first);
  lockTestSet(f, pool(), { n: 60, seed: 2, relock: true });
  assert.notEqual(readFileSync(f, 'utf-8'), first);
  assert.ok(JSON.parse(readFileSync(f, 'utf-8')).every(x => Object.keys(x).sort().join() === 'id,part'));
});
