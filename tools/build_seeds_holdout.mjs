#!/usr/bin/env node
// build_seeds_holdout.mjs - Characters for the AI hold-out: seeds_wide characters that no generated card has used yet
// (by seed id or name), so hold-out cards share neither model family nor character with the cards the lists were mined
// from. Writes eval/inputs/seeds_holdout.jsonl. Run before dev\generate-cards-holdout.cmd; safe to rerun (the hold-out
// file's own seeds are kept, so later rounds don't reshuffle the characters already used).
//   node tools/build_seeds_holdout.mjs
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { PATHS } from './_paths.mjs';
const rd = f => existsSync(f) ? readFileSync(f, 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
if (existsSync(PATHS.seedsHoldout)) { console.log(`${PATHS.seedsHoldout} exists (${rd(PATHS.seedsHoldout).length} characters); kept as is`); process.exit(0); }
const usedId = new Set(), usedName = new Set();
for (const c of [...rd(PATHS.aiCardsV1), ...rd(PATHS.aiCardsV2)]) { if (c.seed_id) usedId.add(String(c.seed_id)); if (c.seed_name) usedName.add(c.seed_name.trim().toLowerCase()); }
const pool = rd(PATHS.seedsWide).filter(s => !usedId.has(String(s.id)) && !usedName.has(String(s.name || '').trim().toLowerCase()) && (s.description || '').trim());
if (!pool.length) { console.error('no unused characters in ' + PATHS.seedsWide); process.exit(1); }
writeFileSync(PATHS.seedsHoldout + '.tmp', pool.map(s => JSON.stringify(s)).join('\n') + '\n'); renameSync(PATHS.seedsHoldout + '.tmp', PATHS.seedsHoldout);
console.log(`${pool.length} unused characters -> ${PATHS.seedsHoldout}`);
