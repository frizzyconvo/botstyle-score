// Tests for tools/v1/dedupe.mjs (pure core: no datasets read).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeParts, priorityOf } from '../../tools/v1/dedupe.mjs';

// 200 distinct words, so simhash sees a real text
const words = n => Array.from({ length: n }, (_, i) => `w${(i * 7919) % 1000}x${i % 13}`).join(' ');
const P = (source, era, text, id = `${source}:${era}:${text.length}`, part = 'description') => ({ id, source, era, part, text });

test('priority: provenance > real_ai > pre-chatgpt > 2023 > 2024+ > generated', () => {
  const order = [P('provenance', '2024+', 'a'), P('creator_statements', '2024+', 'a'), P('characterhub_com', 'pre-chatgpt', 'a'),
    P('chub_mega', '2023', 'a'), P('raincandy', '2024+', 'a'), P('generated_v2', 'generated', 'a')].map(priorityOf);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.equal(new Set(order).size, order.length);
});

test('exact copy in two sources: the higher-priority one is kept, the other dropped as exact', () => {
  const t = words(200);
  const a = P('jaicards', '2024+', t, 'jaicards:1:description'), b = P('provenance', '2024+', t, 'provenance:x:description');
  const { keep, dropped } = dedupeParts([a, b]);   // input order must not matter
  assert.equal(keep[b.id], true); assert.ok(!keep[a.id]);
  assert.deepEqual(dropped, [{ id: a.id, duplicateOf: b.id, kind: 'exact' }]);
});

test('a one-word edit of a 200-word text is a near copy', () => {
  const t = words(200), edited = t.replace(/^\S+/, 'changed');
  const { keep, dropped } = dedupeParts([P('chub_mega', '2023', t, 'chub_mega:1:description'), P('raincandy', '2024+', edited, 'raincandy:2:description')]);
  assert.equal(keep['chub_mega:1:description'], true);
  assert.deepEqual(dropped, [{ id: 'raincandy:2:description', duplicateOf: 'chub_mega:1:description', kind: 'near' }]);
});

test('near copies need 60+ words; short texts only match exactly', () => {
  const t = words(40), edited = t.replace(/^\S+/, 'changed');
  const { dropped } = dedupeParts([P('chub_mega', '2023', t, 'a:1:description'), P('raincandy', '2024+', edited, 'b:2:description')]);
  assert.equal(dropped.length, 0);
});

test('descriptions and greetings are deduped separately', () => {
  const t = words(200);
  const { dropped } = dedupeParts([P('chub_mega', '2023', t, 'a:1:description'), P('raincandy', '2024+', t, 'b:2:greeting', 'greeting')]);
  assert.equal(dropped.length, 0);
});

test('unrelated texts are all kept', () => {
  const { keep, dropped } = dedupeParts([P('chub_mega', '2023', words(200), 'a:1:description'), P('raincandy', '2024+', words(300).split(' ').reverse().join(' '), 'b:2:description')]);
  assert.equal(dropped.length, 0); assert.equal(Object.keys(keep).length, 2);
});

test('isKept reads the keep map of the file it is given', async () => {
  const { isKept } = await import('../../tools/v1/dedupe.mjs');
  const { writeFileSync, mkdtempSync } = await import('node:fs'); const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const d = mkdtempSync(join(tmpdir(), 'dedupe-'));
  const f1 = join(d, 'a.json'), f2 = join(d, 'b.json');
  writeFileSync(f1, JSON.stringify({ keep: { 'x:1:description': true }, dropped: [] }));
  writeFileSync(f2, JSON.stringify({ keep: { 'y:2:greeting': true }, dropped: [] }));
  assert.equal(isKept('x:1:description', f1), true);
  assert.equal(isKept('y:2:greeting', f1), false);
  assert.equal(isKept('y:2:greeting', f2), true);
  assert.throws(() => isKept('x', join(d, 'missing.json')), /run tools\/v1\/dedupe\.mjs/);
});
