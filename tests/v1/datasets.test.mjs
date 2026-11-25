// Tests for tools/v1/datasets.mjs. The part-reader tests read the local card datasets (../card-datasets, eval/ai-cards).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, eraOf, readParts } from '../../tools/v1/datasets.mjs';

const collect = async (id, opts) => { const out = []; for await (const p of readParts(id, opts)) out.push(p); return out; };

test('era boundaries', () => {
  assert.equal(eraOf('2022-11-30T00:00:00Z', 'scraped'), 'pre-chatgpt');
  assert.equal(eraOf('2022-12-01T00:00:00Z', 'scraped'), '2023');
  assert.equal(eraOf('2023-12-31T23:59:59Z', 'scraped'), '2023');
  assert.equal(eraOf('2024-01-01T00:00:00Z', 'scraped'), '2024+');
  assert.equal(eraOf(null, 'scraped'), 'unknown');
  assert.equal(eraOf('not a date', 'scraped'), 'unknown');
  assert.equal(eraOf('2025-05-01', 'generated'), 'generated');
});

test('spb is excluded', () => assert.equal(SOURCES.spb_ai.excluded, true));
test('characterhub is description-only', () => assert.deepEqual(SOURCES.characterhub_com.partsAllowed, ['description']));
test('every source has a known kind and parts', () => {
  for (const [id, s] of Object.entries(SOURCES)) {
    assert.ok(['scraped', 'real_ai', 'provenance', 'generated', 'reference'].includes(s.kind), id);
    assert.ok(s.partsAllowed.length && s.partsAllowed.every(p => p === 'description' || p === 'greeting'), id);
    assert.ok(!/^[A-Za-z]:|^\//.test(s.path), `${id}: path must be relative`);
  }
});
test('unknown source throws', async () => { await assert.rejects(collect('no_such_source')); });

test('chub mega placeholder stubs are skipped', async () => {
  const parts = await collect('chub_mega');
  const cards = new Set(parts.map(p => p.id.replace(/:(description|greeting)$/, '')));
  assert.ok(cards.size >= 6900 && cards.size <= 7100, `cards ${cards.size}`);   // ~7,023 real cards
  assert.ok(parts.length >= 12000 && parts.length <= 14100, `parts ${parts.length}`);
  assert.ok(!parts.some(p => p.id.includes('chubData.json#100088')));
  assert.ok(parts.every(p => p.text.trim()), 'no empty parts');
  assert.ok(parts.every(p => p.era === '2023'), 'archive file dates place the collection in 2023');
});

test('part shape: description joins description, personality, scenario; greeting is first_mes', async () => {
  const parts = await collect('korshuk', { limit: 2 });
  const [d, g] = parts;
  assert.equal(d.part, 'description'); assert.equal(g.part, 'greeting');
  assert.ok(d.text.startsWith('Pyromaniac') && d.text.includes('\n\nGenetically enhanced hybrid'));
  assert.ok(!d.text.includes('Ya win some'), 'example dialogue excluded');
  assert.equal(d.source, 'korshuk'); assert.equal(d.provenance, 'unknown'); assert.equal(d.era, '2023');
  for (const k of ['id', 'source', 'creator', 'createdAt', 'era', 'provenance', 'labelSource', 'part', 'text']) assert.ok(k in d, k);
});

test('limit caps the number of parts', async () => assert.equal((await collect('raincandy', { limit: 5 })).length, 5));

test('generated cards carry model and request style', async () => {
  const [p] = await collect('generated_holdout', { limit: 1 });
  assert.equal(p.era, 'generated'); assert.equal(p.provenance, 'ai');
  assert.ok(p.model && p.requestStyle, JSON.stringify({ model: p.model, requestStyle: p.requestStyle }));
});

test('characterhub yields pre-ChatGPT descriptions only', async () => {
  const parts = await collect('characterhub_com', { limit: 20 });
  assert.equal(parts.length, 20);
  assert.ok(parts.every(p => p.part === 'description' && p.era === 'pre-chatgpt' && p.text.trim()));
});

test('provenance parts take labels from provenance.csv', async () => {
  const parts = await collect('provenance');
  assert.ok(parts.length >= 100);
  assert.ok(parts.some(p => p.provenance === 'mixed') && parts.some(p => p.provenance === 'ai'));
  assert.ok(parts.every(p => ['human', 'ai', 'mixed'].includes(p.provenance)), 'card files with no provenance.csv row are skipped');
  assert.ok(parts.every(p => ['creator', 'peer', 'user', 'platform_tag', 'inferred'].includes(p.labelSource)));
});

test('real-world AI sets are labeled ai, with a creator and a date', async t => {
  const ids = Object.keys(SOURCES).filter(id => SOURCES[id].kind === 'real_ai' && id !== 'creator_statements');
  if (!ids.length) return t.skip('no private real-world AI sources on this machine');
  let checked = 0;
  for (const id of ids) {
    let parts; try { parts = await collect(id, { limit: 4 }); } catch (e) { if (/not found/.test(e.message)) continue; throw e; }
    assert.ok(parts.length && parts.every(p => p.provenance === 'ai' && p.creator && p.era !== 'unknown'), id);
    checked++;
  }
  assert.ok(checked > 0);
});

test('creator-statements cards carry the creator from the folder name', async () => {
  const parts = await collect('creator_statements', { limit: 10 });
  assert.ok(parts.length === 10 && parts.every(p => p.creator && p.provenance === 'unknown' && p.era !== 'unknown'));
});

test('a creator that was flattened from an object is dropped, not kept as "[object Object]"', async () => {
  const parts = await collect('rokos_basilisk');
  assert.ok(parts.length > 0);
  assert.ok(!parts.some(p => p.creator === '[object Object]'));
});
