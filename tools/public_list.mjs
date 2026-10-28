#!/usr/bin/env node
// public_list.mjs - Download, archive or clear the public list (Cloudflare KV namespace "bb-runs").
// Runs wrangler on your computer, so you need to be logged in to Cloudflare (dev\deploy-workers.cmd
// does the login). The namespace id is read from tools/wrangler-runs.toml.
//
//   node tools/public_list.mjs status            # how many entries, oldest and newest date
//   node tools/public_list.mjs download          # save a copy to public-list-archive/ (list unchanged)
//   node tools/public_list.mjs archive           # save a copy, keep it in KV as archive:<date>, then empty the list
//   node tools/public_list.mjs archive --before 2026-12-01   # only move entries older than that date
//   node tools/public_list.mjs clear             # empty the list WITHOUT keeping a copy (asks to confirm)
//   node tools/public_list.mjs archives          # list the archive:<date> keys kept in KV
//   add --dry-run to print the wrangler commands instead of running them
//
// Local copies go to public-list-archive/ next to the repo (outside git). The page only ever reads the
// "runs" key, so archived entries disappear from the page but stay recoverable.
import { helpIfAsked } from './_help.mjs';
helpIfAsked(import.meta.url);
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createInterface } from 'readline/promises';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, '..', 'public-list-archive');
const args = process.argv.slice(2), cmd = args.find(a => !a.startsWith('--')) || 'status';
const DRY = args.includes('--dry-run');
const before = args.includes('--before') ? args[args.indexOf('--before') + 1] : null;
const toml = readFileSync(join(ROOT, 'tools', 'wrangler-runs.toml'), 'utf-8');
const NS = (toml.match(/^\s*id\s*=\s*"([0-9a-f]{32})"/m) || [])[1];
if (!NS) { console.error('No KV namespace id found in tools/wrangler-runs.toml'); process.exit(2); }

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
function wrangler(...a) {
  const full = ['--yes', 'wrangler@3', ...a, `--namespace-id=${NS}`];
  if (DRY) { console.log('[dry-run] npx ' + full.join(' ')); return ''; }
  return execFileSync(npx, full, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' });
}
const getRuns = () => { const t = wrangler('kv:key', 'get', 'runs'); if (DRY) return []; try { return JSON.parse(t.trim() || '[]'); } catch { return []; } };
function putJson(key, value) {
  // write through a temp file: Windows command lines are too short for a big list
  const dir = mkdtempSync(join(tmpdir(), 'bbruns-')), f = join(dir, 'value.json');
  writeFileSync(f, JSON.stringify(value));
  wrangler('kv:key', 'put', key, `--path=${f}`);
}
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
function saveLocal(runs, tag) {
  mkdirSync(OUT, { recursive: true });
  const f = join(OUT, `runs-${tag}-${stamp()}.json`);
  if (!DRY) writeFileSync(f, JSON.stringify(runs, null, 1));
  console.log(`${DRY ? '[dry-run] would save' : 'Saved'} ${runs.length} entries to ${f}`);
}
const span = runs => runs.length ? `${runs[0].at?.slice(0, 10)} to ${runs[runs.length - 1].at?.slice(0, 10)}` : 'empty';

if (cmd === 'status') {
  const runs = getRuns(); console.log(`${runs.length} entries (${span(runs)})`);
} else if (cmd === 'download') {
  saveLocal(getRuns(), 'copy');
} else if (cmd === 'archive') {
  const runs = getRuns();
  const move = before ? runs.filter(r => String(r.at || '') < before) : runs, keep = before ? runs.filter(r => String(r.at || '') >= before) : [];
  if (!move.length && !DRY) { console.log('Nothing to archive.'); process.exit(0); }
  saveLocal(move, 'archive');
  const key = `archive:${new Date().toISOString().slice(0, 10)}`;
  putJson(key, move); console.log(`Kept ${move.length} entries in KV as ${key}`);
  putJson('runs', keep); console.log(`Public list now has ${keep.length} entries.`);
} else if (cmd === 'clear') {
  if (!DRY && !args.includes('--yes')) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question('Empty the public list without keeping a copy? Type "clear" to confirm: '); rl.close();
    if (a.trim() !== 'clear') { console.log('Cancelled.'); process.exit(0); }
  }
  putJson('runs', []); console.log('Public list emptied.');
} else if (cmd === 'archives') {
  const t = wrangler('kv:key', 'list', '--prefix=archive:'); if (!DRY) for (const k of JSON.parse(t || '[]')) console.log(k.name);
} else { console.error(`Unknown command "${cmd}". See --help.`); process.exit(2); }
