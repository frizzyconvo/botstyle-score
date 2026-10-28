// _provenance.mjs - The provenance set: cards whose authorship is known or suspected, labeled in a manifest.
//
// The folder (card-datasets/provenance-split-dataset by default) holds card files (JSON / PNG) in any subfolders, plus
// provenance.csv with one row per card file:
//
//   file          path inside the folder, e.g. known-ai/Blanc.json
//   provenance    human | ai | mixed      who wrote the card (mixed: parts by each, or one edited by the other)
//   confidence    confirmed | suspected   confirmed = the creator says so (or it's your own card); suspected = inferred
//   ai_share      0–100, when the creator gives one ("60% AI")
//   ai_parts      what AI wrote, in the creator's words or by field (description, first_mes, profile, outline…)
//   model         the model, when known (ChatGPT, DeepSeek…)
//   source        where it came from (Botbooru, JanitorAI via datacat, own card…)
//   link          the card's page
//   evidence      why the label is what it is (creator note, tag, timeline…)
//
// Cards in the folder with no manifest row are scored as provenance "unknown" and listed by --check.
//   node tools/_provenance.mjs [--check]   prints the manifest as read, and cards missing from it
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { readCards } from './_card_sources.mjs';

export const PROVENANCE_DIR = process.env.BOTSTYLE_PROVENANCE ? resolve(process.env.BOTSTYLE_PROVENANCE)
  : resolve(fileURLToPath(new URL('../', import.meta.url)), '..', 'card-datasets', 'provenance-split-dataset');
export const PROVENANCE = ['human', 'ai', 'mixed'], CONFIDENCE = ['confirmed', 'suspected'];

// Small CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes.
export function parseCsv(text) {
  text = String(text).replace(/^\uFEFF/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return head ? body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()]))) : [];
}

export function readManifest(dir = PROVENANCE_DIR) {
  const p = join(dir, 'provenance.csv');
  return existsSync(p) ? parseCsv(readFileSync(p, 'utf-8').replace(/^﻿/, '')) : [];
}
function cardFiles(dir, base = dir) {
  return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? cardFiles(p, base) : /\.(json|png)$/i.test(f) ? [relative(base, p).replace(/\\/g, '/')] : []; });
}

/** Every card in the provenance folder, with its manifest labels as `prov`. */
export function* provenanceCards(dir = PROVENANCE_DIR) {
  const man = new Map(readManifest(dir).map(r => [r.file.replace(/\\/g, '/'), r]));
  for (const file of cardFiles(dir)) {
    const m = man.get(file) || {};
    let card; try { card = readCards(join(dir, file)).next().value; } catch { card = null; }
    if (!card) continue;
    const provenance = PROVENANCE.includes(m.provenance) ? m.provenance : 'unknown';
    yield { ...card, id: 'prov/' + file, prov: { provenance, confidence: CONFIDENCE.includes(m.confidence) ? m.confidence : null,
      aiShare: m.ai_share === '' || m.ai_share == null || isNaN(+m.ai_share) ? null : +m.ai_share, aiParts: m.ai_parts || null, model: m.model || null, source: m.source || null } };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const man = readManifest(), files = existsSync(PROVENANCE_DIR) ? cardFiles(PROVENANCE_DIR) : [];
  const listed = new Set(man.map(r => r.file.replace(/\\/g, '/')));
  console.log(`${PROVENANCE_DIR}\n${man.length} manifest rows, ${files.length} card files`);
  for (const r of man) console.log(`  ${r.provenance || '?'}/${r.confidence || '?'}${r.ai_share ? ` ${r.ai_share}%` : ''}  ${r.file}${files.includes(r.file.replace(/\\/g, '/')) ? '' : '   <- file not found'}`);
  const missing = files.filter(f => !listed.has(f));
  if (missing.length) { console.log(`Not in provenance.csv (scored as "unknown"):\n${missing.map(f => '  ' + f).join('\n')}`); if (process.argv.includes('--check')) process.exit(1); }
}
